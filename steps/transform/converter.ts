import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import imagemin from 'imagemin'

import imageminSvgo from 'imagemin-svgo'
import { Presets, SingleBar } from 'cli-progress'
import imageminGifsicle from 'imagemin-gifsicle'
import imageminPngcrush from 'imagemin-pngcrush'
import imageminJpegoptim from 'imagemin-jpegoptim'

import { log } from '../../lib/logger.js'
import { barOptions } from '../../lib/common.js'
import { Transformer } from '../../lib/classes.js'
import { extractBase64, removeStrings, modifyHTML } from './utils.js'
dotenv.config()

const inDir = 'state/get/'
const outDir = 'state/transform/'
const workers = process.env.PHET_WORKERS !== undefined ? parseInt(process.env.PHET_WORKERS, 10) : 10

export const convertImages = async (): Promise<void> => {
  log.info('Converting images...')
  const transformer = new Transformer({
    source: `${inDir}/*.{jpg,jpeg,png,svg}`,
    bar: new SingleBar(barOptions, Presets.shades_classic),
    workers,
    handler: async (file) =>
      imagemin([file], {
        destination: outDir,
        glob: false,
        plugins: [imageminJpegoptim(), imageminPngcrush(), imageminSvgo(), imageminGifsicle()],
      }),
  })
  await transformer.transform()
}

export const convertDocuments = async (): Promise<void> => {
  log.info('Converting documents...')
  const transformer = new Transformer({
    verbose: true,
    source: `${inDir}/*.html`,
    bar: new SingleBar(barOptions, Presets.shades_classic),
    workers,
    handler: async (file) => {
      let data = await fs.promises.readFile(file, 'utf8')
      const basename = path.basename(file)
      data = await extractBase64(basename, data)
      data = removeStrings(data)
      data = await modifyHTML(basename, data)
      await fs.promises.writeFile(`${outDir}${basename}`, data, 'utf8')
    },
  })
  await transformer.transform()
}

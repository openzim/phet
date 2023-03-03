import * as fs from 'fs'
import md5 from 'md5'
import * as path from 'path'
import * as dotenv from 'dotenv'
import * as cheerio from 'cheerio'
import imagemin from 'imagemin'

import * as minifier from 'html-minifier'
import imageminSvgo from 'imagemin-svgo'
import { Presets, SingleBar } from 'cli-progress'
import imageminGifsicle from 'imagemin-gifsicle'
import imageminPngcrush from 'imagemin-pngcrush'
import imageminJpegoptim from 'imagemin-jpegoptim'

import { log } from '../lib/logger.js'
import welcome from '../lib/welcome.js'
import { barOptions } from '../lib/common.js'
import { Base64Entity, Transformer } from '../lib/classes.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { loadingImage } from '../res/templates/loading-image.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const inDir = 'state/get/'
const outDir = 'state/transform/'
const workers = process.env.PHET_WORKERS !== undefined ? parseInt(process.env.PHET_WORKERS, 10) : 10
const verbose = process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false

const convertImages = async (): Promise<void> => {
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

const convertDocuments = async (): Promise<void> => {
  log.info('Converting documents...')
  const transformer = new Transformer({
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

const modifyHTML = async (fileName, html): Promise<string> => {
  const simScript = await fs.promises.readFile(path.join(__dirname, '../res/js/sim.js'), 'utf8')
  const simCss = await fs.promises.readFile(path.join(__dirname, '../res/css/sim.css'), 'utf8')
  const $ = cheerio.load(html)
  $('meta[property^="og:"]').remove()
  $('img#splash').attr('src', loadingImage)
  $('script').last().after(`<script>${simScript}</script>`)
  $('head').append(`<style>${simCss}</style>`)
  await Promise.all(
    $('script')
      .each((indx, elem: cheerio.Element) => {
        const script = $(elem).html().trim()
        const scriptId = $(elem).attr('id')
        if ((scriptId && scriptId.search('google-analytics') > -1) || script.search('google-analytics.com') > -1) {
          $(elem).remove()
          return
        }
        if (script) {
          const newFileName = `${md5(script)}.js`
          $(elem).attr('src', newFileName)
          $(elem).html('')
          try {
            fs.promises.writeFile(`${outDir}${newFileName}`, script, 'utf8')
          } catch (e) {
            if (verbose) {
              log.error(`Failed to extract script from ${fileName}`)
              log.error(e)
            } else {
              log.warn(`Unable to extract script from ${fileName}. Skipping it.`)
            }
          }
        }
      })
      .toArray(),
  )
  return $.html()
}

const removeStrings = (html): string => {
  html = html.replace(/(\/\/ This simulation uses following third-party resources.*?)(window\.phet\.chipper\.strings)/gms, '$2')
  html = minifier.minify(html, { removeComments: true })
  return html
}

const extractBase64 = async (fileName, html): Promise<string> => {
  const b64files = html.match(/( src=)?'data:([A-Za-z-+/]+);base64,[^']*/g)

  await Promise.all(
    (b64files || []).map(async (b64entry) => {
      const isInSrc = b64entry.slice(0, 6) === ' src="'
      b64entry = b64entry.slice(isInSrc ? 6 : 1)

      const b64element = new Base64Entity(b64entry)
      if (b64element.isEmpty()) return html

      const fileExt = path.extname(b64element.mimeType).slice(1)
      if (['ogg', 'mpeg'].includes(fileExt)) return html

      const newName = md5(b64element.data)
      html.replace(b64entry, `${newName}.${fileExt}`)

      await fs.promises.writeFile(`${outDir}${newName}.${fileExt}`, b64element.data, { encoding: 'base64' })
      await fs.promises.writeFile(`${outDir}${fileName}`, html, 'utf8')
    }),
  )

  return html
}

;(async () => {
  welcome('transform')
  await convertImages()
  await convertDocuments()
  log.info('Done.')
})().catch((err: Error) => {
  if (err && err.message) {
    log.error(err.message)
  } else {
    log.error(`An unidentified error occured ${err}`)
  }
  yargs(hideBin(process.argv)).exit(1, err)
})

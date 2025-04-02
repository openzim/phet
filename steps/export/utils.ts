import * as fs from 'fs'
import { glob } from 'glob'
import * as path from 'path'
import yargs from 'yargs'
import * as dotenv from 'dotenv'
import * as cheerio from 'cheerio'
import { log } from '../../lib/logger.js'
import { Presets, SingleBar } from 'cli-progress'
import { hideBin } from 'yargs/helpers'
import { fileURLToPath } from 'url'
import { LanguageDescriptor, LanguageItemPair } from '../../lib/types.js'
import { ContentProvider, Blob } from '@openzim/libzim/dist/index.js'
import { formatLanguages } from 'steps/utils.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const argv: any = yargs(hideBin(process.argv)).string('includeLanguages').string('excludeLanguages').boolean('mulOnly').boolean('createMul').argv

export const options = {
  catalogsDir: 'state/get/catalogs',
  inDir: 'state/transform/',
  outDir: 'state/export/',
  resDir: 'res/',
  verbose: process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false,
  mulOnly: argv.mulOnly,
  createMul: argv.createMul,
}

export const loadLanguages = async (): Promise<LanguageItemPair<LanguageDescriptor>> => {
  const langsFile = await fs.promises.readFile(path.join(__dirname, '../../state/get/languages.json'))
  const langs = JSON.parse(langsFile.toString())

  return Object.entries(langs).reduce((acc, [key, value]) => {
    if (argv.includeLanguages && !formatLanguages(argv.includeLanguages).includes(key)) return acc
    if (argv.excludeLanguages && formatLanguages(argv.excludeLanguages).includes(key)) return acc // noinspection RedundantIfStatementJS
    return { ...acc, [key]: value }
  }, {})
}

export const extractResources = async (target, targetDir: string): Promise<void> => {
  const bar = new SingleBar({}, Presets.shades_classic)
  const files = glob.sync(`${options.inDir}/*_@(${target.languages.join('|')}).html`, {})
  bar.start(files.length, 0)

  for (const file of files) {
    try {
      const html = await fs.promises.readFile(file, 'utf8')
      const $ = cheerio.load(html)

      const filesToExtract = $('[src]')
        .toArray()
        .map((a) => $(a).attr('src'))
      await fs.promises.copyFile(`${file.split('_')[0]}.png`, `${targetDir}${path.basename(file).split('_')[0]}.png`)

      await Promise.all(
        filesToExtract.map(async (fileName) => {
          if (fileName.length > 40 || fileName.search(/this\.image/) !== -1) return
          await fs.promises.copyFile(`${options.inDir}${fileName}`, `${targetDir}${path.basename(fileName)}`)
        }),
      )
      await fs.promises.writeFile(`${targetDir}${path.basename(file)}`, html, 'utf8')
    } catch (e) {
      if (options.verbose) {
        log.error(`Failed to extract resources from: ${file}`)
        log.error(e)
      } else {
        log.warn(`Unable to extract resources from: ${file}. Skipping it.`)
      }
    } finally {
      bar.increment()
      if (!process.stdout.isTTY) log.info(` + ${path.basename(file)}`)
    }
  }
  bar.stop()
}

export const createFileContentProvider = (filename: string): ContentProvider => {
  let dataSent = false
  const data = fs.readFileSync(filename)
  return {
    size: data.length,
    feed: () => {
      if (!dataSent) {
        dataSent = true
        return new Blob(fs.readFileSync(filename))
      }
      return new Blob()
    },
  }
}

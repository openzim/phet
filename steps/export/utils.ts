import * as fs from 'fs'
import glob from 'glob'
import * as path from 'path'
import yargs from 'yargs'
import { promisify } from 'util'
import rimraf from 'rimraf'
import * as dotenv from 'dotenv'
import * as cheerio from 'cheerio'
import { log } from '../../lib/logger.js'
import { Presets, SingleBar } from 'cli-progress'
import { hideBin } from 'yargs/helpers'
import { fileURLToPath } from 'url'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const { argv } = yargs(hideBin(process.argv)).array('includeLanguages').array('excludeLanguages').boolean('mulOnly')

const namespaces = {
  // ico: '-',
  js: '-',
  css: '-',
  svg: 'I',
  png: 'I',
  jpg: 'I',
  jpeg: 'I',
  html: 'A',
}

const getKiwixPrefix = (ext: string): string => `../${getNamespaceByExt(ext)}/`

const addKiwixPrefixes = (file) => {
  const resources = file.match(/[0-9a-f]{32}\.(svg|jpg|jpeg|png|js)/g) || []
  return resources.reduce((file, resName) => {
    const ext = path.extname(resName).slice(1)
    return file.replace(resName, `${getKiwixPrefix(ext)}${resName}`)
  }, file)
}

export const options = {
  catalogsDir: 'state/get/catalogs',
  inDir: 'state/transform/',
  outDir: 'state/export/',
  resDir: 'res/',
  verbose: process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false,
  mulOnly: argv.mulOnly,
}

export const rimrafPromised = promisify(rimraf)

export const getNamespaceByExt = (ext: string): string => namespaces[ext] || '-'

export const loadLanguages = async () => {
  const langsFile = await fs.promises.readFile(path.join(__dirname, '../../state/get/languages.json'))
  const langs = JSON.parse(langsFile.toString())

  return Object.entries(langs).reduce((acc, [key, value]) => {
    if (argv.includeLanguages && !((argv.includeLanguages as string[]) || []).includes(key)) return acc
    if (argv.excludeLanguages && ((argv.excludeLanguages as string[]) || []).includes(key)) return acc // noinspection RedundantIfStatementJS
    return { ...acc, [key]: value }
  }, {})
}

export const extractResources = async (target, targetDir: string): Promise<void> => {
  const bar = new SingleBar({}, Presets.shades_classic)
  const files = glob.sync(`${options.inDir}/*_@(${target.languages.join('|')}).html`, {})
  bar.start(files.length, 0)

  for (const file of files) {
    try {
      let html = await fs.promises.readFile(file, 'utf8')
      const $ = cheerio.load(html)

      const filesToExtract = $('[src]')
        .toArray()
        .map((a) => $(a).attr('src'))
      await fs.promises.copyFile(`${file.split('_')[0]}.png`, `${targetDir}${path.basename(file).split('_')[0]}.png`)

      await Promise.all(
        filesToExtract.map(async (fileName) => {
          if (fileName.length > 40 || fileName.search(/this\.image/) !== -1) return
          const ext = path.extname(fileName).slice(1)
          html = html.replace(fileName, `${getKiwixPrefix(ext)}${fileName}`)

          let file = await fs.promises.readFile(`${options.inDir}${fileName}`, 'utf8')
          file = addKiwixPrefixes(file)
          return fs.promises.writeFile(`${targetDir}${path.basename(fileName)}`, file, 'utf8')
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

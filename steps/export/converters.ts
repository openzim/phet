import * as fs from 'fs'
import { glob } from 'glob'
import * as path from 'path'
import { Compression, Creator, StringItem } from '@openzim/libzim'
import { log } from '../../lib/logger.js'
import { Target } from '../../lib/types.js'
import { Catalog } from '../../lib/classes.js'
import { getISO6393 } from '../../lib/common.js'
import { Presets, SingleBar } from 'cli-progress'
import { catalogJs } from '../../res/templates/catalog.js'
import Banana from 'banana-i18n'
import { options, extractResources, loadLanguages, createFileContentProvider } from './utils.js'
import { rimraf } from 'rimraf'
import { fileURLToPath } from 'url'
import mime from 'mime-types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const languages = await loadLanguages()
const zimOutDir = options.zimOutDir || 'output'

export const loadTranslations = async (locale: string) => {
  try {
    const translations = await fs.promises.readFile(path.join(__dirname, `../../res/js/i18n/${locale}.json`))
    return JSON.parse(translations.toString())
  } catch (err) {
    if (err?.name.includes('SyntaxError')) {
      throw new Error(`Can't parse translations file: ${locale}.json. `)
    }
    return {}
  }
}

export const exportTarget = async (target: Target, bananaI18n: Banana) => {
  const mainIso6393LanguageCode = target.languages.length > 1 ? 'mul' : getISO6393(target.languages[0]) || 'mul'
  const zimnameLanguageCode = target.languages.length > 1 ? 'mul' : target.languages[0]

  const iso6393LanguageCodes = target.languages.map(getISO6393)

  const zimname = `phet_${zimnameLanguageCode}_${target.selection}`
  const filename = `${zimname}_${target.datePostfix}`

  const catalog = new Catalog({ target, languages, catalogsDir: options.catalogsDir })
  await catalog.init()
  if (catalog.isEmpty()) {
    log.info(`Skipping ${filename}.zim (empty)`)
    return
  }

  const targetDir = `${options.outDir}${filename}/`

  await rimraf(targetDir)
  await fs.promises.mkdir(targetDir)
  await extractResources(target, targetDir)

  // Generate index file
  await fs.promises.copyFile(options.resDir + 'template.html', targetDir + 'index.html')

  // Generate catalog JS
  await fs.promises.writeFile(targetDir + 'catalog.js', catalogJs(catalog, filename), 'utf8')

  await Promise.all(
    glob
      .sync(`${options.resDir}/**/*`, {
        ignore: ['*/templates/*', '*.ts', '*/template.html'],
        nodir: true,
      })
      .map(async (file) => fs.promises.copyFile(file, `${targetDir}${path.basename(file)}`)),
  )

  let locale = target.languages.length > 1 ? 'en' : target.languages[0]
  if (locale !== 'en') {
    const translations = await loadTranslations(locale)

    locale = locale.replace('_', '-').toLowerCase()
    bananaI18n.load(translations, locale)
  }
  bananaI18n.setLocale(locale)

  log.info(`Creating ${filename}.zim ...`)

  await fs.promises.mkdir(`${zimOutDir}`, { recursive: true })
  log.info(`Output to '${zimOutDir}' directory`)

  const creator = new Creator()
  creator.configIndexing(false, target.languages.length > 1 ? 'eng' : mainIso6393LanguageCode)
  creator.configCompression(Compression.Zstd)
  creator.startZimCreation(`${zimOutDir}/${filename}.zim`)

  creator.setMainPath('index.html')

  const metadata = {
    Name: zimname,
    Title: bananaI18n.getMessage('zim-title'),
    Description: bananaI18n.getMessage('zim-description'),
    Creator: 'University of Colorado',
    Publisher: 'openZIM',
    Language: iso6393LanguageCodes.join(','),
    Date: `${target.date.getUTCFullYear()}-${(target.date.getUTCMonth() + 1).toString().padStart(2, '0')}-${target.date.getUTCDate().toString().padStart(2, '0')}`,
    Tags: '_category:phet;_pictures:yes;_videos:no',
    Source: `https://phet.colorado.edu/${target.languages[0]}/simulations/`,
    Scraper: 'openzim/phet',
  }
  for (const [name, content] of Object.entries(metadata)) {
    creator.addMetadata(name, content)
  }

  creator.addIllustration(48, createFileContentProvider(targetDir + 'favicon.png'))

  const bar = new SingleBar({}, Presets.shades_classic)
  const files = glob.sync(`${targetDir}/*`, {})
  bar.start(files.length, 0)

  for (const file of files) {
    await creator.addItem(
      new StringItem(
        path.basename(file),
        mime.lookup(path.basename(file)) || 'application/octet-stream',
        catalog.getTitle(path.basename(file)),
        {
          FRONT_ARTICLE: file.split('.').pop() === 'html' ? 1 : 0,
        },
        await fs.promises.readFile(file),
      ),
    )
    bar.increment()
  }
  bar.stop()
  await creator.finishZimCreation()
  log.info('Created.')
}

export const convertTranslations = async () => {
  log.info('Converting translations to JS')

  const bar = new SingleBar({}, Presets.shades_classic)
  const translationsFolder = path.join(__dirname, '../../res/js/i18n/')
  const files = glob.sync(`${translationsFolder}**/*.json`, {})
  bar.start(files.length, 0)

  for (const file of files) {
    try {
      const translations = await fs.promises.readFile(file, 'utf8')
      const jsTranslations = `window.phetTranslations = ${translations};`
      await fs.promises.writeFile(`${file}.js`, jsTranslations, 'utf8')
    } catch (e) {
      if (options.verbose) {
        log.error(`Failed to extract translations from: ${file}`)
        log.error(e)
      } else {
        log.warn(`Unable to extract translations from: ${file}. Skipping it.`)
      }
    } finally {
      bar.increment()
      if (!process.stdout.isTTY) log.info(` + ${path.basename(file)}`)
    }
  }
  bar.stop()
  log.info('Converted.')
}

export const prepareTargets = () => {
  const now = new Date()
  const datePostfix = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`

  const targets: Target[] = []
  const selection: string = options.all ? 'all' : Object.values(options.cats).join('-')

  if (options.mulOnly || options.createMul) {
    targets.push({
      selection,
      datePostfix,
      date: now,
      languages: Object.keys(languages),
      subjects: Object.values(options.cats),
    })
  }

  if (!options.mulOnly) {
    for (const { slug } of Object.values(languages)) {
      targets.push({
        selection,
        datePostfix,
        date: now,
        languages: [slug],
        subjects: Object.values(options.cats),
      })
    }
  }

  return targets
}

import * as fs from 'fs'
import glob from 'glob'
import * as path from 'path'
import { ZimArticle, ZimCreator } from '@openzim/libzim'
import { log } from '../../lib/logger.js'
import { Target } from '../../lib/types.js'
import { Catalog } from '../../lib/classes.js'
import { getISO6393 } from '../../lib/common.js'
import { Presets, SingleBar } from 'cli-progress'
import { catalogJs } from '../../res/templates/catalog.js'
import Banana from 'banana-i18n'
import { iso6393To1 } from 'iso-639-3'
import { options, rimrafPromised, extractResources, loadLanguages, getNamespaceByExt } from './utils.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const languages = await loadLanguages()

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
  const targetDir = `${options.outDir}${target.output}/`

  await rimrafPromised(targetDir)
  await fs.promises.mkdir(targetDir)
  await extractResources(target, targetDir)

  const catalog = new Catalog({ target, languages, catalogsDir: options.catalogsDir })
  await catalog.init()
  if (catalog.isEmpty()) {
    log.info(`Skipping ${target.output}.zim (empty)`)
    return
  }

  // Generate index file
  await fs.promises.copyFile(options.resDir + 'template.html', targetDir + 'index.html')

  // Generate catalog JS
  await fs.promises.writeFile(targetDir + 'catalog.js', catalogJs(catalog, target.output), 'utf8')

  await Promise.all(
    glob
      .sync(`${options.resDir}/**/*`, {
        ignore: ['*/templates/*', '*.ts', '*/template.html'],
        nodir: true,
      })
      .map(async (file) => fs.promises.copyFile(file, `${targetDir}${path.basename(file)}`)),
  )

  const iso6393LanguageCode = target.languages.length > 1 ? 'mul' : getISO6393(target.languages[0]) || 'mul'
  const iso6391LanguageCode = target.languages.length > 1 ? 'mul' : iso6393To1[iso6393LanguageCode]

  const iso6393LanguageCodes = target.languages.map(getISO6393)

  let locale = iso6393LanguageCode === 'mul' ? 'en' : target.languages[0]
  if (locale !== 'en') {
    const translations = await loadTranslations(locale)

    locale = locale.replace('_', '-').toLowerCase()
    bananaI18n.load(translations, locale)
  }
  bananaI18n.setLocale(locale)

  log.info(`Creating ${target.output}.zim ...`)

  const creator = new ZimCreator(
    {
      fileName: `./dist/${target.output}.zim`,
      welcome: 'index.html',
      fullTextIndexLanguage: iso6393LanguageCode,
      compression: 'zstd',
    },
    {
      Name: `phets_${iso6391LanguageCode}_all`,
      Title: bananaI18n.getMessage('zim-title'),
      Description: bananaI18n.getMessage('zim-description'),
      Creator: 'University of Colorado',
      Publisher: 'openZIM',
      Language: iso6393LanguageCodes.join(','),
      Date: `${target.date.getUTCFullYear()}-${(target.date.getUTCMonth() + 1).toString().padStart(2, '0')}-${target.date.getUTCDate().toString().padStart(2, '0')}`,
      Tags: '_category:phet;_pictures:yes;_videos:no',
      // the following two metadata keys don't supported by ZimCreator yet, so that we have to ts-ignore them
      // todo: remove this further
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      Source: `https://phet.colorado.edu/${target.languages[0]}/simulations/`,
      Scraper: 'openzim/phet',
    },
  )

  const bar = new SingleBar({}, Presets.shades_classic)
  const files = glob.sync(`${targetDir}/*`, {})
  bar.start(files.length, 0)

  for (const file of files) {
    await creator.addArticle(
      new ZimArticle({
        url: path.basename(file),
        title: catalog.getTitle(path.basename(file)),
        data: await fs.promises.readFile(file),
        ns: getNamespaceByExt(path.extname(file).slice(1)),
        shouldIndex: file.split('.').pop() === 'html' ? true : false,
      }),
    )
    bar.increment()
  }
  bar.stop()
  await creator.finalise()
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

  const targets: Target[] = [
    {
      output: `phet_mul_all_${datePostfix}`,
      date: now,
      languages: Object.keys(languages).filter((lang) => {
        const langCode = /^(\w{2})_/gm.exec(lang)?.pop()
        return !langCode || !Object.keys(languages).includes(langCode)
      }),
    },
  ]
  if (!options.mulOnly) {
    for (const { langCode, slug } of Object.values(languages)) {
      targets.push({
        output: `phet_${langCode.toLowerCase().replace('_', '-')}_all_${datePostfix}`,
        date: now,
        languages: [slug],
      })
    }
  }

  return targets
}

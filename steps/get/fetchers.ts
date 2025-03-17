import got from 'got'
import * as fs from 'fs'
import * as path from 'path'
import slugify from 'slugify'
import op from 'object-path'
import * as cheerio from 'cheerio'
import ISO6391 from 'iso-639-1'
import { Presets, SingleBar } from 'cli-progress'
import { log } from '../../lib/logger.js'
import { cats, rootCategories } from '../../lib/const.js'
import { SimulationsList } from '../../lib/classes.js'
import { barOptions, getISO6393 } from '../../lib/common.js'
import type { Category, LanguageDescriptor, LanguageItemPair, Meta, Simulation } from '../../lib/types.js'
import options from './options.js'
import { popValueUpIfExists, delay, downloadCatalogData } from './utils.js'

const languages: LanguageItemPair<LanguageDescriptor> = {}
let meta: Meta
const simsTree = {}
const categoriesList: LanguageItemPair<any> = {}

export const fetchMetaAndLanguages = async (): Promise<void> => {
  meta = JSON.parse((await got('services/metadata/1.3/simulations?format=json&summary', { ...options.gotOptions })).body)
  // Filter projects we want to consider
  const selectedProjects = meta.projects.filter(({ type }) => type === 2)

  const langSlugs = Array.from(
    new Set(
      selectedProjects
        .map((project) => project.simulations)
        .reduce((acc, sims) => acc.concat(sims), [])
        .map((sim) => Object.keys(sim.localizedSimulations))
        .reduce((acc, keys) => acc.concat(keys), []),
    ),
  )

  langSlugs.forEach((slug) => {
    if (!getISO6393(slug)) {
      throw new Error(`Failed to map language "${slug}" into ISO639-3.`)
    }

    const url = `https://phet.colorado.edu/en/simulations/filter?locale=${slug}&type=html`

    const name = ISO6391.getName(slug)
    const localName = ISO6391.getNativeName(slug)

    const count = selectedProjects
      .map((project) => project.simulations)
      .reduce((acc, sims) => acc.concat(sims), [])
      .map((sim) => (Object.keys(sim.localizedSimulations).includes(slug) ? 1 : 0))
      .reduce((sum, value) => sum + value, 0)

    if (options.includeLanguages && !((options.includeLanguages as string[]) || []).includes(slug)) return
    if (options.excludeLanguages && ((options.excludeLanguages as string[]) || []).includes(slug)) return

    if (options.withoutLanguageVariants && slug.includes('_')) {
      const langCode = slug.split('_')[0]
      if (slug === 'zh_CN') {
        log.info(`Using ${slug} simulations for ${langCode} language`)
        op.set(languages, slug, { slug, langCode, name, localName, url, count })
        return
      }

      const existedLanguageKey = Object.keys(languages).find((language) => language.split('_')[0] === langCode)
      if (existedLanguageKey && languages[existedLanguageKey].count < count) {
        delete languages[existedLanguageKey]
        log.info(`Using ${slug} simulations for ${langCode} language`)
        op.set(languages, slug, { slug, langCode, name, localName, url, count })
      } else {
        log.info(`Skipping ${slug} language`)
      }
      return
    }

    if (!Object.keys(languages)?.includes(slug)) {
      op.set(languages, slug, { slug, name, localName, url, count, langCode: slug })
    }
  })
  try {
    await fs.promises.writeFile(`${options.outDir}languages.json`, JSON.stringify(languages), 'utf8')
    log.info(`Got ${Object.keys(languages).length} languages`)
  } catch (e) {
    log.error('Failed to save languages')
    log.error(e)
  }

  meta.count = Object.values(selectedProjects).reduce(
    (acc, { simulations }) => acc + simulations.reduce((c, sim) => c + Object.keys(sim.localizedSimulations).filter((lang) => Object.keys(languages)?.includes(lang)).length, 0),
    0,
  )
}

export const fetchCategoriesTree = async (): Promise<void> => {
  log.info('Getting category trees...')
  const fallbackLanguages = new Set()
  await Promise.all(
    popValueUpIfExists(Object.keys(languages), 'en').map(async (lang) =>
      Promise.all(
        rootCategories.map(async (categoryTitle) => {
          try {
            await delay()
            const categorySlug = slugify(categoryTitle, { lower: true })
            const $ = cheerio.load((await got(`${lang}/simulations/filter?locale=en&subjects=${categorySlug}&sort=alpha&view=list`, { ...options.gotOptions })).body)

            const translatedCat = $('.regular-page-title').text().split('  ')?.shift() || categoryTitle
            op.set(categoriesList, `${lang}.${translatedCat}`, `${categorySlug}`)
            log.debug(`+ [${lang}] ${categorySlug}`)

            // gather sub-categories
            const x = $('.subjects ul.checkboxes li [role=checkbox]').toArray()
            return x.map((item) => {
              const slug = $(item).attr('id').replace('-checkbox', '')
              const title = $(item).children().text()
              op.set(categoriesList, `${lang}.${translatedCat} / ${title}`, `${categorySlug}/${slug}`)
            })
          } catch (e) {
            fallbackLanguages.add(lang)
            return
          }
        }),
      ),
    ),
  )
  if (fallbackLanguages.size > 0) {
    log.warn(`The following (${fallbackLanguages.size}) language(s) will use english metadata: ${Array.from(fallbackLanguages).join(', ')}`)
    for (const lang of Array.from(fallbackLanguages)) {
      op.set(categoriesList, lang, categoriesList.en)
    }
  }
}

export const fetchSimsList = async (): Promise<void> => {
  await Promise.all(
    Object.entries(categoriesList).map(async ([lang, subcats]) =>
      Promise.all(
        Array.from(new Set(Object.entries(subcats))).map(async ([subCatTitle, subCatSlug]) => {
          try {
            await delay()

            const catId = parseInt(Object.keys(cats)[Object.values(cats).indexOf((subCatSlug as string).split('/').pop())], 10)

            const simsInCat = Object.values(meta.projects).filter((item) => item.type === 2 && item.simulations[0]?.subjects?.includes(catId))

            log.debug(` - [${lang}] ${subCatSlug}: ${simsInCat.length}`)

            simsInCat.map((item) => {
              const slug = item.simulations[0]?.name
              op.push(simsTree, `${lang}.${slug}`, subCatTitle)
            })
          } catch (e) {
            if (options.verbose) {
              log.error(`Failed to get subcategories for ${lang}`)
              log.error(e)
            } else {
              log.warn(`Unable to get simulations under subcategory subCatSlug for language ${lang}. Skipping it.`)
            }
          }
        }),
      ),
    ),
  )
}

export const fetchCatalogsWithUrls = async (bar) => {
  const getItemCategories = (lang: string, slug: string): Category[] => {
    // fallback to english
    const categoryTitles = op.get(simsTree, `${lang}.${slug}`, op.get(simsTree, `en.${slug}`))
    return categoryTitles
      ? categoryTitles.map((title) => ({
          title,
          slug: categoriesList[title] ?? slugify(title, { lower: true }),
        }))
      : []
  }
  const catalogs: LanguageItemPair<SimulationsList> = {}
  const urlsToGet = []

  await Promise.all(
    Object.values(meta.projects).map(async (project) => {
      if (project.type !== 2) return
      for (const sim of Object.values(project.simulations)) {
        for (const [lang, { title }] of Object.entries(sim.localizedSimulations)) {
          if (!Object.keys(simsTree)?.includes(lang)) continue

          await delay()

          if (!catalogs[lang]) catalogs[lang] = new SimulationsList(lang)

          let fallback = false
          const url = `${lang}/simulation/${sim.name}`
          try {
            const response = await downloadCatalogData(url, sim.name)
            fallback = response.fallback

            if (!response.body) throw new Error(`Got no data (status = ${response.status}) from ${options.gotOptions.prefixUrl}${url}`)
            const $ = cheerio.load(response.body)
            const realId = sim.name

            catalogs[lang].add({
              categories: getItemCategories(lang, realId),
              id: realId,
              language: lang,
              title: title || $('meta[name="og:title"]').attr('content'),
              topics: [], // See https://github.com/openzim/phet/issues/155 for more details
              description: $('meta[name="description"]').attr('content'),
            } as Simulation)
            const htmlUrl = `https://phet.colorado.edu/sims/html/${realId}/latest/${realId}_${lang}.html`
            if (!urlsToGet.some((e) => e.url === htmlUrl)) {
              urlsToGet.push({ id: realId, lang, url: htmlUrl })
            }
            const pngUrl = `https://phet.colorado.edu/sims/html/${realId}/latest/${realId}-${options.imageResolution}.png`
            if (!urlsToGet.some((e) => e.url === pngUrl)) {
              urlsToGet.push({ id: realId, lang, url: pngUrl })
            }
          } catch (e) {
            if (options.verbose) {
              log.error(`Failed to parse: ${options.gotOptions.prefixUrl}${url}`)
              log.error(e)
            } else {
              log.warn(`Unable to get the simulation ${sim.name} for language ${lang}. Skipping it.`)
            }
          }
          bar.increment(1, { prefix: '', postfix: `${lang} / ${sim.name}` })
          if (!process.stdout.isTTY) log.info(`+ [${lang}${fallback ? ' > en' : ''}] ${sim.name}`)
        }
      }
    }),
  )
  return { catalogs, urlsToGet }
}

export const fetchSims = async (): Promise<void> => {
  log.info('Gathering sim links...')
  const bar = new SingleBar(barOptions, Presets.shades_classic)
  bar.start(meta.count, 0)

  const { catalogs, urlsToGet } = await fetchCatalogsWithUrls(bar)

  bar.stop()

  log.info('Getting documents and images...')
  bar.start(urlsToGet.length, 0)

  const simsToDelete: { lang: string; id: string }[] = []
  await Promise.all(
    urlsToGet.map(async ({ url, id, lang }) => {
      await delay()
      return new Promise(async (resolve, reject) => {
        let data
        try {
          data = await got.stream(url, { throwHttpErrors: false })
        } catch (e) {
          simsToDelete.push({ id, lang })
          if (options.verbose) {
            const status = op.get(e, 'response.status')
            log.error(`Failed to get url ${options.gotOptions.prefixUrl}${url}: status = ${status}`)
            log.error(e)
            return
          } else {
            log.warn(`Unable to get simulation data from ${url}. Skipping it.`)
            return
          }
        }
        let fileName = url.split('/').pop()
        if (fileName.slice(-4) === '.png') {
          const fileParts = fileName.split('-')
          fileName = fileParts.slice(0, -1).join('-') + '.png'
        }
        const writeStream = fs.createWriteStream(options.outDir + fileName).on('close', () => {
          bar.increment(1, { prefix: '', postfix: fileName })
          if (!process.stdout.isTTY) log.info(` + ${path.basename(fileName)}`)
          resolve()
        })

        data
          .on('response', function (response) {
            if (simsToDelete.length > options.failedDownloadsCountBeforeStop) {
              reject(new Error(`Stopped because the count of failed simulation downloads is higher than ${options.failedDownloadsCountBeforeStop}.`))
            }
            if (response.statusCode === 200) return
            log.error(`${fileName} gave a ${response.statusCode}`)
            simsToDelete.push({ id, lang })

            fs.unlink(options.outDir + fileName, function (err) {
              if (err) log.error(`Failed to delete item: ${err}`)
            })
            if (options.verbose) {
              const status = op.get(response, 'statusCode')
              log.warn(`Failed to get url ${options.gotOptions.prefixUrl}${url}: status = ${status}`)
            } else {
              log.warn(`Unable to get simulation data from ${url}. Skipping it.`)
            }
            if (response.statusCode === 403) {
              resolve()
            }
            reject()
          })
          .pipe(writeStream)
      })
    }),
  )
  bar.stop()

  simsToDelete.map(function ({ lang, id }) {
    catalogs[lang].remove(id)
  })

  for (const catalog of Object.values(catalogs)) {
    await catalog.persist(path.join(options.outDir, 'catalogs'))
  }
}

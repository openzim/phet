import got from 'got';
import * as fs from 'fs';
import * as path from 'path';
import slugify from 'slugify';
import * as yargs from 'yargs';
import * as dotenv from 'dotenv';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import * as ISO6391 from 'iso-639-1';
import {RateLimit} from 'async-sema';
import {Presets, SingleBar} from 'cli-progress';

import {log} from '../lib/logger';
import welcome from '../lib/welcome';
import {SimulationsList} from '../lib/classes';
import {barOptions, getIdAndLanguage} from '../lib/common';
import {Category, LanguageDescriptor, LanguageItemPair, Simulation} from '../lib/types';

dotenv.config();

const {argv} = yargs
  .array('includeLanguages')
  .array('excludeLanguages');

const outDir = 'state/get/';
const imageResolution = 600;
const rootCategories = [
  'Physics',
  'Biology',
  'Chemistry',
  'Earth Science',
  'Math'
];
const rps = process.env.PHET_RPS ? parseInt(process.env.PHET_RPS, 10) : 8;
const verbose = process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false;

const options = {
  prefixUrl: 'https://phet.colorado.edu',
  retry: {
    limit: process.env.PHET_RETRIES ? parseInt(process.env.PHET_RETRIES, 10) : 5,
    timeout: 3000
  }
};

const popValueUpIfExists = (items: string[], value: string) => {
  const index = items.indexOf(value);
  if (index !== -1 && items.splice(items.indexOf(value), 1)) items.unshift('en');
  return items;
};

// common data
const delay = RateLimit(rps);
const languages: LanguageItemPair<LanguageDescriptor> = {};
const simsTree = {};
const categoriesList = {};

const fetchLanguages = async (): Promise<void> => {
  const $ = cheerio.load((await got('/en/simulations/translated', {...options})).body);
  const rows = $('.translated-sims tr').toArray();
  rows.shift();
  if (rows.length === 0) {
    log.error(`Failed to fetch languages`);
    return;
  }

  rows.forEach((item) => {
    const url = $(item).find('td.list-highlight-background:first-child a').attr('href');
    const slug = /locale=(.*)$/.exec(url)?.pop();
    const name = $(item).find('td.list-highlight-background:first-child a span').text();
    // @ts-ignore
    const localName = ISO6391.getNativeName(slug) ?? $(item).find('td.list-highlight-background').last().text();
    const count = parseInt($(item).find('td.number').text(), 10);

    if (argv.includeLanguages && !(argv.includeLanguages as string[] || []).includes(slug)) return;
    if (argv.excludeLanguages && (argv.excludeLanguages as string[] || []).includes(slug)) return;

    if (!Object.keys(languages).includes(slug)) {
      op.set(languages, slug, {slug, name, localName, url, count});
    }
  });
  try {
    await fs.promises.writeFile(`${outDir}languages.json`, JSON.stringify(languages), 'utf8');
    log.info(`Got ${Object.keys(languages).length} languages`);
  } catch (e) {
    log.error(`Failed to save languages`);
    log.error(e);
  }
};

const fetchCategoriesTree = async (): Promise<void> => {
  log.info(`Getting category trees...`);
  const fallbackLanguages = new Set();
  await Promise.all(popValueUpIfExists(Object.keys(languages), 'en').map(
    async (lang) => await Promise.all(rootCategories.map(async (categoryTitle) => {
      try {
        await delay();
        const categorySlug = slugify(categoryTitle, {lower: true});
        const $ = cheerio.load((await got(`/${lang}/simulations/category/${categorySlug}/index`, {...options})).body);

        const translatedCat = $('.regular-page-title').text().split('  ')?.shift() || categoryTitle;
        op.set(categoriesList, `${lang}.${translatedCat}`, `${categorySlug}`);
        log.debug(`+ [${lang}] ${categorySlug}`);

        // gather sub-categories
        return $('.side-nav ul.parents ul.children a').toArray()
          .map((item) => {
            const title = $(item).text();
            const slug = $(item).attr('href').split('/').pop();
            op.set(categoriesList, `${lang}.${translatedCat} / ${title}`, `${categorySlug}/${slug}`);
          });
      } catch (e) {
        fallbackLanguages.add(lang);
        return;
      }
    }))
  ));
  if (fallbackLanguages.size > 0) log.warn(`The following (${fallbackLanguages.size}) language(s) will use english metadata: ${Array.from(fallbackLanguages).join(', ')}`);
};

const fetchSimsList = async (): Promise<void> => {
  const data = JSON.parse((await got(`/services/metadata/1.3/simulations?format=json`, {...options})).body);
  const sims = Object.values(data.projects)
    .filter((item: any) => item.type === 2);
  const cats = data.categories;

  await Promise.all(Object.entries(categoriesList).map(
    async ([lang, subcats]) => await Promise.all(Array.from(new Set(Object.entries(subcats))).map(async ([subCatTitle, subCatSlug]) => {
      try {
        await delay();

        const simsInCat = Object.values(data.projects)
          .filter((item: any) => item.type === 2);

        log.debug(` - [${lang}] ${subCatSlug}: ${simsInCat.length}`);

        simsInCat.map((item: any) => {
          const slug = item?.simulations?.shift()?.name;
          op.push(simsTree, `${lang}.${slug}`, subCatTitle);
        });
      } catch (e) {
        if (verbose) {
          log.error(`Failed to get subcategories for ${lang}`);
          log.error(e);
        } else {
          log.warn(`Unable to get simulations under subcategory subCatSlug for language ${lang}. Skipping it.`);
        }
      }
    }))
  ));
};


const getItemCategories = (lang: string, slug: string): Category[] => {
  // fallback to english
  const categoryTitles = op.get(simsTree, `${lang}.${slug}`, op.get(simsTree, `en.${slug}`));
  return categoryTitles ? categoryTitles.map(title => ({
    title,
    slug: categoriesList[title] ?? slugify(title, {lower: true})
  })) : [];
};


const fetchSims = async (): Promise<void> => {
  log.info(`Gathering "translated" index pages...`);
  const bar = new SingleBar(barOptions, Presets.shades_classic);
  bar.start(Object.keys(languages).length, 0);

  const simIds = await Promise.all(Object.keys(languages)
    .map(async (lang) => {
      try {
        await delay();
        const $ = cheerio.load((await got(`/en/simulations/translated/${lang}`, {...options})).body);
        const data = $('.translated-sims tr > td > img[alt="HTML"]').parent().siblings('.translated-name').children('a').toArray();
        if (!data) throw new Error('Got empty data');
        const list = data.map(item => {
          const link = $(item).attr('href');
          if (!link) throw new Error('Got empty link');
          return [...getIdAndLanguage(link), $(item).find('span').text()];
        })
          .filter(([id, language, title]) => language === lang)
          .map(([id, language, title]) => ({id, title: title.replace(' (HTML5)', '')}));
        return {
          lang,
          data: Array.from(new Set(list))
        };
      } catch (e) {
        if (verbose) {
          log.error(`Failed to get simulation list for ${lang}`);
          log.error(e);
        } else {
          log.warn(`Unable to get the simulations list for language ${lang}. Skipping it.`);
        }
        return;
      } finally {
        bar.increment(1, {prefix: '', postfix: lang});
      }
    }
  ));
  bar.stop();

  log.info(`Gathering sim links...`);
  const simCount = simIds.reduce((acc, {data}) => acc + data.length, 0);
  bar.start(simCount, 0);

  let urlsToGet = [];

  await Promise.all(
    simIds.map(async ({lang, data}) => {
      const catalog = new SimulationsList(lang);
      await Promise.all(data.map(async ({id, title}) => {
        await delay();
        let response;
        let status: number;
        let fallback = false;
        let url = `/${lang}/simulation/${id}`;
        try {
          try {
            response = await got(url, {...options});
          } catch (e) {
            status = op.get(e, 'response.statusCode');
            if (status === 404) {
              // todo reuse catalog
              fallback = true;
              url = `/en/simulation/${id}`;
              response = await got(url, {...options});
              status = response.statusCode;
            }
          }
          if (!response) throw new Error(`Got no response from ${options.prefixUrl}${url}`);
          const {body} = response;
          if (!body) throw new Error(`Got no data (status = ${status}) from ${options.prefixUrl}${url}`);
          const $ = cheerio.load(body);
          const link = $('.sim-download').attr('href');
          const [realId] = getIdAndLanguage(link);
          catalog.add({
            categories: getItemCategories(lang, realId),
            id: realId,
            language: lang,
            title: title || $('.simulation-main-title').text().trim(),
            topics: $('.sim-page-content ul').first().text().split('\n').map(t => t.trim()).filter(a => a),
            description: $('.simulation-panel-indent[itemprop]').text()
          } as Simulation);

          urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}_${lang}.html`);
          urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}-${imageResolution}.png`);
        } catch (e) {
          if (verbose) {
            log.error(`Failed to parse: ${options.prefixUrl}${url}`);
            log.error(e);
          } else {
            log.warn(`Unable to get the simulation ${id} for language ${lang}. Skipping it.`);
          }
        } finally {
          bar.increment(1, {prefix: '', postfix: `${lang} / ${id}`});
          if (!process.stdout.isTTY) log.info(`+ [${lang}${fallback ? ' > en' : ''}] ${id}`);
        }
      }));
      return await catalog.persist(path.join(outDir, 'catalogs'));
    })
  );

  bar.stop();
  urlsToGet = Array.from(new Set(urlsToGet));

  log.info(`Getting documents and images...`);
  bar.start(urlsToGet.length, 0);

  await Promise.all(urlsToGet.map(async (url) => {
    await delay();
    return new Promise(async (resolve, reject) => {
      let data;
      try {
        data = await got.stream(url);
      } catch (e) {
        if (verbose) {
          const status = op.get(e, 'response.status');
          log.error(`Failed to get url ${options.prefixUrl}${url}: status = ${status}`);
          log.error(e);
          return;
        } else {
          log.warn(`Unable to get simulation data from ${url}. Skipping it.`);
          return;
        }
      }
      let fileName = url.split('/').pop();
      if (fileName.slice(-4) === '.png') {
        const fileParts = fileName.split('-');
        fileName = fileParts.slice(0, -1).join('-') + '.png';
      }
      const writeStream = fs.createWriteStream(outDir + fileName)
        .on('close', _ => {
          bar.increment(1, {prefix: '', postfix: fileName});
          if (!process.stdout.isTTY) log.info(` + ${path.basename(fileName)}`);
          resolve();
        });

      data.on('response', function (response) {
        if (response.statusCode === 200) return;
        log.error(`${fileName} gave a ${response.statusCode}`);

        fs.unlink(outDir + fileName, function (err) {
          if (err) log.error(`Failed to delete item: ${err}`);
        });
        reject();
      }).pipe(writeStream);
    });
  }));
  bar.stop();
};


// leave IIFE here until global refactoring
(async () => {
  welcome('get');
  await fetchLanguages();
  await fetchCategoriesTree();
  await fetchSimsList();
  await fetchSims();
  log.info('Done.');
})();

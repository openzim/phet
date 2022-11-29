import got from 'got';
import puppeteer from 'puppeteer';
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
import {cats, rootCategories} from '../lib/const';
import welcome from '../lib/welcome';
import {SimulationsList} from '../lib/classes';
import {barOptions, getIdAndLanguage} from '../lib/common';
import type {Category, LanguageDescriptor, LanguageItemPair, Meta, Simulation} from '../lib/types';
import { exit } from 'yargs';


dotenv.config();

const {argv} = yargs
  .array('includeLanguages')
  .array('excludeLanguages');

const outDir = 'state/get/';
const imageResolution = 600;
const concurrentlyPagesLaunchingCount = process.env.PHET_DOWNLOAD_CONCURRENCY ? parseInt(process.env.PHET_DOWNLOAD_CONCURRENCY, 10) : 5;
const rps = process.env.PHET_RPS ? parseInt(process.env.PHET_RPS, 10) : 8;
const verbose = process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false;

const options = {
  prefixUrl: 'https://phet.colorado.edu/',
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

const unshiftValueUpIfNotExists = (items: string[], value: string): string[] => {
  if (!items) return;
  if (!items.includes(value)) items.unshift('en');
  return items;
};

// english is a must
argv.includeLanguages = unshiftValueUpIfNotExists(argv.includeLanguages as string[], 'en');

// common data
const delay = RateLimit(rps);
const languages: LanguageItemPair<LanguageDescriptor> = {};

let meta: Meta;
const simsTree = {};
const categoriesList: LanguageItemPair<any> = {};

const fetchMeta = async (): Promise<void> => {
  meta = JSON.parse((await got(`services/metadata/1.3/simulations?format=json&summary`, {...options})).body);
  // console.log(meta);
  meta.count = Object.values(meta.projects)
    .filter(({type}) => type === 2)
    .reduce((acc, {simulations}) =>
      acc + simulations
        .reduce((c, sim) => c + Object.keys(sim.localizedSimulations)
          .filter((lang) => Object.keys(languages)?.includes(lang))
          .length, 0), 0
    );
};

const fetchLanguages = async (): Promise<void> => {
  const $ = cheerio.load((await got('en/simulations/translated', {...options})).body);
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

    if (!Object.keys(languages)?.includes(slug)) {
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
        const $ = cheerio.load((await got(
          `${lang}/simulations/filter?locale=en&subjects=${categorySlug}&sort=alpha&view=list`,
          {...options})
        ).body);

        const translatedCat = $('.regular-page-title').text().split('  ')?.shift() || categoryTitle;
        op.set(categoriesList, `${lang}.${translatedCat}`, `${categorySlug}`);
        log.debug(`+ [${lang}] ${categorySlug}`);

        // gather sub-categories
        const x = $('.subjects ul.checkboxes li [role=checkbox]').toArray();
        return x
          .map((item) => {
            const slug = $(item).attr('id').replace('-checkbox', '');
            const title = $(item).children().text();
            op.set(categoriesList, `${lang}.${translatedCat} / ${title}`, `${categorySlug}/${slug}`);
          });
      } catch (e) {
        fallbackLanguages.add(lang);
        return;
      }
    }))
  ));
  if (fallbackLanguages.size > 0) {
    log.warn(`The following (${fallbackLanguages.size}) language(s) will use english metadata: ${Array.from(fallbackLanguages).join(', ')}`);
    for (const lang of Array.from(fallbackLanguages)) {
      op.set(categoriesList, lang, categoriesList.en);
    }
  }
};

const fetchSimsList = async (): Promise<void> => {
  await Promise.all(Object.entries(categoriesList).map(
    async ([lang, subcats]) => await Promise.all(Array.from(new Set(Object.entries(subcats))).map(async ([subCatTitle, subCatSlug]) => {
      try {
        await delay();

        const catId = parseInt(Object.keys(cats)[Object.values(cats).indexOf((subCatSlug as string).split('/').pop())], 10);

        const simsInCat = Object.values(meta.projects)
          .filter((item) => item.type === 2 && item.simulations[0]?.subjects?.includes(catId));

        log.debug(` - [${lang}] ${subCatSlug}: ${simsInCat.length}`);

        simsInCat.map((item) => {
          const slug = item.simulations[0]?.name;
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
  const browser = await puppeteer.launch();
  // console.log(simsTree);
  log.info(`Gathering sim links...`);
  const bar = new SingleBar(barOptions, Presets.shades_classic);
  bar.start(meta.count, 0);

  const catalogs: LanguageItemPair<SimulationsList> = {};
  let urlsToGet = [];
  const projects = Object.values(meta.projects);
  while (projects.length) {
    await Promise.all((projects.splice(0, concurrentlyPagesLaunchingCount).map(async (project) => {
      if (project.type !== 2) return;
      for (const sim of Object.values(project.simulations)) {
        for (const [lang, {title}] of Object.entries(sim.localizedSimulations)) {
          if (!Object.keys(simsTree)?.includes(lang)) continue;

          if (!catalogs[lang]) catalogs[lang] = new SimulationsList(lang);

          let status: number;
          let fallback = false;
          let url = `${lang}/simulation/${(sim.name)}`;
          try {
            const page = await browser.newPage();
            const response = await page.goto(`${options.prefixUrl}${url}`);

            status = response.status();
            if( status === 404 ){
              const response = await page.goto(`${options.prefixUrl}en/simulation/${(sim.name)}`);
              status = response.status();
              if( status === 404 ){
                throw new Error('Page not found');
              }
            }

            const downloadLinkElm = 'a.banner-link-icon[title="Download"]';
            await page.waitForSelector(downloadLinkElm);

            const linkElement = await page.$(downloadLinkElm);
            const link = await page.evaluate(el => el.href, linkElement);
            
            const topics = await page.$$eval('div.topics ul > li', el => {
              return el.map(e => e.innerHTML)
            });

            const pageTitle = await page.title();

            page.close();

            if (!link) throw new Error(`Got no response from ${options.prefixUrl}${url}`);

            const [realId] = getIdAndLanguage(link);

            catalogs[lang].add({
              categories: getItemCategories(lang, realId),
              id: realId,
              language: lang,
              title: title || pageTitle,
              topics,
              description: title,
            } as Simulation);

            urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}_${lang}.html`);
            urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}-${imageResolution}.png`);
          } catch (e) {

            if (verbose) {
              log.error(`Failed to parse: ${options.prefixUrl}${url}`);
              log.error(e);
            } else {
              log.warn(`Unable to get the simulation ${(sim.name)} for language ${lang}. Skipping it.`);
            }
          }
          bar.increment(1, {prefix: '', postfix: `${lang} / ${(sim.name)}`});
          if (!process.stdout.isTTY) log.info(`+ [${lang}${fallback ? ' > en' : ''}] ${(sim.name)}`);
        }
      }
    })));
  }
  await browser.close();

  for (const catalog of Object.values(catalogs)) {
    await catalog.persist(path.join(outDir, 'catalogs'));
  }

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
  await fetchMeta();
  await fetchCategoriesTree();
  await fetchSimsList();
  await fetchSims();
  log.info('Done.');
})().catch((err: Error) => {
  if (err && err.message) {
    log.error(err.message);
  }
  else {
    log.error(`An unidentified error occured ${err}`);
  }
  exit(1, err);
});

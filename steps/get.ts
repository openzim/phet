import * as fs from 'fs';
import axios from 'axios';
import * as path from 'path';
import slugify from 'slugify';
import * as op from 'object-path';
import * as rax from 'retry-axios';
import * as cheerio from 'cheerio';
import {RateLimit} from 'async-sema';
import asyncPool from 'tiny-async-pool';
import * as progress from 'cli-progress';

import {log} from '../lib/logger';
import * as config from '../config';
import welcome from '../lib/welcome';
import {SimulationsList} from '../lib/classes';
import {Category, LanguageDescriptor, LanguageItemPair, SetByLanguage, Simulation} from '../lib/types';


const outDir = 'state/get/';

const ax = axios.create();
ax.defaults.raxConfig = {
  instance: ax,
  retry: 3,
  noResponseRetries: 2,
  retryDelay: 1000,
  httpMethodsToRetry: ['GET'],
  statusCodesToRetry: [[100, 199], [429, 429], [500, 599]],
  backoffType: 'exponential',
  onRetryAttempt: err => {
    const cfg = rax.getConfig(err);
    log.info(`Retry attempt #${cfg.currentRetryAttempt}`);
  }
};
rax.attach(ax);

const barOptions = {
  clearOnComplete: false,
  autopadding: true,
  // hideCursor: true,
  format: '{prefix} {bar} {percentage}% | ETA: {eta}s | {value}/{total} | {postfix}'
};


const getIdAndLanguage = (url: string): string[] => {
  if (!url) throw new Error('Got empty url');
  return /([^_]*)_([^]*)\./.exec(path.basename(url)).slice(1, 3);
};

const popValueUpIfExists = (items: string[], value: string) => {
  const index = items.indexOf(value);
  if (index !== -1 && items.splice(items.indexOf(value), 1)) items.unshift('en');
  return items;
};

// common data
const delay = RateLimit(config.rps);
const languages: LanguageItemPair<LanguageDescriptor> = {};
const categoriesTree = {};
const subCategoriesList = {};

const fetchLanguages = async () => {
  const response = await ax.get('https://phet.colorado.edu/en/simulations/translated');
  const $ = cheerio.load(response.data);

  const rows = $('.translated-sims tr').toArray();
  rows.shift();
  if (rows.length === 0) return log.error(`Failed to fetch languages`);

  rows.forEach((item) => {
    const url = $(item).find('td.list-highlight-background:first-child a').attr('href');
    const slug = url.split('/').pop();
    const name = $(item).find('td.list-highlight-background:first-child a span').text();
    const localName = $(item).find('td.list-highlight-background').last().text();
    const count = parseInt($(item).find('td.number').text(), 10);
    op.set(languages, slug, {slug, name, localName, url, count});
  });
  try {
    await fs.promises.writeFile(`${outDir}languages.json`, JSON.stringify(languages), 'utf8');
    log.info(`Got ${Object.keys(languages).length} languages`);
  } catch (e) {
    log.error(`Failed to save languages`);
    log.error(e);
  }
};

const fetchCategoriesTree = async () => {
  log.info(`Getting category trees...`);
  const fallbackLanguages = new Set();
  await asyncPool(
    config.workers,
    popValueUpIfExists(Object.keys(languages), 'en'),
    async (lang) => await Promise.all(config.categoriesToGet.map(async (categoryTitle) => {
      try {
        await delay();
        const categorySlug = slugify(categoryTitle, {lower: true});
        const data = (await ax.get(`https://phet.colorado.edu/${lang}/simulations/category/${categorySlug}/index`)).data;
        const $ = cheerio.load(data);

        // extract the sims
        const sims = $('.simulation-index a').toArray();
        if (sims.length === 0) log.error(`Failed to get sims for category ${categoryTitle}`);
        log.debug(`- [${lang}] ${categorySlug}: ${sims.length}`);

        sims.map((item) => {
          const slug = $(item).attr('href').split('/').pop();
          op.push(categoriesTree, `${lang}.${slug}`, categoryTitle);
        });

        // gather sub-categories
        const subCategories = $('.side-nav ul.parents ul.children a').toArray();
        return subCategories.map((item) => {
          const title = $(item).text();
          const slug = $(item).attr('href').split('/').pop();
          op.set(subCategoriesList, `${lang}.${categoryTitle}/${title}`, `${categorySlug}/${slug}`);
        });
      } catch (e) {
        fallbackLanguages.add(lang);
        return;
      }
    }))
  );
  if (fallbackLanguages.size > 0) log.warn(`The following (${fallbackLanguages.size}) language(s) will use english metadata: ${Array.from(fallbackLanguages).join(', ')}`);
};

const fetchSubCategories = async () => {
  await asyncPool(
    config.workers,
    Object.entries(subCategoriesList),
    async ([lang, subcats]) => await Promise.all(Object.entries(subcats).map(async ([subCatTitle, subCatSlug]) => {
        try {
          await delay();
          const data = (await ax.get(`https://phet.colorado.edu/${lang}/simulations/category/${subCatSlug}/index`)).data;
          const $ = cheerio.load(data);

          // extract the sims
          const sims = $('.simulation-index a').toArray();
          if (sims.length === 0) log.error(`Failed to get sims for sub-category ${subCatTitle}`);
          log.debug(` - [${lang}] ${subCatSlug}: ${sims.length}`);

          sims.map((item) => {
            const slug = $(item).attr('href').split('/').pop();
            op.push(categoriesTree, `${lang}.${slug}`, subCatTitle);
          });
        } catch (e) {
          log.error(`Failed to get subcategories for ${lang}`);
          log.error(e);
        }
      }
    )));
};


const getItemCategories = (lang: string, slug: string): Category[] => {
  // fallback to english
  const categoryTitles = op.get(categoriesTree, `${lang}.${slug}`, op.get(categoriesTree, `en.${slug}`));
  return categoryTitles ? categoryTitles.map(title => ({
    title,
    slug: subCategoriesList[title] || slugify(title, {lower: true})
  })) : [];
};


const getSims = async () => {
  log.info(`Gathering "translated" index pages...`);
  const bar = new progress.SingleBar(barOptions, progress.Presets.shades_classic);
  bar.start(Object.keys(languages).length, 0, {prefix: '', postfix: 'N/A'});

  const simIds: SetByLanguage<string> = (await asyncPool(
    config.workers,
    Object.keys(languages),
    async (lang) => {
      try {
        await delay();
        const html = await ax.get(`https://phet.colorado.edu/en/simulations/translated/${lang}`);
        const $ = cheerio.load(html.data);
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
        log.error(`Failed to get simulation list for ${lang}`);
        log.error(e);
        return;
      } finally {
        bar.increment(1, {prefix: '', postfix: lang});
      }
    }
  ) || [])
    .filter(x => !!x);
  bar.stop();

  log.info(`Gathering sim links...`);
  const simCount = simIds.reduce((acc, {data}) => acc + data.length, 0);
  bar.start(simCount, 0, {prefix: '', postfix: 'N/A'});

  const catalog = new SimulationsList(languages);
  let urlsToGet = [];

  await Promise.all(
    simIds.map(async ({lang, data}) => await asyncPool(
      config.workers,
      data,
      async ({id, title}) => {
        await delay();
        let data: string;
        let status: number;
        let fallback = false;
        let url = `https://phet.colorado.edu/${lang}/simulation/${id}`;
        try {
          try {
            data = (await ax.get(url)).data;
          } catch (e) {
            status = op.get(e, 'response.status');
            if (status === 404) {
              // todo reuse catalog
              fallback = true;
              url = `https://phet.colorado.edu/en/simulation/${id}`;
              data = (await ax.get(url)).data;
            }
          }

          if (!data) throw new Error(`Got no data (status = ${status}) from ${url}`);
          const $ = cheerio.load(data);
          const link = $('.sim-download').attr('href');
          const [realId] = getIdAndLanguage(link);
          catalog.add(lang, {
            categories: getItemCategories(lang, realId),
            id: realId,
            language: lang,
            title: title || $('.simulation-main-title').text().trim(),
            topics: $('.sim-page-content ul').first().text().split('\n').map(t => t.trim()).filter(a => a),
            description: $('.simulation-panel-indent[itemprop]').text()
          } as Simulation);

          urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}_${lang}.html`);
          urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}-${config.imageResolution}.png`);
        } catch (e) {
          log.error(`Failed to parse: ${url}`);
          log.error(e);
        } finally {
          bar.increment(1, {prefix: '', postfix: `${lang} / ${id}`});
          if (!bar.terminal.isTTY()) log.info(`+ [${lang}${fallback ? ' > en' : ''}] ${id}`);
        }
      }
    ))
  );

  bar.stop();
  urlsToGet = Array.from(new Set(urlsToGet));

  await catalog.persist(outDir);

  log.info(`Getting documents and images...`);
  bar.start(urlsToGet.length, 0, {prefix: '', postfix: 'N/A'});

  await asyncPool(
    config.workers,
    urlsToGet,
    async (url) => {
      await delay();
      return new Promise(async (resolve, reject) => {
        let data;
        try {
          data = (await ax.get(url, {responseType: 'stream'})).data;
        } catch (e) {
          const status = op.get(e, 'response.status');
          log.error(`Failed to get url ${url}: status: ${status}`);
          log.error(e);
          return;
        }
        let fileName = url.split('/').pop();
        if (fileName.slice(-4) === '.png') {
          const fileParts = fileName.split('-');
          fileName = fileParts.slice(0, -1).join('-') + '.png';
        }
        const writeStream = fs.createWriteStream(outDir + fileName)
          .on('close', _ => {
            bar.increment(1, {prefix: '', postfix: fileName});
            if (!bar.terminal.isTTY()) log.info(` + ${path.basename(fileName)}`);
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
    }
  );
  bar.stop();
};


// leave IIFE here until global refactoring
(async () => {
  welcome('get');
  await fetchLanguages();
  await fetchCategoriesTree();
  await fetchSubCategories();
  await getSims();
  log.info('Done.');
})();

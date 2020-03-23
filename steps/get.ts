import * as fs from 'fs';
import axios from 'axios';
import * as path from 'path';
import slugify from 'slugify';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import asyncPool from 'tiny-async-pool';
import * as progress from 'cli-progress';

import * as config from '../config';
import {Category, LanguageDescriptor, LanguageItemPair, SetByLanguage, Simulation} from './types';
import {SimulationsList} from './classes';


const outDir = 'state/get/';

const barOptions = {
  clearOnComplete: false,
  autopadding: true,
  hideCursor: true,
  format: '{prefix} {bar} {percentage}% | ETA: {eta}s | {value}/{total} | {postfix}'
};


const error = function (...args: any[]) {
  if (config.verbose) console.error.apply(console, arguments);
};

const getIdAndLanguage = (url: string): string[] => /([^_]*)_([^]*)\./.exec(path.basename(url)).slice(1, 3);

const popValueUpIfExists = (items: string[], value: string) => {
  const index = items.indexOf(value);
  if (index !== -1 && items.splice(items.indexOf(value), 1)) items.unshift('en');
  return items;
};

// common data
const languages: LanguageItemPair<LanguageDescriptor> = {};
const categoriesTree = {};
const subCategoriesList = {};

const fetchLanguages = async () => {
  const response = await axios.get('https://phet.colorado.edu/en/simulations/translated');
  const $ = cheerio.load(response.data);

  const rows = $('.translated-sims tr').toArray();
  rows.shift();
  if (rows.length === 0) return console.error(`Failed to fetch languages`);

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
    console.log(`Got ${Object.keys(languages).length} languages`);
  } catch (e) {
    console.error(`Failed to save languages`);
  }
};

const fetchCategoriesTree = async () => {
  console.log(`Getting category trees...`);
  await asyncPool(
    config.workers,
    popValueUpIfExists(Object.keys(languages), 'en'),
    async (lang) => await Promise.all(config.categoriesToGet.map(async (categoryTitle) => {
      try {
        const categorySlug = slugify(categoryTitle, {lower: true});
        const data = (await axios.get(`https://phet.colorado.edu/${lang}/simulations/category/${categorySlug}/index`)).data;
        const $ = cheerio.load(data);

        // extract the sims
        const sims = $('.simulation-index a').toArray();
        if (sims.length === 0) console.error(`Failed to get sims for category ${categoryTitle}`);
        console.debug(`- [${lang}] ${categorySlug}: ${sims.length}`);

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
      } catch (err) {
        console.error(`Failed to get categories for ${lang}`);
        return;
      }
    })
  ));
};

const fetchSubCategories = async () => {
  await asyncPool(
    config.workers,
    Object.entries(subCategoriesList),
    async ([lang, subcats]) => await Promise.all(Object.entries(subcats).map(async ([subCatTitle, subCatSlug]) => {
      try {
        const data = (await axios.get(`https://phet.colorado.edu/${lang}/simulations/category/${subCatSlug}/index`)).data;
        const $ = cheerio.load(data);

        // extract the sims
        const sims = $('.simulation-index a').toArray();
        if (sims.length === 0) console.error(`Failed to get sims for sub-category ${subCatTitle}`);
        console.debug(` - [${lang}] ${subCatSlug}: ${sims.length}`);

        sims.map((item) => {
          const slug = $(item).attr('href').split('/').pop();
          op.push(categoriesTree, `${lang}.${slug}`, subCatTitle);
        });
      } catch (err) {
        console.error(`Failed to get subcategories for ${lang}`);
        return;
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
  console.log(`Gathering sim links...`);
  const simIds: SetByLanguage<string> = await asyncPool(
    config.workers,
    Object.keys(languages),
    async (lang) => {
      try {
        const html = await axios.get(`https://phet.colorado.edu/en/simulations/translated/${lang}`);
        const $ = cheerio.load(html.data);
        const data = $('.translated-sims tr > td > img[alt="HTML"]').parent().siblings('.translated-name').children('a').toArray()
          .map(item => [...getIdAndLanguage($(item).attr('href')), $(item).find('span').text()])
          .filter(([id, language, title]) => language === lang)
          .map(([id, language, title]) => ({id, title: title.replace(' (HTML5)', '')}));
        return {
          lang,
          data: [...new Set(data)]
        };
      } catch (e) {
        console.error(`Failed to get simulation list for ${lang}`);
        return;
      }
    }
  );

  const multibar = new progress.MultiBar(barOptions, progress.Presets.shades_grey);
  const bars = {};
  simIds.forEach(({lang, data}) => bars[lang] = multibar.create(data.length, 0, {prefix: lang, postfix: 'N/A'}));

  const catalog = new SimulationsList(languages);
  let urlsToGet = [];

  await Promise.all(
    simIds.map(async ({lang, data}) =>
      await asyncPool(
        config.workers,
        data,
        async ({id, title}) => {
          let data: string;
          try {
            data = (await axios.get(`https://phet.colorado.edu/${lang}/simulation/${id}`)).data;
            if (!multibar.terminal.isTTY()) console.log(`+ [${lang}] ${id}`);
          } catch (e) {
            const status = op.get(e, 'response.status');
            if (status === 404) {
              // todo reuse catalog
              data = (await axios.get(`https://phet.colorado.edu/en/simulation/${id}`)).data;
              if (!multibar.terminal.isTTY()) console.log(`+ [${lang} > en] ${id}`);
            }
          }

          try {
            const $ = cheerio.load(data);
            const [realId] = getIdAndLanguage($('.sim-download').attr('href'));
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
            if (bars[lang]) bars[lang].increment(1, {prefix: lang, postfix: id});
          } catch (e) {
            console.error(`Failed to get: https://phet.colorado.edu/${lang}/simulation/${id}`);
            if (bars[lang]) bars[lang].increment(1, {prefix: lang, postfix: id});
            return;
          }
        }
      )));

  multibar.stop();
  urlsToGet = Array.from(new Set(urlsToGet));

  await catalog.persist(outDir);

  console.log(`Getting documents and images...`);
  const bar = new progress.SingleBar(barOptions, progress.Presets.shades_classic);
  bar.start(urlsToGet.length, 0, {prefix: '', postfix: 'N/A'});

  await asyncPool(
    config.workers,
    urlsToGet,
    async (url) => {
      return new Promise(async (resolve, reject) => {
        let data;
        try {
          data = (await axios.get(url, {responseType: 'stream'})).data;
        } catch (e) {
          console.error(`Failed to get url ${url}`);
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
            if (!bar.terminal.isTTY()) console.log(` + ${path.basename(fileName)}`);
            resolve();
          });

        data.on('response', function (response) {
          if (response.statusCode === 200) return;
          error(`${fileName} gave a ${response.statusCode}`);

          fs.unlink(outDir + fileName, function (err) {
            if (err) error(`Failed to delete item: ${err}`);
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
  await fetchLanguages();
  await fetchCategoriesTree();
  await fetchSubCategories();
  await getSims();
  console.log('Done.');
})();

import * as fs from 'fs';
import axios from 'axios';
import * as path from 'path';
import slugify from 'slugify';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import asyncPool from 'tiny-async-pool';
import * as progress from 'cli-progress';

import * as config from '../config';
import {Category, SetByLanguage, Simulation} from './types';
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

const getIdAndLanguage = (url: string) => /([^_]*)_([^]*)\./.exec(path.basename(url)).slice(1, 3);


// todo move to class
const categoriesTree = {};
const subCategoriesList = {};
const fetchCategoriesTree = async () => {
  console.log(`Getting categories...`);
  await asyncPool(
    config.workers,
    config.categoriesToGet,
    async (categoryTitle) => {
      const categorySlug = slugify(categoryTitle, {lower: true});
      const response = await axios.get(`https://phet.colorado.edu/en/simulations/category/${categorySlug}/index`);
      const $ = cheerio.load(response.data);

      // extract the sims
      const sims = $('.simulation-index a').toArray();
      if (sims.length === 0) console.warn(`Failed to get sims for category ${categoryTitle}`);
      console.debug(`- ${categorySlug}: ${sims.length}`);

      sims.map((item) => {
        const slug = $(item).attr('href').split('/').pop();
        op.push(categoriesTree, slug, categoryTitle);
      });

      // gather sub-categories
      const subCategories = $('.side-nav ul.parents ul.children a').toArray();
      subCategories.map((item) => {
        const title = $(item).text();
        const slug = $(item).attr('href').split('/').pop();
        op.set(subCategoriesList, `${categoryTitle}/${title}`, `${categorySlug}/${slug}`);
      });
    }
  );
};

const fetchSubCategories = async () => {
  await asyncPool(
    config.workers,
    Object.entries(subCategoriesList),
    async ([subCatTitle, subCatSlug]) => {
      const response = await axios.get(`https://phet.colorado.edu/en/simulations/category/${subCatSlug}/index`);
      const $ = cheerio.load(response.data);

      // extract the sims
      const sims = $('.simulation-index a').toArray();
      if (sims.length === 0) console.warn(`Failed to get sims for sub-category ${subCatTitle}`);
      console.debug(` - ${subCatSlug}: ${sims.length}`);

      sims.map((item) => {
        const slug = $(item).attr('href').split('/').pop();
        op.push(categoriesTree, slug, subCatTitle);
      });
    }
  );
};

// todo move to class
const getItemCategories = async (item): Promise<Category[]> => {
  const categoryTitles = categoriesTree[item];
  return categoryTitles ? categoryTitles.map(title => ({
    title,
    slug: subCategoriesList[title] || slugify(title, {lower: true})
  })) : [];
};


const getSims = async () => {
  console.log(`Gathering sim links...`);
  const simIds: SetByLanguage<string> = await asyncPool(
    config.workers,
    config.languagesToGet,
    async (lang) => {
      try {
        const $ = cheerio.load((await axios.get(`https://phet.colorado.edu/${lang}/offline-access`)).data);
        return {
          lang,
          data: $('.oa-html5 > a')
            .toArray()
            .map(item => getIdAndLanguage($(item).attr('href')))
            .filter(([id, language]) => language === lang)
            .map(([id, language]) => id)
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

  const catalog = new SimulationsList();
  let urlsToGet = [];

  await Promise.all(
    simIds.map(async ({lang, data}) =>
      await asyncPool(
        config.workers,
        data,
        async (id) => {
          let data: string;
          try {
            data = (await axios.get(`https://phet.colorado.edu/${lang}/simulation/${id}`)).data;
            if (!multibar.terminal.isTTY()) console.log(`+ [${lang}] ${id}`);
          } catch (e) {
            console.error(`Failed to get the page for ${lang} ${id}`);
            return;
          }
          const $ = cheerio.load(data);
          const [realId, realLanguage] = getIdAndLanguage($('.sim-download').attr('href'));
          catalog.add(lang, {
            categories: await getItemCategories(realId),
            id: realId,
            language: realLanguage,
            title: $('.simulation-main-title').text().trim(),
            // difficulty: categories.filter(c => c[0].title === 'By Grade Level').map(c => c[1].title),    // TODO
            topics: $('.sim-page-content ul').first().text().split('\n').map(t => t.trim()).filter(a => a),
            description: $('.simulation-panel-indent[itemprop]').text()
          } as Simulation);

          urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}_${realLanguage}.html`);
          urlsToGet.push(`https://phet.colorado.edu/sims/html/${realId}/latest/${realId}-${config.imageResolution}.png`);
          if (bars[lang]) bars[lang].increment(1, {prefix: lang, postfix: id});
        }
      )));

  multibar.stop();
  urlsToGet = Array.from(new Set(urlsToGet));

  await catalog.persist(`${outDir}catalog.json`);

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
  console.log(`Starting build with [${config.languagesToGet.length}] languages...`);
  await fetchCategoriesTree();
  await fetchSubCategories();
  await getSims();
  console.log('Done.');
})();

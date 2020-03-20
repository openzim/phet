const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

import * as fs from 'fs';
import * as ncp from 'ncp';
import * as glob from 'glob';
import * as path from 'path';
import {promisify} from 'util';
import * as rimraf from 'rimraf';
import * as cheerio from 'cheerio';
import * as iso6393 from 'iso-639-3';
import asyncPool from 'tiny-async-pool';
import * as progress from 'cli-progress';
import {ZimCreator, ZimArticle} from '@openzim/libzim';

import * as config from '../config';
import {Catalog, Simulation} from './types';

// @ts-ignore
import * as sims from '../state/get/catalog.json';

(ncp as any).limit = 16;

const namespaces = {
  js: '-',
  css: '-',
  svg: 'I',
  png: 'I',
  jpg: 'I',
  jpeg: 'I',
  html: 'A'
};

const getNamespaceByExt = (ext: string): string => namespaces[ext] || '-';

const getKiwixPrefix = (ext: string): string => `../${getNamespaceByExt(ext)}/`;

const getLanguage = (fileName) => fileName.split('_').pop().split('.')[0];

const addKiwixPrefixes = function addKiwixPrefixes(file, targetDir) {
  const resources = file.match(/[0-9a-f]{32}\.(svg|jpg|jpeg|png|js)/g) || [];
  return resources
    .reduce((file, resName) => {
      const ext = path.extname(resName).slice(1);
      ncp(`${inDir}${resName}`, `${targetDir}${resName}`);
      return file.replace(resName, `${getKiwixPrefix(ext)}${resName}`);
    }, file);
};

const getISO6393 = (lang = 'en') => {
  lang = lang.split('_')[0];
  const langEntity = iso6393.find(l => l.iso6391 === lang);
  if (langEntity) return langEntity.iso6393;
};


const exportData = async () =>
  await asyncPool(
    1,
    config.buildCombinations,
    async (combination) => {
      const targetDir = `${outDir}${combination.output}/`;

      await promisify(rimraf)(targetDir);
      await fs.promises.mkdir(targetDir);

      await Promise.all(glob.sync(`${inDir}/*.html`, {})
        .filter(fileName => !!~combination.languages.indexOf(getLanguage(fileName)))
        .map(async (fileName) => {
          try {
            let html = await fs.promises.readFile(fileName, 'utf8');
            const $ = cheerio.load(html);

            const filesToCopy = $('[src]').toArray().map(a => $(a).attr('src'));
            await fs.promises.copyFile(`${fileName.split('_')[0]}.png`, `${targetDir}${path.basename(fileName).split('_')[0]}.png`);

            await Promise.all(filesToCopy.map(async fileName => {
              if (fileName.length > 40) return;
              const ext = path.extname(fileName).slice(1);
              html = html.replace(fileName, `${getKiwixPrefix(ext)}${fileName}`);

              let file = await fs.promises.readFile(`${fileName}`, 'utf8');
              file = addKiwixPrefixes(file, targetDir);
              return await fs.promises.writeFile(`${targetDir}${path.basename(fileName)}`, file, 'utf8');
            }));
            await fs.promises.writeFile(`${targetDir}${path.basename(fileName)}`, html, 'utf8');
          } catch (err) {
            throw err;  // todo
          }
        })
      );

      // Generate Catalog.json file
      const simsByLanguage = (sims as Simulation[]).reduce((acc, sim) => {
        if (!!~combination.languages.indexOf(sim.language)) {
          const lang = config.languageMappings[sim.language];
          acc[lang] = (acc[lang] || []).concat(sim);
        }
        return acc;
      }, {});

      const catalog: Catalog = {
        languageMappings: config.languageMappings,
        simsByLanguage
      };

      // Generate index file
      const templateHTML = await fs.promises.readFile(resDir + 'template.html', 'utf8');
      // Pretty hacky - doing a replace on the HTML. Investigate other ways
      await fs.promises.writeFile(targetDir + 'index.html',
        templateHTML
          .replace('<!-- REPLACEMEINCODE -->', JSON.stringify(catalog))
          .replace('<!-- SETLSPREFIX -->', `lsPrefix = "${combination.output}";`), 'utf8');

      await Promise.all(glob.sync(`${resDir}/**/*`, {ignore: ['*.ts', 'template.html'], nodir: true})
        .map(async (file) => fs.promises.copyFile(file, `${targetDir}${path.basename(file)}`)) // todo test this
      );

      const languageCode = combination.languages.length > 1 ? 'mul' : getISO6393(combination.languages[0]) || 'mul';

      console.log(`Creating ${combination.output}.zim ...`);

      const creator = new ZimCreator({
        fileName: `./dist/${combination.output}.zim`,
        welcome: 'index.html',
        fullTextIndexLanguage: languageCode
      }, {
        Name: `phets_${languageCode}`,
        Title: 'PhET Interactive Simulations',
        Description: 'Interactive simulations for Science and Math',
        Creator: 'University of Colorado',
        Publisher: 'Kiwix',
        Language: languageCode,
        Date: (new Date()).toISOString(),
        Tags: '_category:phet;_pictures:yes;_videos:no',
        // the following two metadata keys don't supported by ZimCreator yet, so that we have to ts-ignore them
        // todo: remove this further
        // @ts-ignore
        Source: `https://phet.colorado.edu/${combination.languages[0]}/simulations/`,
        Scraper: 'openzim/phet'
      });

      const bar = new progress.SingleBar({}, progress.Presets.shades_classic);
      const files = glob.sync(`${targetDir}/*`, {});
      bar.start(files.length, 0);

      await asyncPool(1, files, async (url) => {
        await creator.addArticle(
          new ZimArticle({
            url: path.basename(url),
            data: await fs.promises.readFile(url),
            ns: getNamespaceByExt(path.extname(url).slice(1))
          })
        );
        bar.increment();
      });
      bar.stop();
      await creator.finalise();
      console.log('Done Writing');
    }
  );

(async () => exportData())();

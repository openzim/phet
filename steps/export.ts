import * as fs from 'fs';

import * as ncp from 'ncp';
import * as glob from 'glob';
import * as path from 'path';
import {promisify} from 'util';
import * as rimraf from 'rimraf';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import * as iso6393 from 'iso-639-3';
import * as progress from 'cli-progress';
import {ZimArticle, ZimCreator} from '@openzim/libzim';

import {log} from '../lib/logger';
import welcome from '../lib/welcome';
import {Catalog, Simulation} from '../lib/types';
// @ts-ignore
import * as languages from '../state/get/languages.json';


const catalogsDir = 'state/get/catalogs';
const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';


(ncp as any).limit = 16;
const rimrafPromised = promisify(rimraf);

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

const getCatalog = async (lang): Promise<Simulation[]> => {
  try {
    const file = await fs.promises.readFile(path.join(catalogsDir, `${lang}.json`));
    return JSON.parse(file.toString());
  } catch (e) {
    log.error(`Failed to get catalog for language ${lang}`);
    log.error(e);
  }
};

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


const exportTarget = async (target) => {
  const targetDir = `${outDir}${target.output}/`;

  await rimrafPromised(targetDir);
  await fs.promises.mkdir(targetDir);

  await Promise.all(glob.sync(`${inDir}/*.html`, {})
    .filter(fileName => !!~target.languages.indexOf(getLanguage(fileName)))
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
        throw err;
      }
    })
  );

  const languageMappings = target.languages.reduce((acc, langCode) => {
    op.set(acc, langCode, languages[langCode].localName);
    return acc;
  }, {});

  const simsByLanguage = await target.languages.reduce(async (acc, langCode) => {
    const cat = await getCatalog(langCode);
    op.set(acc, langCode, cat);
    return acc;
  }, {});

  const catalog: Catalog = {
    languageMappings,
    simsByLanguage
  };

  // Generate index file
  const templateHTML = await fs.promises.readFile(resDir + 'template.html', 'utf8');
  // Pretty hacky - doing a replace on the HTML. Investigate other ways
  await fs.promises.writeFile(targetDir + 'index.html',
    templateHTML
      .replace('<!-- REPLACEMEINCODE -->', JSON.stringify(catalog))
      .replace('<!-- SETLSPREFIX -->', `lsPrefix = "${target.output}";`), 'utf8');

  await Promise.all(glob.sync(`${resDir}/**/*`, {ignore: ['*.ts', 'template.html'], nodir: true})
    .map(async (file) => fs.promises.copyFile(file, `${targetDir}${path.basename(file)}`))
  );

  const languageCode = target.languages.length > 1 ? 'mul' : getISO6393(target.languages[0]) || 'mul';

  log.info(`Creating ${target.output}.zim ...`);

  const creator = new ZimCreator({
    fileName: `./dist/${target.output}.zim`,
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
    Source: `https://phet.colorado.edu/${target.languages[0]}/simulations/`,
    Scraper: 'openzim/phet'
  });

  const bar = new progress.SingleBar({}, progress.Presets.shades_classic);
  const files = glob.sync(`${targetDir}/*`, {});
  bar.start(files.length, 0);

  await Promise.all(files.map(async (url) => {
    await creator.addArticle(
      new ZimArticle({
        url: path.basename(url),
        data: await fs.promises.readFile(url),
        ns: getNamespaceByExt(path.extname(url).slice(1))
      })
    );
    bar.increment();
  }));
  bar.stop();
  await creator.finalise();
  log.info('Created.');
};


const exportData = async () => {
  const now = new Date();
  const targets = Object.keys(languages)
    .map(lang => {
      return {
        // todo refactor this
        output: `phet_${lang.toLowerCase().replace('_', '-')}_${now.getUTCFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}`,
        languages: [lang]
      };
    }).concat({
      // todo refactor this
      output: `phet_mul_${now.getUTCFullYear()}-${('0' + (now.getMonth() + 1)).slice(-2)}`,
      languages: Object.keys(languages)
    });

  for (const target of targets) {
    await exportTarget(target);
  }
};

(async () => {
  welcome('export');
  await exportData();
  log.info('Done.');
})();

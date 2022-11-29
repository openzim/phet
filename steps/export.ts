import * as fs from 'fs';

import * as ncp from 'ncp';
import * as glob from 'glob';
import * as path from 'path';
import * as yargs from 'yargs';
import {promisify} from 'util';
import * as rimraf from 'rimraf';
import * as dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import * as iso6393 from 'iso-639-3';
import {ZimArticle, ZimCreator} from '@openzim/libzim';

import {log} from '../lib/logger';
import {Target} from '../lib/types';
import welcome from '../lib/welcome';
import {Catalog} from '../lib/classes';
import {Presets, SingleBar} from 'cli-progress';
// @ts-ignore
import * as langs from '../state/get/languages.json';
import { exit } from 'yargs';
import { catalogJs } from '../res/templates/catalog'

dotenv.config();

const {argv} = yargs
  .array('includeLanguages')
  .array('excludeLanguages')
  .boolean('mulOnly');

const languages = Object.entries(langs)
  .reduce((acc, [key, value]) => {
    if (argv.includeLanguages && !(argv.includeLanguages as string[] || []).includes(key)) return acc;
    if (argv.excludeLanguages && (argv.excludeLanguages as string[] || []).includes(key)) return acc;  // noinspection RedundantIfStatementJS
    return {...acc, [key]: value};
  }, {});

const catalogsDir = 'state/get/catalogs';
const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

const verbose = process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false;

(ncp as any).limit = 16;
const rimrafPromised = promisify(rimraf);

const namespaces = {
  // ico: '-',
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


const extractResources = async (target, targetDir: string): Promise<void> => {
  const bar = new SingleBar({}, Presets.shades_classic);
  const files = glob.sync(`${inDir}/*_@(${target.languages.join('|')}).html`, {});
  bar.start(files.length, 0);

  for (const file of files) {
    try {
      let html = await fs.promises.readFile(file, 'utf8');
      const $ = cheerio.load(html);

      const filesToExtract = $('[src]').toArray().map(a => $(a).attr('src'));
      await fs.promises.copyFile(`${file.split('_')[0]}.png`, `${targetDir}${path.basename(file).split('_')[0]}.png`);

      await Promise.all(filesToExtract.map(async fileName => {
        if (fileName.length > 40 || fileName.search(/this\.image/) !== -1) return;
        const ext = path.extname(fileName).slice(1);
        html = html.replace(fileName, `${getKiwixPrefix(ext)}${fileName}`);

        let file = await fs.promises.readFile(`${inDir}${fileName}`, 'utf8');
        file = addKiwixPrefixes(file, targetDir);
        return await fs.promises.writeFile(`${targetDir}${path.basename(fileName)}`, file, 'utf8');
      }));
      await fs.promises.writeFile(`${targetDir}${path.basename(file)}`, html, 'utf8');
    } catch (e) {
      if (verbose) {
        log.error(`Failed to extract resources from: ${file}`);
        log.error(e);
      } else {
        log.warn(`Unable to extract resources from: ${file}. Skipping it.`);
      }
    } finally {
      bar.increment();
      if (!process.stdout.isTTY) log.info(` + ${path.basename(file)}`);
    }
  }
  bar.stop();
};

const exportTarget = async (target: Target) => {
  const targetDir = `${outDir}${target.output}/`;

  await rimrafPromised(targetDir);
  await fs.promises.mkdir(targetDir);
  await extractResources(target, targetDir);

  const catalog = new Catalog({target, languages, catalogsDir});
  await catalog.init();
  if (catalog.isEmpty()) {
    log.info(`Skipping ${target.output}.zim (empty)`);
    return;
  }

  // Generate index file
  await fs.promises.copyFile(resDir + 'template.html', targetDir + 'index.html')
       
  // Generate catalog JS
  await fs.promises.writeFile(targetDir + 'catalog.js', catalogJs(catalog, target.output), 'utf8');

  await Promise.all(glob.sync(`${resDir}/**/*`, {ignore: ['*/templates/*', '*.ts', 'template.html'], nodir: true})
    .map(async (file) => fs.promises.copyFile(file, `${targetDir}${path.basename(file)}`))
  );

  const languageCode = target.languages.length > 1 ? 'mul' : getISO6393(target.languages[0]) || 'mul';

  log.info(`Creating ${target.output}.zim ...`);

  const creator = new ZimCreator({
    fileName: `./dist/${target.output}.zim`,
    welcome: 'index.html',
    fullTextIndexLanguage: languageCode,
    compression: 'zstd'
  }, {
    Name: `phets_${languageCode}`,
    Title: 'PhET Interactive Simulations',
    Description: 'Interactive simulations for Science and Math',
    Creator: 'University of Colorado',
    Publisher: 'Kiwix',
    Language: languageCode,
    Date: `${target.date.getUTCFullYear()}-${(target.date.getUTCMonth() + 1).toString().padStart(2, '0')}-${target.date.getUTCDate().toString().padStart(2, '0')}`,
    Tags: '_category:phet;_pictures:yes;_videos:no',
    // the following two metadata keys don't supported by ZimCreator yet, so that we have to ts-ignore them
    // todo: remove this further
    // @ts-ignore
    Source: `https://phet.colorado.edu/${target.languages[0]}/simulations/`,
    Scraper: 'openzim/phet'
  });

  const bar = new SingleBar({}, Presets.shades_classic);
  const files = glob.sync(`${targetDir}/*`, {});
  bar.start(files.length, 0);

  for (const file of files) {
    await creator.addArticle(
      new ZimArticle({
        url: path.basename(file),
        title: catalog.getTitle(path.basename(file)),
        data: await fs.promises.readFile(file),
        ns: getNamespaceByExt(path.extname(file).slice(1))
      })
    );
    bar.increment();
  }
  bar.stop();
  await creator.finalise();
  log.info('Created.');
};


const exportData = async () => {
  const now = new Date();
  const datePostfix = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`;

  const targets: Target[] = [{
    output: `phet_mul_${datePostfix}`,
    date: now,
    languages: Object.keys(languages)
      .filter(lang => {
        const langCode = /^(\w{2})_/gm.exec(lang)?.pop();
        return !langCode || !Object.keys(languages).includes(langCode);
      })
  }];
  if (!argv.mulOnly) {
    for (const lang of Object.keys(languages)) {
      targets.push({
        output: `phet_${lang.toLowerCase().replace('_', '-')}_${datePostfix}`,
        date: now,
        languages: [lang]
      });
    }
  }

  for (const target of targets) {
    await exportTarget(target);
  }
};

(async () => {
  welcome('export');
  await exportData();
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

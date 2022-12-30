import * as fs from 'fs';
import glob from 'glob';
import * as path from 'path';
import yargs from 'yargs';
import {promisify} from 'util';
import rimraf from 'rimraf';
import * as dotenv from 'dotenv';
import * as cheerio from 'cheerio';
import {iso6393} from 'iso-639-3';
import {ZimArticle, ZimCreator} from '@openzim/libzim';

import {log} from '../lib/logger.js';
import {Target} from '../lib/types.js';
import welcome from '../lib/welcome.js';
import {Catalog} from '../lib/classes.js';
import {Presets, SingleBar} from 'cli-progress';
import {hideBin} from 'yargs/helpers';
import { fileURLToPath } from 'url';
import { catalogJs } from '../res/templates/catalog.js';
import Banana from 'banana-i18n';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const {argv} = yargs(hideBin(process.argv))
  .array('includeLanguages')
  .array('excludeLanguages')
  .boolean('mulOnly');

const langsFile = await fs.promises.readFile(path.join(__dirname, '../state/get/languages.json'));
const langs = JSON.parse(langsFile.toString());

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

const addKiwixPrefixes = function addKiwixPrefixes(file) {
  const resources = file.match(/[0-9a-f]{32}\.(svg|jpg|jpeg|png|js)/g) || [];
  return resources
    .reduce((file, resName) => {
      const ext = path.extname(resName).slice(1);
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
        file = addKiwixPrefixes(file);
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

const loadTranslations = async(locale: string) => {
  try{
    const translations = await fs.promises.readFile(path.join(__dirname, `../res/js/i18n/${locale}.json`));
    return JSON.parse(translations.toString());
  }catch(err){
    if(err?.name.includes('SyntaxError')) {
      throw new Error(`Can't parse translations file: ${locale}.json. `);
    }
    return {};
  }
};

const exportTarget = async (target: Target, bananaI18n: Banana) => {
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
  await fs.promises.copyFile(resDir + 'template.html', targetDir + 'index.html');

  // Generate catalog JS
  await fs.promises.writeFile(targetDir + 'catalog.js', catalogJs(catalog, target.output), 'utf8');

  await Promise.all(glob.sync(`${resDir}/**/*`, {ignore: ['*/templates/*', '*.ts', '*/template.html'], nodir: true})
    .map(async (file) => fs.promises.copyFile(file, `${targetDir}${path.basename(file)}`))
  );

  const languageCode = target.languages.length > 1 ? 'mul' : getISO6393(target.languages[0]) || 'mul';

  const locale = languageCode === 'mul' ? 'en' : target.languages[0];

  if(locale !== 'en') {
    const translations = await loadTranslations(locale);
    bananaI18n.load(translations, locale);
  }
  bananaI18n.setLocale(locale);

  log.info(`Creating ${target.output}.zim ...`);

  const creator = new ZimCreator({
    fileName: `./dist/${target.output}.zim`,
    welcome: 'index.html',
    fullTextIndexLanguage: languageCode,
    compression: 'zstd'
  }, {
    Name: `phets_${languageCode}`,
    Title: bananaI18n.getMessage('zim-title'),
    Description: bananaI18n.getMessage('zim-description'),
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
        ns: getNamespaceByExt(path.extname(file).slice(1)),
        shouldIndex: file.split('.').pop() === 'html' ? true : false
      })
    );
    bar.increment();
  }
  bar.stop();
  await creator.finalise();
  log.info('Created.');
};

const convertTranslations = async () => {
  log.info('Converting translations to JS');

  const bar = new SingleBar({}, Presets.shades_classic);
  const translationsFolder = path.join(__dirname, '../res/js/i18n/');
  const files = glob.sync(`${translationsFolder}**/*.json`, {});
  bar.start(files.length, 0);

  for (const file of files) {
    try {
      const translations = await fs.promises.readFile(file, 'utf8');
      const jsTranslations = `window.phetTranslations = ${translations};`;
      await fs.promises.writeFile(`${file}.js`, jsTranslations, 'utf8');
    } catch (e) {
      if (verbose) {
        log.error(`Failed to extract translations from: ${file}`);
        log.error(e);
      } else {
        log.warn(`Unable to extract translations from: ${file}. Skipping it.`);
      }
    } finally {
      bar.increment();
      if (!process.stdout.isTTY) log.info(` + ${path.basename(file)}`);
    }
  }
  bar.stop();
  log.info('Converted.');
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

  await convertTranslations();

  const defaultTranslations = await loadTranslations('en');
  const banana = new Banana('en', { messages: defaultTranslations });
  for (const target of targets) {
    await exportTarget(target, banana);
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
  yargs(hideBin(process.argv)).exit(1, err);
});

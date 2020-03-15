///<reference path="shim.d.ts" />

import { Catalog, Simulation } from './types';
const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';


import * as iso6393 from 'iso-639-3';
import * as fs from 'fs';
import * as cheerio from 'cheerio';
import * as rimraf from 'rimraf';
import * as config from '../config';
import * as cp from 'child_process';
import * as async from 'async';
import * as ncp from 'ncp';
import * as copy from 'copy';
import * as glob from 'glob';
import * as path from 'path';
import {ZimCreator, ZimArticle} from '@openzim/libzim';

const spawn = cp.spawn;
(<any>ncp).limit = 16;

const kiwixPrefix = {
  js: '../-/',
  svg: '../I/',
  png: '../I/',
  jpg: '../I/',
  jpeg: '../I/'
};

const sims: Simulation[] = require('../state/get/catalog.json');

const copyFileSync = function copyFileSync(from, to) {
  fs.writeFileSync(to, fs.readFileSync(from));
};

var getLanguage = function (fileName) {
  return fileName.split('_').pop().split('.')[0];
};

const addKiwixPrefixes = function addKiwixPrefixes(file, targetDir) {
  const resources = file.match(/[0-9a-f]{32}\.(svg|jpg|jpeg|png|js)/g) || [];
  return resources
    .reduce((file, resName) => {
      const ext = resName.split('.').slice(-1)[0];
      ncp(`${inDir}${resName}`, `${targetDir}${resName}`);
      return file.replace(resName, `${kiwixPrefix[ext]}${resName}`);
    }, file);
};

const getISO6393 = function getISO6393(lang = 'en') {
  lang = lang.split('_')[0];
  return (iso6393.find(l => l.iso6391 === lang) || {}).iso6393;
};

async.series(config.buildCombinations.map((combination) => {
  return (handler) => {
    const targetDir = `${outDir}${combination.output}/`;
    rimraf(targetDir, function (err) {
      fs.mkdir(targetDir, function () {

        fs.readdirSync(inDir)
          .filter(fileName => fileName.split('.').pop() === 'html')
          .filter(fileName => !!~combination.languages.indexOf(getLanguage(fileName)))
          .forEach((fileName) => {

            let html = fs.readFileSync(inDir + fileName, 'utf8');
            const $ = cheerio.load(html);

            const filesToCopy = $('[src]').toArray().map(a => $(a).attr('src'));
            copyFileSync(`${inDir}${fileName.split('_')[0]}.png`, `${targetDir}${fileName.split('_')[0]}.png`);
            filesToCopy.forEach(fileName => {
              if (fileName.length > 40) return;
              const ext = fileName.split('.').slice(-1)[0];
              html = html.replace(fileName, `${kiwixPrefix[ext]}${fileName}`);

              let file = fs.readFileSync(`${inDir}${fileName}`, 'utf8');

              file = addKiwixPrefixes(file, targetDir);

              fs.writeFileSync(`${targetDir}${fileName}`, file, 'utf8');
            });

            fs.writeFileSync(`${targetDir}${fileName}`, html, 'utf8');
          });

        //Generate Catalog.json file
        const simsByLanguage = sims.reduce((acc, sim) => {
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

        //Generate index file
        const templateHTML = fs.readFileSync(resDir + 'template.html', 'utf8');
        fs.writeFileSync(targetDir + 'index.html', //Pretty hacky - doing a replace on the HTML. Investigate other ways
          templateHTML
            .replace('<!-- REPLACEMEINCODE -->', JSON.stringify(catalog))
            .replace('<!-- SETLSPREFIX -->', `lsPrefix = "${combination.output}";`), 'utf8');

        async.each(['js', 'css', 'fonts', 'img'], function (path, next) {
          copy(`${resDir}${path}/*`, targetDir, next);
        }, async () => {
          const languageCode = combination.languages.length > 1 ? 'mul' : getISO6393(combination.languages[0]) || 'mul';

          console.log(`Creating Zim file for ${languageCode}...`);

          const creator = new ZimCreator({
            fileName: `./dist/${combination.output}.zim`,
            welcome: 'index.html',
            fullTextIndexLanguage: languageCode
          }, {
            Name: 'phets',  // TODO: here too, the language code should be append
            Title: 'PhET Interactive Simulations',
            Description: 'Interactives simulations for Science and Math',
            Creator: 'University of Colorado',
            Publisher: 'Kiwix',
            Language: languageCode  // TODO: to replace with real ISO639-3 lang code
            // Tags: //todo
          });

          await Promise.all(glob.sync(`${targetDir}/*`, {})
            .map(async (url, i) => creator.addArticle(new ZimArticle({url: path.basename(url), data: await fs.readFileSync(url)}))));

          await creator.finalise();

          console.log('Done Writing');
          handler(null, null);
        });
      });
    });
  }
}));

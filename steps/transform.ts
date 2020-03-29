import * as fs from 'fs';
import * as md5 from 'md5';
import * as glob from 'glob';
import * as path from 'path';
import * as dotenv from 'dotenv';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import * as imagemin from 'imagemin';

import * as minifier from 'html-minifier';
import * as imageminSvgo from 'imagemin-svgo';
import {Presets, SingleBar} from 'cli-progress';
import * as imageminGifsicle from 'imagemin-gifsicle';
import * as imageminPngcrush from 'imagemin-pngcrush';
import * as imageminJpegoptim from 'imagemin-jpegoptim';

import {log} from '../lib/logger';
import welcome from '../lib/welcome';
import {barOptions} from '../lib/common';
import {Base64Entity, Transformer} from '../lib/classes';


dotenv.config();

const inDir = 'state/get/';
const outDir = 'state/transform/';
const workers = process.env.PHET_WORKERS !== undefined ? parseInt(process.env.PHET_WORKERS, 10) : 10;
const verbose = process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false;

const convertImages = async (): Promise<void> => {
  log.info('Converting images...');
  const transformer = new Transformer({
    source: `${inDir}/*.{jpg,jpeg,png,svg}`,
    bar: new SingleBar(barOptions, Presets.shades_classic),
    workers,
    handler: async (file) => await imagemin([file], outDir, {
      glob: false,
      plugins: [imageminJpegoptim(), imageminPngcrush(), imageminSvgo(), imageminGifsicle()]
    })
  });
  await transformer.transform();
};

const convertDocuments = async (): Promise<void> => {
  log.info('Converting documents...');
  const transformer = new Transformer({
    source: `${inDir}/*.html`,
    bar: new SingleBar(barOptions, Presets.shades_classic),
    workers,
    handler: async (file) => {
      let data = await fs.promises.readFile(file, 'utf8');
      const basename = path.basename(file);
      data = await extractBase64(basename, data);
      data = removeStrings(data);
      data = await extractLanguageElements(basename, data);
      await fs.promises.writeFile(`${outDir}${basename}`, data, 'utf8');
    }
  });
  await transformer.transform();
};

const extractLanguageElements = async (fileName, html): Promise<string> => {
  const $ = cheerio.load(html);
  await Promise.all($('script')
    .toArray()
    .map(script => op.get(script, 'children.0.data', ''))
    .filter(x => x)
    .map(async (script, index) => {
      const newFileName = md5(script);
      try {
        await fs.promises.writeFile(`${outDir}${newFileName}.js`, script.trim(), 'utf8');
        html = html.replace(script, `</script><script src='${newFileName}.js'>`);
      } catch (e) {
        if (verbose) {
          log.error(`Failed to extract script from ${fileName}`);
          log.error(e);
        } else {
          log.warn(`Unable to extract script from ${fileName}. Skipping it.`);
        }
      }
    })
  );
  return html;
};

const removeStrings = (html): string => {
  const htmlSplit = html.split('// ### START THIRD PARTY LICENSE ENTRIES ###');
  if (htmlSplit.length === 1) return html;
  html = htmlSplit[0] + htmlSplit[1].split('// ### END THIRD PARTY LICENSE ENTRIES ###')[1];
  html = minifier.minify(html, {removeComments: true});
  return html;
};

const extractBase64 = async (fileName, html): Promise<string> => {
  const b64files = html.match(/( src=)?'data:([A-Za-z-+\/]+);base64,[^']*/g);

  await Promise.all((b64files || [])
    .map(async b64entry => {
      const isInSrc = b64entry.slice(0, 6) === ' src="';
      b64entry = b64entry.slice(isInSrc ? 6 : 1);

      const b64element = new Base64Entity(b64entry);
      if (b64element.isEmpty()) return html;

      const fileExt = path.extname(b64element.mimeType).slice(1);
      if (['ogg', 'mpeg'].includes(fileExt)) return html;

      const newName = md5(b64element.data);
      html.replace(b64entry, `${newName}.${fileExt}`);

      await fs.promises.writeFile(`${outDir}${newName}.${fileExt}`, b64element.data, {encoding: 'base64'});
      await fs.promises.writeFile(`${outDir}${fileName}`, html, 'utf8');
    }));

  return html;
};

(async () => {
  welcome('transform');
  await convertImages();
  await convertDocuments();
  log.info('Done.');
})();

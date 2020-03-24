import * as fs from 'fs';
import * as md5 from 'md5';
import * as glob from 'glob';
import * as path from 'path';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import {minify} from 'html-minifier';
import * as imagemin from 'imagemin';
import asyncPool from 'tiny-async-pool';
import * as progress from 'cli-progress';
import * as imageminSvgo from 'imagemin-svgo';
import * as imageminGifsicle from 'imagemin-gifsicle';
import * as imageminPngcrush from 'imagemin-pngcrush';
import * as imageminJpegoptim from 'imagemin-jpegoptim';

import {log} from '../lib/logger';
import welcome from '../lib/welcome';
import * as config from '../config.js';
import {Base64Entity} from '../lib/classes';


const inDir = 'state/get/';
const outDir = 'state/transform/';

const transform = async () => {
  log.info('Converting images...');
  const images: string[] = await Promise.all(glob.sync(`${inDir}/*.{jpg,jpeg,png,svg}`, {}));
  const bar = new progress.SingleBar({}, progress.Presets.shades_classic);

  bar.start(images.length, 0);
  await asyncPool(
    config.workers,
    images,
    async (file) => imagemin([file], outDir, {
      plugins: [
        imageminJpegoptim(),
        imageminPngcrush(),
        imageminSvgo(),
        imageminGifsicle()
      ]
    })
      .catch(err => {
        const failedFile = err.message.match(/Error in file: (.*)/)[1].trim();
        log.info(err.message);
        fs.unlink(failedFile, () => log.info('The following file is invalid and was deleted:', failedFile));
      })
      .finally(() => bar.increment())
  );
  bar.stop();

  log.info('Processing documents...');
  const documents: string[] = await Promise.all(glob.sync(`${inDir}/*.html`, {}));

  bar.start(documents.length, 0);
  await asyncPool(
    config.workers,
    documents,
    async (file) => {
      try {
        let data = (await fs.promises.readFile(file, 'utf8'));
        const basename = path.basename(file);
        data = await extractBase64(basename, data);
        data = removeStrings(data);
        data = await extractLanguageElements(basename, data);
        return fs.promises.writeFile(`${outDir}${basename}`, data, 'utf8');
      } catch (err) {
        log.error(`Error while processing the file: ${file}`);
        log.error(err.message);
      } finally {
        bar.increment();
      }
    }
  );
  bar.stop();
  log.info('Done.');
};


const extractLanguageElements = async (fileName, html): Promise<string> => {
  const $ = cheerio.load(html);

  await Promise.all($('script')
    .toArray()
    .map(script => op.get(script, 'children.0.data', ''))
    .filter(x => x)
    .map(async (script, index) => {
      const newFileName = md5(script);
      await fs.promises.writeFile(`${outDir}${newFileName}.js`, script.trim(), 'utf8');
      return html.replace(script, `</script><script src='${newFileName}.js'>`);
    })
  );
  return html;
};

const removeStrings = (html): string => {
  const htmlSplit = html.split('// ### START THIRD PARTY LICENSE ENTRIES ###');
  if (htmlSplit.length === 1) return html;
  html = htmlSplit[0] + htmlSplit[1].split('// ### END THIRD PARTY LICENSE ENTRIES ###')[1];
  html = minify(html, {removeComments: true});
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
  await transform();
})();

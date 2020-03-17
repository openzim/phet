import md5 from 'md5';
import * as fs from 'fs';
import * as glob from 'glob';
import * as path from 'path';
import * as cheerio from 'cheerio';
import * as imagemin from 'imagemin';
import asyncPool from 'tiny-async-pool';
import * as progress from 'cli-progress';
import * as imageminSvgo from 'imagemin-svgo';
import {minify as htmlminify} from 'html-minifier';
import * as imageminGifsicle from 'imagemin-gifsicle';
import * as imageminPngcrush from 'imagemin-pngcrush';
import * as imageminJpegoptim from 'imagemin-jpegoptim';
import * as config from '../config.js';


const inDir = 'state/get/';
const outDir = 'state/transform/';
const tmpDir = 'state/tmp/';


const transform = async () => {
  console.log('Converting images:');
  const images: string[] = await Promise.all(glob.sync(`${inDir}/*.{jpg,jpeg,png,svg}`, {}));

  const bar = new progress.SingleBar({}, progress.Presets.shades_classic);
  bar.start(images.length, 0);
  await asyncPool(
    config.workers,
    images,
    async (file) => {
      bar.increment();
      return imagemin([file], outDir, {
        plugins: [
          imageminJpegoptim(),
          imageminPngcrush(),
          imageminSvgo(),
          imageminGifsicle()
        ]
      })
        .catch(err => {
          const failedFile = err.message.match(/Error in file: (.*)/)[1].trim();
          console.log(err.message);
          fs.unlink(failedFile, () => console.log('The following file is invalid and was deleted:', failedFile));
        });
    }
  );

  bar.stop();

  await asyncPool(
    config.workers,
    images,
    async (file) => fs.promises.copyFile(inDir + file, tmpDir + file)
  );

  console.log('Processing documents:');
  const documents: string[] = await Promise.all(glob.sync(`${inDir}/*.png`, {}));
  await asyncPool(
    config.workers,
    documents,
    async (file) => {
      let data = (await fs.promises.readFile(inDir + file, 'utf8'));
      data = extractBase64(file, data);
      data = removeStrings(data);
      data = extractLanguageElements(file, data);
      await fs.promises.writeFile(`${outDir}${file}`, data, 'utf8');
    }
  );
};


const extractLanguageElements = (fileName, html) => {
  const $ = cheerio.load(html);

  const scripts = $('script').toArray().map(script => {
    // @ts-ignore // todo
    return (script.children[0] || {}).data || '';
  }).filter(a => a);

  return scripts.reduce((acc, script, index) => {
    const newFileName = md5(script);


    // todo refactor this
    try { // File Exists
      // @ts-ignore
      stats = fs.statSync(outDir + newFileName);
    } catch (e) { // File does not exist
      fs.writeFileSync(`${outDir}${newFileName}.js`, script.trim(), 'utf8');
    }

    return acc.replace(script, `</script><script src='${newFileName}.js'>`);
  }, html);

};

const removeStrings = html => {
  const htmlSplit = html.split('// ### START THIRD PARTY LICENSE ENTRIES ###');
  html = htmlSplit[0] + htmlSplit[1].split('// ### END THIRD PARTY LICENSE ENTRIES ###')[1];

  html = htmlminify(html, {
    removeComments: true,
  });
  return html;
};

const extractBase64 = (fileName, html) => {
  const b64files = html.match(/( src=)?'data:([A-Za-z-+\/]+);base64,[^']*/g);

  return (b64files || []).reduce((html, b64, index) => {
    const isInSrc = b64.slice(0, 6) === ' src="';
    b64 = b64.slice(isInSrc ? 6 : 1);

    const split = b64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

    if (!split || split.length !== 3) {
      // log('No valid b64, continuing anyway.');
      return html;
    }

    const mimeType = split[1];
    if (!mimeType) {
      // log('No mimeType, continuing anyway.');
      return html;
    }

    const fileExt = path.extname(mimeType).slice(1);

    if (!split[2].length) return html;

    if (fileExt === 'ogg') return html;
    if (fileExt === 'mpeg') return html;
    // if (fileExt === 'gif') return html;
    // if (fileExt === 'jpeg') return html;
    // if (fileExt === 'png') return html;

    const isImage = mimeType.split('/')[0] === 'image';

    if (!isImage) console.log(mimeType);

    const newName = md5(split[2]);

    html = html.replace(b64, `${newName}.${fileExt}`);

    // todo refactor this
    try { // File Exists
      const stats = fs.statSync(`${tmpDir}${newName}.${fileExt}`);
    } catch (e) { // File does not exist
      fs.writeFileSync(`${tmpDir}${newName}.${fileExt}`, split[2], {encoding: 'base64'});
    }
    fs.writeFileSync(`${outDir}${fileName}`, html, 'utf8');
    return html;
  }, html);
};

(async () => transform())();

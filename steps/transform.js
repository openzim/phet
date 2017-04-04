const inDir = 'state/get/';
const outDir = 'state/transform/';
const tmpDir = 'state/tmp/';

const fs = require('fs');
const cheerio = require('cheerio');
const md5 = require('md5');
const config = require('../config.js');
const imagemin = require('imagemin');
const imageminJpegoptim = require('imagemin-jpegoptim');
const imageminPngcrush = require('imagemin-pngcrush');
const imageminSvgo = require('imagemin-svgo');
const imageminGifsicle = require('imagemin-gifsicle');
const htmlminify = require('html-minifier').minify;

const log = function () { config.verbose && console.log.apply(console, arguments) };
const error = function () { config.verbose && console.error.apply(console, arguments) };

var getLanguage = function (fileName) {
    return fileName.split('_').pop().split('.')[0];
};

const copyFile = (fromPath, toPath) => {
    return fs.createReadStream(fromPath).pipe(fs.createWriteStream(toPath));
};

//Copy PNG files
copyFileWorker = (index, step, files) => { //TODO: Refactor using highland
    const fileName = files[index];
    if (!fileName) return;
    copyFile(inDir + fileName, tmpDir + fileName).on('close', function () {
        copyFileWorker(index + step, step, files);
    });
};

const files = fs.readdirSync(inDir).filter(fileName => fileName.split('.').pop() === 'png');

//This only does 10 at a time, most machines can do better
copyFileWorker(0, 10, files); //TODO: Refactor into a workerGenerator
copyFileWorker(1, 10, files);
copyFileWorker(2, 10, files);
copyFileWorker(3, 10, files);
copyFileWorker(4, 10, files);
copyFileWorker(5, 10, files);
copyFileWorker(6, 10, files);
copyFileWorker(7, 10, files);
copyFileWorker(8, 10, files);
copyFileWorker(9, 10, files);

const extractLanguageElements = (fileName, html) => {
    const $ = cheerio.load(html);

    const scripts = $('script').toArray().map(script => {
        return (script.children[0] || {}).data || '';
    }).filter(a => a);

    return scripts.reduce((acc, script, index) => {
        const newFileName = md5(script);


        try { //File Exists
            stats = fs.statSync(outDir + newFileName);
        }
        catch (e) { //File does not exist
            fs.writeFileSync(`${outDir}${newFileName}.js`, script.trim(), 'utf8');
        }

        return acc.replace(script, `</script><script src='${newFileName}.js'>`);
    }, html);

};

const extractLicense = (html) => {

    const htmlSplit = html.split('// ### START THIRD PARTY LICENSE ENTRIES ###');
    const license = htmlSplit[1] + htmlSplit[1].split('// ### END THIRD PARTY LICENSE ENTRIES ###')[0];

    try { //File Exists
        stats = fs.statSync(outDir + newFileName);
    }
    catch (e) { //File does not exists
        fs.writeFileSync(`${outDir}license.js`, license, 'utf8');
    }

    html = html.replace(`<script type='text/javascript'>`, `<script src='license.js'></script><script type='text/javascript'>`);

    return html;
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
            //log('No valid b64, continuing anyway.');
            return html;
        }

        const mimeType = split[1];
        if (!mimeType) {
            //log('No mimeType, continuing anyway.');
            return html;
        }

        const fileExt = mimeType.split('/').pop().split('+')[0];

        if (!split[2].length) return html;

        if (fileExt === 'ogg') return html;
        if (fileExt === 'mpeg') return html;
        //if (fileExt === 'gif') return html;
        //if (fileExt === 'jpeg') return html;
        //if (fileExt === 'png') return html;

        const isImage = mimeType.split('/')[0] === 'image';

        if (!isImage) console.log(mimeType);

        const newName = md5(split[2]);

        html = html.replace(b64, `${newName}.${fileExt}`);
        try { //File Exists
            stats = fs.statSync(`${tmpDir}${newName}.${fileExt}`);
        }
        catch (e) { //File does not exist
            fs.writeFileSync(`${tmpDir}${newName}.${fileExt}`, split[2], { encoding: 'base64' });
        }
        fs.writeFileSync(`${outDir}${fileName}`, html, 'utf8');
        return html;
    }, html);
};


console.log('Compressing images, this will take a while');
const filesByLanguage = fs.readdirSync(inDir)
    .filter(fileName => fileName.split('.').pop() === 'html')
    .forEach(function (fileName, index) {
        var html = fs.readFileSync(inDir + fileName, 'utf8');

        //html = extractLicense(html);
        html = extractBase64(fileName, html);
        html = removeStrings(html);
        html = extractLanguageElements(fileName, html);

        fs.writeFileSync(`${outDir}${fileName}`, html, 'utf8');
    });

const chars = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];
const imageMinSlow = (index, secondIndex) => {
    console.log(`Copying compressed images beginning with: ${chars[index]}${chars[secondIndex]}`);

    imagemin([`${tmpDir}${chars[index]}${chars[secondIndex]}*.{jpg,jpeg,png,svg}`], outDir, {
        plugins: [
            imageminJpegoptim(),
            imageminPngcrush(),
            imageminSvgo(),
            imageminGifsicle()
        ]
    }).then(files => {
        if (secondIndex > chars.length) {
            imageMinSlow(index + 1, 0)
        } else if (index < chars.length) {
            imageMinSlow(index, secondIndex + 1);
        }
    }).catch(err => {
        const failedFile = err.message.match(/Error in file: (.*)/)[1].trim();
        console.log(err.message)
        fs.unlink(failedFile, () => {
            console.log('The following file is invalid and was deleted:', failedFile);
            imageMinSlow(index, secondIndex);
        });
    });
};
imageMinSlow(0, 0);
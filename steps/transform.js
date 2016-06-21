const inDir = 'state/get/';
const outDir = 'state/transform/';

const fs = require('fs');
const cheerio = require('cheerio');
const config = require('../config.json');

const copyFile = (fromPath, toPath) => {
    return fs.createReadStream(fromPath).pipe(fs.createWriteStream(toPath));
};

const log = function () { config.verbose && console.log.apply(console, arguments) };
const error = function () { config.verbose && console.error.apply(console, arguments) };

var getLanguage = function (fileName) {
    return fileName.split('_').pop().split('.')[0];
};

const extractBase64 = (fileName, html) => {
    const b64files = html.match(/data:([A-Za-z-+\/]+);base64,[^"]*/g);

    b64files.reduce((html, b64, index) => {
        const split = b64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);

        if (!split || split.length !== 3) {
            log('No valid b64, continuing anyway.');
            return html;
        }

        const mimeType = split[1];
        if (!mimeType) {
            log('No mimeType, continuing anyway.');
            return html;
        }

        const fileExt = mimeType.split('/')[1].split('+')[0];

        html = html.replace(b64, `/${fileName}_${index}.${fileExt}`);
        fs.writeFileSync(`${outDir}${fileName}_${index}.${fileExt}`, split[2], { encoding: 'base64' });
        fs.writeFileSync(`${outDir}${fileName}`, html, 'utf8');

        return html;
    }, html);
};


const filesByLanguage = fs.readdirSync(inDir).filter(fileName => fileName.split('.').pop() === 'html').
    reduce(function (acc, fileName) {
        var language = config.languageMappings[getLanguage(fileName)] || 'Misc';
        acc[language] = acc[language] || [];

        var html = fs.readFileSync(inDir + fileName, 'utf8');

        extractBase64(fileName, html);

        var $ = cheerio.load(html);
        var title = ($('meta[property="og:title"]').attr('content') || '');

        acc[language].push({
            displayName: title || fileName.split('_').slice(0, -1).join(' '),
            url: fileName,
            image: '../I/' + fileName.split('_')[0] + `-${config.imageResolution}.png`
        });
        return acc;
    }, {});

fs.writeFileSync(outDir + 'catalog.json', JSON.stringify({
    languageMappings: config.languageMappings,
    simsByLanguage: filesByLanguage
}), 'utf8');

fs.readdirSync(inDir).filter(fileName => fileName.split('.').pop() !== 'html').forEach(fileName => { //Copy html files from state/get to state/export
    copyFile(inDir + fileName, outDir + fileName);
});

//TODO: keeping the process alive until all streams are closed (it may be that this isn't even needed)
var checksum;

const checkState = _ => { //This is icky, but we kinda need it
    setTimeout(_ => {
        dirsum.digest(outDir, 'sha1', function (err, hashes) {
            if (!hashes) return console.log('CheckState ran into an issue, limping along anyway.');
            if (checksum === hashes.hash) process.exit(0); //Done
            else {
                console.log(hashes.hash, checksum)
                checksum = hashes.hash;
                checkState();
            }
        });
    }, 4000);
}
checkState();
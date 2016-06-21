const inDir = 'state/get/';
const outDir = 'state/transform/';

const fs = require('fs');
const cheerio = require('cheerio');
const config = require('../config.json');

var getLanguage = function (fileName) {
    return fileName.split('_').pop().split('.')[0];
};

const extractBase64 = (fileName, html) => {
    const b64files = html.match(/( src=)?"data:([A-Za-z-+\/]+);base64,[^"]*/g);

    b64files.reduce((html, b64, index) => {
        const isInSrc = b64.slice(0, 6) === ' src="';
        b64 = b64.slice(isInSrc ? 6 : 1);

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

        const fileExt = mimeType.split('/').pop().split('+')[0];

        if(fileExt === 'gif') return html;
        if(fileExt === 'ogg') return html;
        if(fileExt === 'mpeg') return html;
        if(fileExt === 'jpeg') return html;

        const isImage = mimeType.split('/')[0] === 'image';

        if(!isImage) console.log(mimeType);

        const kiwixPrefix = isInSrc ? '' : '../I/';

        html = html.replace(b64, `${kiwixPrefix}${fileName.replace('.html', '')}_${index}.${fileExt}`);
        fs.writeFileSync(`${outDir}${fileName.replace('.html', '')}_${index}.${fileExt}`, split[2], { encoding: 'base64' });
        fs.writeFileSync(`${outDir}${fileName}`, html, 'utf8');

        return html;
    }, html);
};


const filesByLanguage = fs.readdirSync(inDir).filter(fileName => fileName.split('.').pop() === 'html').
    reduce(function (acc, fileName) {
        var language = config.languageMappings[getLanguage(fileName)] || 'Misc';
        acc[language] = acc[language] || [];

        var html = fs.readFileSync(inDir + fileName, 'utf8');
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
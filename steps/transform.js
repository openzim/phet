const inDir = 'state/get/';
const outDir = 'state/transform/';

const fs = require('fs');
const cheerio = require('cheerio');
const config = require('../config.json');

var getLanguage = function (fileName) {
    return fileName.split('_').pop().split('.')[0];
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
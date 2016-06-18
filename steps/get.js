const inDir = '';
const outDir = 'state/get/';


const defaultConfig = {
    languages: ['en']
};

const dirsum = require('dirsum');
const request = require('request');
const cheerio = require('cheerio');
const async = require('async');
const fs = require('fs');
const config = Object.assign(defaultConfig, require('../config.json'));


const getDlUrls = (name, languages) => {
    return languages.reduce((acc, language) => {
        return acc.concat([
            `http://phet.colorado.edu/sims/html/${name}/latest/${name}_${language}.html`, //Download Simulation itself
            `http://phet.colorado.edu/sims/html/${name}/latest/${name}-128.png`
        ]);
    }, []);
};


request('http://phet.colorado.edu/en/offline-access', function (err, res, body) {
    const $ = cheerio.load(body);

    const urls = $('.oa-html5 > a').toArray().map(function (item) {
        const href = $(item).attr('href'); // "/sims/html/acid-base-solutions/latest/acid-base-solutions_en.html?download"
        const name = href.split('_')[0].split('/').pop(); // "acid-base-solutions"

        return name; // ['acid-base-solutions', '....']
    }).reduce((acc, name) => acc.concat(getDlUrls(name, config.languages)), []); //['...html', '...png', '...pdf', '...html']



    urls.forEach(function (url, next) { // item: http://phet.col....solutions.html
        const fileName = url.split('/').pop();
        const writeStream = fs.createWriteStream(outDir + fileName);

        request(url).pipe(writeStream);

    });

    var checksum;

    const checkState = _ => {
        setTimeout(_ => {
            dirsum.digest(outDir, 'sha1', function (err, hashes) {
                if (checksum === hashes.hash) process.exit(0); //Done
                else {
                    checksum = hashes.hash;
                    checkState();
                }
            });
        }, 1000);
    }
    checkState();
});
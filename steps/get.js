const inDir = '';
const outDir = 'state/get/';


const defaultConfig = {
    verbose: false,
    languageMappings: { 'en': 'English' },
    workers: 10,
    imageResolution: 600
};

const makeArr = num => Array(num).join(',').split(','); //TODO: remove when spread operator is in stable node

const dirsum = require('dirsum');
const request = require('request');
const cheerio = require('cheerio');
const async = require('async');
const fs = require('fs');
const config = Object.assign(defaultConfig, require('../config.js'));

const log = function () { config.verbose && console.log.apply(console, arguments) };
const error = function () { config.verbose && console.error.apply(console, arguments) };

const syncMap = (arr, iterator, done, acc) => {
    acc = acc || [];
    if (arr.length === 0) return done(acc);
    iterator(arr[0], val => {
        syncMap(arr.slice(1), iterator, done, acc.concat(val));
    });
};


//TODO: maybe implement some kind of worker system for this (genericise from below)
syncMap(Object.keys(config.languagesToGet).map(language => ({ url: `https://phet.colorado.edu/${language}/offline-access`, language })), (data, next) => {
    log(`Getting urls for ${data.language}`);
    request(data.url, function (err, res, body) {
        if (err || !res || res.statusCode !== 200 || !body) {
            error(`Failed to get urls for language ${data.language}`, err);
            next([]); //Should probably do some error stuff here, but it's not a breaking issue
            return;
        }

        const $ = cheerio.load(body);

        const urls = $('.oa-html5 > a').toArray().map(function (item) {
            const href = $(item).attr('href'); // "/sims/html/acid-base-solutions/latest/acid-base-solutions_en.html?download"
            const name = href.split('_')[0].split('/').pop(); // "acid-base-solutions"

            return name; // ['acid-base-solutions', '....']
        }).map(name => `https://phet.colorado.edu/sims/html/${name}/latest/${name}_${data.language}.html`);
        log(`Got ${urls.length} urls for ${data.language}`);
        next(urls);
    });
}, (results) => {
    console.log('Beginning');

    const simURLs = results.reduce((acc, results) => acc.concat(results), []);
    const imageURLs = simURLs.map(url => url.split('_')[0]).sort().filter((url, index, arr) => url != arr[index - 1]).map(url => url + `-${config.imageResolution}.png`);

    const urls = simURLs.concat(imageURLs);

    log(`Beginning download of ${urls.length}`);

    const tasks = urls.map((url, index) => {
        return function (handler) {
            console.log(`Progress: ${Math.floor(((index + 1) / urls.length) * 100)}%`);
            const req = request(url);
            const fileName = url.split('/').pop();
            const writeStream = fs.createWriteStream(outDir + fileName);

            req.on('response', function (response) {
                if (response.statusCode !== 200) {
                    error(`${fileName} gave a ${response.statusCode}`);

                    fs.unlink(outDir + fileName, function (err) {
                        if (err) error(`Failed to delete item: ${err}`);
                    });
                }

            }).pipe(writeStream);

            writeStream.on('close', _ => {
                handler(null, null);
            });
        }
    });

    async.parallelLimit(tasks, config.workers, function () {
        console.log('done')
        process.exit(0);
    });
});
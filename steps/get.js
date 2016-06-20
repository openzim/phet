const inDir = '';
const outDir = 'state/get/';


const defaultConfig = {
    verbose: false,
    languageMappings: { 'en': 'English' },
    workers: 10
};

const makeArr = num => Array(num).join(',').split(','); //TODO: remove when spread operator is in stable node

const dirsum = require('dirsum');
const request = require('request');
const cheerio = require('cheerio');
const async = require('async');
const fs = require('fs');
const config = Object.assign(defaultConfig, require('../config.json'));

const log = function () { config.verbose && console.log.apply(console, arguments) };
const error = function () { config.verbose && console.error.apply(console, arguments) };

const syncMap = (arr, iterator, done, acc) => {
    acc = acc || [];
    if(arr.length === 0) return done(acc);
    iterator(arr[0], val => {
        syncMap(arr.slice(1), iterator, done, acc.concat(val));
    });
};


//TODO: maybe implement some kind of worker system for this (genericise from below)
syncMap(Object.keys(config.languageMappings).map(language => ({ url: `https://phet.colorado.edu/${language}/offline-access`, language })), (data, next) => {
    log(`Getting urls for ${data.language}`);
    request(data.url, function (err, res, body) {
        if (err || !res || res.statusCode !== 200 || !body) {
            error(`Failed to get urls for language ${data.language}`);
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
    const imageURLs = simURLs.map(url => url.split('_')[0]).sort().filter((url, index, arr) => url != arr[index - 1]).map(url => url + '-600.png');

    const urls = simURLs.concat(imageURLs);

    const getFile = (urls, index, step, id, handler) => {
        const url = urls[index];
        if (!url) return log(`Worker ${id} finished`);

        log(`Worker ${id} downloading ${index}`);

        const req = request(url);
        req.on('error', err => error('Request Error', err));

        return handler(req, url, index, step, id, handler);
    };

    const spawnWorkers = (num, urls, handler) => { //TODO, refactor again!
        makeArr(num).forEach((_, index) => getFile(urls, index, num, index, handler));
    };

    log(`Beginning download of ${urls.length}`);

    spawnWorkers(config.workers, urls, (req, url, index, step, id, handler) => {
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

        writeStream.on('close', _ => getFile(urls, index + step, step, id, handler));
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

});
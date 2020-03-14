import * as fs from 'fs';
import * as request from 'request-promise-native'; // deprecated
import * as requestAsync from 'request'; // deprecated
import * as cheerio from 'cheerio';
import * as async from 'async';
import asyncPool from "tiny-async-pool";
import slugify from 'slugify';
import * as op from 'object-path';
import axios from 'axios';

import {Category, Simulation, SimulationWithoutAdditional} from './types';
import * as config from '../config';


const inDir = '';
const outDir = 'state/get/';


const log = function (...args: any[]) { config.verbose && console.log.apply(console, arguments) };
const error = function (...args: any[]) { config.verbose && console.error.apply(console, arguments) };


// todo move to class
const categoriesTree = {};
const subCategoriesList = {};
const fetchCategoriesTree = async () => {
    await asyncPool(
        config.workers,
        config.categoriesToGet,
        async (categoryTitle) => {
            const categorySlug = slugify(categoryTitle, {lower: true});
            const response = await axios.get(`https://phet.colorado.edu/en/simulations/category/${categorySlug}/index`);
            const $ = cheerio.load(response.data);

            // extract the sims
            const sims = $('.simulation-index a').toArray();
            if (sims.length === 0) console.warn(`Failed to get sims for category ${categoryTitle}`);
            console.debug(`\t - ${categorySlug}: ${sims.length}`);

            sims.map((item) => {
                const slug = $(item).attr('href').split('/').pop();
                op.push(categoriesTree, slug, categoryTitle);
            });

            // gather sub-categories
            const subCategories = $('.side-nav ul.parents ul.children a').toArray();
            subCategories.map((item) => {
                const title = $(item).text();
                const slug = $(item).attr('href').split('/').pop();
                op.set(subCategoriesList, `${categoryTitle}/${title}`, `${categorySlug}/${slug}`);
            });
        }
    );
};

const fetchSubCategories = async () => {
    await asyncPool(
        config.workers,
        Object.entries(subCategoriesList),
        async ([subCatTitle, subCatSlug]) => {
            const response = await axios.get(`https://phet.colorado.edu/en/simulations/category/${subCatSlug}/index`);
            const $ = cheerio.load(response.data);

            // extract the sims
            const sims = $('.simulation-index a').toArray();
            if (sims.length === 0) console.warn(`Failed to get sims for sub-category ${subCatTitle}`);
            console.debug(`\t - ${subCatSlug}: ${sims.length}`);

            sims.map((item) => {
                const slug = $(item).attr('href').split('/').pop();
                op.push(categoriesTree, slug, subCatTitle);
            });
        }
    );
};

// leave IIFE here until global refactoring
(async () => {
    console.log(`Getting categories...`);
    await fetchCategoriesTree();
    await fetchSubCategories();
})();

// todo move to class
const getItemCategories = async (item): Promise<Category[]> => {
    const categoryTitles = categoriesTree[item];
    return categoryTitles ? categoryTitles.map(title => ({
        title,
        slug: subCategoriesList[title] || slugify(title, {lower: true})
    })) : [];
};

console.log(`Starting build with [${config.languagesToGet.length}] languages`);
async.mapLimit(
    config.languagesToGet.map(lang => [lang, `https://phet.colorado.edu/${lang}/offline-access`]),
    config.workers,
    function ([lang, url], next) {
        request.get(url)
            .catch(err => next(err, null))
            .then(html => next(null, { lang, html }));
    },
    function (err, pages: any[]) {
        const sims = pages.reduce<SimulationWithoutAdditional[]>((acc: SimulationWithoutAdditional[], { lang, html }) => {
            const $ = cheerio.load(html);
            const sims = $('.oa-html5 > a').toArray().map(function (item) {
                return $(item).attr('href').split('/').pop().split('.')[0].split('_');
            })
                .filter(([id, language]) => language === lang)
                .map(([id, language]) => {
                    return { id, language };
                });
            return acc.concat(sims);
        }, []);

        let catalog = [];

        console.log(`Got list of ${sims.length} simulations to fetch... Here we go!`);
        async.mapLimit(sims, config.workers, function (sim, next) {
            request.get(`https://phet.colorado.edu/${sim.language}/simulation/${sim.id}`)
                .then(async html => {
                    console.log(`+ [${sim.language}] ${sim.id}`);
                    const $ = cheerio.load(html);
                    const [id, language] = $('.sim-download').attr('href').split('/').pop().split('.')[0].split('_');
                    catalog.push(<Simulation>{
                        categories: await getItemCategories(sim.id),
                        id,
                        language,
                        title: $('.simulation-main-title').text().trim(),
                        // difficulty: categories.filter(c => c[0].title === 'By Grade Level').map(c => c[1].title),    // TODO
                        topics: $('.sim-page-content ul').first().text().split('\n').map(t => t.trim()).filter(a => a),
                        description: $('.simulation-panel-indent[itemprop]').text()
                    });
                    next(null, null);
                })
                .catch(err => {
                    console.error(`Got a 404 for ${sim.language} ${sim.id}`);
                    next(null, null);
                });
        }, function (err, pages) {
            console.log(`Got ${pages.length} pages`);

            fs.writeFileSync(`${outDir}catalog.json`, JSON.stringify(catalog), 'utf8');

            console.log('Saved Catalog');

            const simUrls = catalog.map(sim => `https://phet.colorado.edu/sims/html/${sim.id}/latest/${sim.id}_${sim.language}.html`);
            const imgUrls = simUrls.map(url => url.split('_')[0]).sort().filter((url, index, arr) => url != arr[index - 1]).map(url => url + `-${config.imageResolution}.png`);
            const urlsToGet = simUrls.concat(imgUrls);

            async.eachLimit(urlsToGet, config.workers, function (url, next) {
                const req = requestAsync(url);
                let fileName = url.split('/').pop();
                if (fileName.slice(-4) === '.png') {
                    const fileParts = fileName.split('-');
                    fileName = fileParts.slice(0, -1).join('-') + '.png';
                }
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
                    console.log(`Got ${url}`);
                    next(null, null);
                });
            }, function (err, done) {
                console.log('Got the stuff!'); //TODO: Better logs
            })
        });
    });

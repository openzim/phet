import * as fs from 'fs';
import axios from 'axios';
import slugify from 'slugify';
import * as op from 'object-path';
import * as cheerio from 'cheerio';
import asyncPool from "tiny-async-pool";

import * as config from '../config';
import {Category, Simulation, SimulationWithoutAdditional} from './types';


const inDir = '';
const outDir = 'state/get/';


const log = function (...args: any[]) {
    config.verbose && console.log.apply(console, arguments)
};
const error = function (...args: any[]) {
    config.verbose && console.error.apply(console, arguments)
};


// todo move to class
const categoriesTree = {};
const subCategoriesList = {};
const fetchCategoriesTree = async () => {
    console.log(`Getting categories...`);
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
            console.debug(`- ${categorySlug}: ${sims.length}`);

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
            console.debug(` - ${subCatSlug}: ${sims.length}`);

            sims.map((item) => {
                const slug = $(item).attr('href').split('/').pop();
                op.push(categoriesTree, slug, subCatTitle);
            });
        }
    );
};

// todo move to class
const getItemCategories = async (item): Promise<Category[]> => {
    const categoryTitles = categoriesTree[item];
    return categoryTitles ? categoryTitles.map(title => ({
        title,
        slug: subCategoriesList[title] || slugify(title, {lower: true})
    })) : [];
};


const getSims = async () => {
    console.log(`Starting build with [${config.languagesToGet.length}] languages`);
    const simsData: any[] = await asyncPool(
        config.workers,
        config.languagesToGet.map(lang => [lang, `https://phet.colorado.edu/${lang}/offline-access`]),
        async ([lang, url]) => {
            let data;
            try {
                data = (await axios.get(url)).data;
            } catch (e) {
                console.error(`Failed to get simulation list for ${lang}`);
            }
            return {lang, data};
        }
    );

    // don't commit this
    const sims = simsData.reduce<SimulationWithoutAdditional[]>((acc: SimulationWithoutAdditional[], {lang, data}) => {
        const $ = cheerio.load(data);
        const sims = $('.oa-html5 > a')
            .toArray()
            .map(item => $(item).attr('href').split('/').pop().split('.')[0].split('_'))
            .filter(([id, language]) => language === lang)
            .map(([id, language]) => ({id, language}));
        return acc.concat(sims);
    }, []);

    let catalog: Simulation[] = [];

    console.log(`Got list of ${sims.length} simulations to fetch... Here we go!`);

    const pages = await asyncPool(
        config.workers,
        sims,
        async (sim) => {
            let data: string;
            try {
                data = (await axios.get(`https://phet.colorado.edu/${sim.language}/simulation/${sim.id}`)).data;
                console.log(`+ [${sim.language}] ${sim.id}`);
            } catch (e) {
                console.error(`Failed to get the page for ${sim.language} ${sim.id}`);
            }
            const $ = cheerio.load(data);
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
        }
    );

    console.log(`Got ${pages.length} pages`);

    try {
        await fs.writeFileSync(`${outDir}catalog.json`, JSON.stringify(catalog), 'utf8');
        console.log('Saved Catalog');
    } catch (e) {
        console.error(`Failed to save the catalog`);
    }

    const simUrls = catalog.map(sim => `https://phet.colorado.edu/sims/html/${sim.id}/latest/${sim.id}_${sim.language}.html`);
    const imgUrls = simUrls
        .map(url => url.split('_')[0])
        .sort()
        .filter((url, index, arr) => url != arr[index - 1])
        .map(url => url + `-${config.imageResolution}.png`);
    const urlsToGet = simUrls.concat(imgUrls);

    await asyncPool(
        config.workers,
        urlsToGet,
        async (url) => {
            return new Promise(async (resolve, reject) => {
                let data;
                try {
                    data = (await axios.get(url, {responseType: 'stream'})).data;
                } catch (e) {
                    console.error(`Failed to get url ${url}`);
                }
                let fileName = url.split('/').pop();
                if (fileName.slice(-4) === '.png') {
                    const fileParts = fileName.split('-');
                    fileName = fileParts.slice(0, -1).join('-') + '.png';
                }
                const writeStream = fs.createWriteStream(outDir + fileName)
                    .on('close', _ => {
                        console.log(`Got ${url}`);
                        resolve();
                    });

                data.on('response', function (response) {
                    if (response.statusCode === 200) return;
                    error(`${fileName} gave a ${response.statusCode}`);

                    fs.unlink(outDir + fileName, function (err) {
                        if (err) error(`Failed to delete item: ${err}`);
                    });
                    reject();
                }).pipe(writeStream);
            });
        }
    );

    console.log('Got the stuff!');  //TODO: Better logs
};


// leave IIFE here until global refactoring
(async () => {
    await fetchCategoriesTree();
    await fetchSubCategories();
    await getSims();
})();

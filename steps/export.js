const htmlDir = 'state/get/';
const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

const fs = require('fs');
const Handlebars = require('handlebars');

const templateHTML = fs.readFileSync(resDir + 'template.html', 'utf8');
const template = Handlebars.compile(templateHTML);

const copyFile = (fromPath, toPath) => {
    return fs.createReadStream(fromPath).pipe(fs.createWriteStream(toPath));
};

fs.writeFile(outDir + 'index.html', template(require('../' + inDir + 'catalog.json')), function (err) {
    if (err) throw err;
    console.log('View file at state/export/index.html');
});

fs.readdirSync(htmlDir).forEach(fileName => { //Copy html files from state/get to state/export
    copyFile(htmlDir + fileName, outDir + fileName);
});

copyFile(resDir + 'index.css', outDir + 'index.css');
copyFile(resDir + 'phet-banner.png', outDir + 'phet-banner.png');
copyFile(resDir + 'favicon.ico', outDir + 'favicon.ico');
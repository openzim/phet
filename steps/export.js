const htmlDir = 'state/get/';
const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

const fs = require('fs');
const Handlebars = require('handlebars');
const config = Object.assign({ languages: ['en'] }, require('../config.json'));
const spawn = require('child_process').spawn;


const templateHTML = fs.readFileSync(resDir + 'template.html', 'utf8');
const template = Handlebars.compile(templateHTML);

const copyFile = (fromPath, toPath) => {
    return fs.createReadStream(fromPath).pipe(fs.createWriteStream(toPath));
};

fs.writeFile(outDir + 'index.html', template(require('../' + inDir + 'catalog.json')), function (err) {
    if (err) throw err;
    console.log('View html file at state/export/index.html');
});

fs.readdirSync(htmlDir).forEach(fileName => { //Copy html files from state/get to state/export
    copyFile(htmlDir + fileName, outDir + fileName);
});

copyFile(resDir + 'index.css', outDir + 'index.css');
copyFile(resDir + 'phet-banner.png', outDir + 'phet-banner.png');
copyFile(resDir + 'favicon.ico', outDir + 'favicon.ico');


console.log('Creating Zim file...');

const exportProc = spawn(`./export2zim`, [`PHET-${config.languages.join('-')}.zim`]);

exportProc.stdout.on('data', function (data) {    // register one or more handlers
  console.log('stdout: ' + data);
});

exportProc.stderr.on('data', function (data) {
  console.log('stderr: ' + data);
});

exportProc.on('exit', function (code) {
  console.log('child process exited with code ' + code);
});
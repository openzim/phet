const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

const iso6393 = require('iso-639-3');
const fs = require('fs');
const cheerio = require('cheerio');
const rimraf = require('rimraf');
const config = Object.assign({ languages: ['en'] }, require('../config.js'));
const spawn = require('child_process').spawn;
const dirsum = require('dirsum');
const async = require('async');
const ncp = require('ncp');
ncp.limit = 16;

const kiwixPrefix = {
  js: '../-/',
  svg: '../I/',
  png: '../I/',
  jpg: '../I/',
  jpeg: '../I/'
};

const copyFileSync = function copyFileSync(from, to) {
  fs.writeFileSync(to, fs.readFileSync(from));
};

var getLanguage = function (fileName) {
  return fileName.split('_').pop().split('.')[0];
};

const addKiwixPrefixes = function addKiwixPrefixes(file, targetDir) {
  const resources = file.match(/[0-9a-f]{32}\.(svg|jpg|jpeg|png|js)/g) || [];
  return resources
    .reduce((file, resName) => {
      const ext = resName.split('.').slice(-1)[0];
      ncp(`${inDir}${resName}`, `${targetDir}${resName}`);
      return file.replace(resName, `${kiwixPrefix[ext]}${resName}`);
    }, file);
};

const getISO6393 = function getISO6393(lang = 'en'){
  lang = lang.split('_')[0];
  return (iso6393.find(l => l.iso6391 === lang) || {}).iso6393;
};

async.series(config.buildCombinations.map((combination) => {
  return (handler) => {
    const targetDir = `${outDir}${combination.output}/`;
    rimraf(targetDir, function (err) {
      fs.mkdir(targetDir, function () {

        //Generate Catalog.json file
        const filesByLanguage = fs.readdirSync(inDir)
          .filter(fileName => fileName.split('.').pop() === 'html')
          .filter(fileName => !!~combination.languages.indexOf(getLanguage(fileName)))
          .reduce((acc, fileName) => {
            var language = config.languageMappings[getLanguage(fileName)] || 'Misc';
            acc[language] = acc[language] || [];

            var html = fs.readFileSync(inDir + fileName, 'utf8');

            var $ = cheerio.load(html);
            var title = ($('meta[property="og:title"]').attr('content') || '');

            const filesToCopy = $('[src]').toArray().map(a => $(a).attr('src'));
            copyFileSync(`${inDir}${fileName.split('_')[0]}-${config.imageResolution}.png`, `${targetDir}${fileName.split('_')[0]}-${config.imageResolution}.png`);
            filesToCopy.forEach(fileName => {
              if(fileName.length > 40) return;
              const ext = fileName.split('.').slice(-1)[0];
              html = html.replace(fileName, `${kiwixPrefix[ext]}${fileName}`);

              let file = fs.readFileSync(`${inDir}${fileName}`, 'utf8');

              file = addKiwixPrefixes(file, targetDir);

              fs.writeFileSync(`${targetDir}${fileName}`, file, 'utf8');
            });

            fs.writeFileSync(`${targetDir}${fileName}`, html, 'utf8');

            acc[language].push({
              displayName: title || fileName.split('_').slice(0, -1).join(' '),
              url: fileName,
              image: '../I/' + fileName.split('_')[0] + `-${config.imageResolution}.png`
            });
            return acc;
          }, {});

        const catalog = {
          languageMappings: config.languageMappings,
          simsByLanguage: filesByLanguage
        }

        //Generate index file
        const templateHTML = fs.readFileSync(resDir + 'template.html', 'utf8');
        fs.writeFileSync(targetDir + 'index.html', //Pretty hacky - doing a replace on the HTML. Investigate other ways
          templateHTML
            .replace('<!-- REPLACEMEINCODE -->', JSON.stringify(catalog))
            .replace('<!-- SETLSPREFIX -->', `lsPrefix = "${combination.output}";`), 'utf8');

        copyFileSync(resDir + 'ractive.js', targetDir + 'ractive.js');
        copyFileSync(resDir + 'index.css', targetDir + 'index.css');
        copyFileSync(resDir + 'phet-banner.png', targetDir + 'phet-banner.png');
        copyFileSync(resDir + 'favicon.png', targetDir + 'favicon.png');

        const languageCode = combination.languages.length > 1 ? 'mul' : getISO6393(combination.languages[0]) || 'mul';
        
        //Run export2zim
        console.log('Creating Zim file...');
        const exportProc = spawn( `zimwriterfs`,
				  [ '--verbose',
				    '--welcome=index.html',
				    '--favicon=favicon.png',
				    `--language=${languageCode}`, // TODO: to replace with real ISO639-3 lang code
				    '--title=PhET Interactive Simulations',
                                    '--name=phets', // TODO: here too, the language code should be append
				    '--description=Interactives simulations for Science and Math',
				    '--creator=University of Colorado',
				    '--publisher=Kiwix',
				    targetDir,
				    `./dist/${combination.output}.zim` ] );

        exportProc.stdout.on('data', function (data) {    // register one or more handlers
          console.log('stdout: ' + data);
        });

        exportProc.stderr.on('data', function (data) {
          console.log('stderr: ' + data);
        });

        exportProc.on('exit', function (code) {
          console.log('child process exited with code ' + code);
          handler(null, null);
        });

      });
    });
  }
}));
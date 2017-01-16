const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

const fs = require('fs');
const config = Object.assign({ languages: ['en'] }, require('../config.json'));
const spawn = require('child_process').spawn;
const dirsum = require('dirsum');
const ncp = require('ncp');
ncp.limit = 16;

ncp(resDir + 'ractive.js', outDir + 'ractive.js');
ncp(resDir + 'index.css', outDir + 'index.css');
ncp(resDir + 'phet-banner.png', outDir + 'phet-banner.png');
ncp(resDir + 'favicon.png', outDir + 'favicon.png');


const files = fs.readdirSync(inDir);
ncp(`${inDir}`, outDir, function () {


  const templateHTML = fs.readFileSync(resDir + 'template.html', 'utf8');
  fs.writeFileSync(outDir + 'index.html', //Pretty hacky - doing a replace on the HTML. Investigate other ways
    templateHTML.replace('<!-- REPLACEMEINCODE -->', JSON.stringify(require(`../${inDir}catalog.json`))), 'utf8');


  console.log('Creating Zim file...');

  const exportProc = spawn(`./export2zim`, [`PHET-${Object.keys(config.languageMappings).join('-')}.zim`]);

  exportProc.stdout.on('data', function (data) {    // register one or more handlers
    console.log('stdout: ' + data);
  });

  exportProc.stderr.on('data', function (data) {
    console.log('stderr: ' + data);
  });

  exportProc.on('exit', function (code) {
    console.log('child process exited with code ' + code);

    console.log('View html file at state/export/index.html');
    console.log('View ZIM file at dist/PHET-*.zim');
  });
});


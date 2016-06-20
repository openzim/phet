const htmlDir = 'state/get/';
const inDir = 'state/transform/';
const outDir = 'state/export/';
const resDir = 'res/';

const fs = require('fs');
const config = Object.assign({ languages: ['en'] }, require('../config.json'));
const spawn = require('child_process').spawn;
const dirsum = require('dirsum');

const templateHTML = fs.readFileSync(resDir + 'template.html', 'utf8');

const copyFile = (fromPath, toPath) => {
  return fs.createReadStream(fromPath).pipe(fs.createWriteStream(toPath));
};

copyFile(resDir + 'ractive.js', outDir + 'ractive.js');
copyFile(resDir + 'index.css', outDir + 'index.css');
copyFile(resDir + 'phet-banner.png', outDir + 'phet-banner.png');
copyFile(resDir + 'favicon.ico', outDir + 'favicon.ico');


fs.readdirSync(htmlDir).forEach(fileName => { //Copy html files from state/get to state/export
  copyFile(htmlDir + fileName, outDir + fileName);
});

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

//TODO: keeping the process alive until all streams are closed (it may be that this isn't even needed)
var checksum;

const checkState = _ => { //This is icky, but we kinda need it
  setTimeout(_ => {
    dirsum.digest(outDir, 'sha1', function (err, hashes) {
      if (!hashes) return console.log('CheckState ran into an issue, limping along anyway.');
      console.log(hashes.hash, checksum)
      checksum = hashes.hash;
      checkState();
    });
  }, 4000);
}
checkState();
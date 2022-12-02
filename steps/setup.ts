import fs from 'fs'
import rimraf from 'rimraf'

rimraf('state', function (err) {
    if (err) console.error(err);
    else {
        fs.mkdir('state', function () {
            fs.mkdirSync('state/get');
            fs.mkdirSync('state/get/catalogs');
            fs.mkdirSync('state/transform');
            fs.mkdirSync('state/export');
        });
    }
});

const fs = require('fs');
const rimraf = require('rimraf');

const error = console.error.bind(console);

rimraf('state', function (err) {
    if (err) console.error(err);
    else {
        fs.mkdir('state', function () {
            fs.mkdirSync('state/get');
            fs.mkdirSync('state/transform');
            fs.mkdirSync('state/export');
            fs.mkdirSync('state/tmp');
        });
    }
});

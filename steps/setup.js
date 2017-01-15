const fs = require('fs');
const rimraf = require('rimraf');

const error = console.error.bind(console);

rimraf('state', function (err) {
    if (err) console.error(err);
    else {
        fs.mkdir('state', function () {
            fs.mkdir('state/get');
            fs.mkdir('state/transform');
            fs.mkdir('state/export');
            fs.mkdir('state/tmp');
        });
    }
});
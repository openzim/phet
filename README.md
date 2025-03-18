# PhET Simulations scraper

This scraper creates offline versions in [ZIM
format](https://openzim.org) of [PhET science
simulations for Science and Math](https://phet.colorado.edu).

<a href="https://play.google.com/store/apps/details?id=org.kiwix.kiwixcustomphet" target="_blank" align="left">
  <img src="https://play.google.com/intl/en/badges/images/badge_new.png" alt="Get it on Google Play" height="30" />
</a>

[![npm](https://nodei.co/npm/phetscraper.png)](https://www.npmjs.com/package/phetscraper)

[![npm](https://img.shields.io/npm/v/phetscraper.svg)](https://www.npmjs.com/package/phetscraper)
[![Docker](https://ghcr-badge.egpl.dev/openzim/phet/latest_tag?label=docker)](https://ghcr.io/openzim/phet)
[![CI](https://github.com/openzim/phet/actions/workflows/ci.yml/badge.svg)](https://github.com/openzim/phet/actions/workflows/ci.yml)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/phet/badge)](https://www.codefactor.io/repository/github/openzim/phet)
[![Latest ZIM releases](https://img.shields.io/badge/latest-ZIM-%23ff4365)](https://download.kiwix.org/zim/phet/)
[![License](https://img.shields.io/npm/l/phetscraper.svg)](LICENSE)

## Requirements

It requires Node.js version 16 or higher.

## Quick Start

```bash
npm i && phet2zim
```

The above will eventually output a ZIM file to ```dist/```

## Command line arguments

See `phet2zim --help` for details.

`--withoutLanguageVariants` uses to exclude languages with Country variant. For example `en_CA` will not be present in zim with this argument.

Available only on GET step:
```bash
--withoutLanguageVariants ...
```

Available on GET and EXPORT steps only:
```bash
--includeLanguages lang_1 [lang_2] [lang_3] ...
--excludeLanguages lang_1 [lang_2] [lang_3] ...
```

Available on EXPORT step only:
```bash
# Skip ZIM files for individual languages
--mulOnly

# Create a ZIM file with all languages
--createMul
```

Example:
```bash
phet2zim --includeLanguages en ru fr
```

## Config

Another way to configure behaviour is through environment variables. Sample `.env` file (with default values):
```bash
# request per second, affects GET step only
PHET_RPS=8
# async workers on TRANSFORM step (keep it equal to number of CPU cores)
PHET_WORKERS=10
# number of retries on GET step (delay grow with exponential backoff)
PHET_RETRIES=5
# display verbose errors
PHET_VERBOSE_ERRORS=false
```

## About

This project achieves multiple things:
* Download PhET content
* Generate an Index for said content
* Generate ZIM file(s) containing content and index

Things this project does not yet do, but should:
* Generate Android APK

## Usage

The functionality is split into 5 ```npm scripts```:
* ```npm run setup``` - deletes state from previous runs
* ```npm run get``` - downloads PhET simulations in specified languages
* ```npm run transform``` - prepare the content and media files
* ```npm run export``` - generates ZIM file(s)
* ```npm start``` - runs all of the above in sequence

The steps get, transform and export have their own output directories:
* ```get``` outputs HTML and PNG files to ```state/get```
* ```transform``` outputs intermediate files to ```state/transform```
* ```export``` outputs HTML and PNG files to ```state/export``` AND a ZIM file(s) to ```dist/```

License
-------

[Apache](https://www.apache.org/licenses/LICENSE-2.0) or later, see
[LICENSE](LICENSE) for more details.

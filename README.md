<a href="https://play.google.com/store/apps/details?id=org.kiwix.kiwixcustomphet" target="_blank" align="left">
  <img src="https://play.google.com/intl/en/badges/images/badge_new.png" alt="Get it on Google Play" height="30" />
</a>

# PhET Simulations scraper

This scraper creates offline versions in [ZIM format](https://openzim.org) of [PhET science simulations](https://phet.colorado.edu) in the ZIM format.

## Quick Start

```bash
npm i && npm start
```

The above will eventually output a ZIM file to ```dist/```

[![latest ZIM releases](https://img.shields.io/badge/latest-ZIM-%23ff4365)](https://download.kiwix.org/zim/phet/)
[![CodeFactor](https://www.codefactor.io/repository/github/openzim/phet/badge)](https://www.codefactor.io/repository/github/openzim/phet)

## Command line arguments
Available on GET and EXPORT steps only: 
~~~
    --includeLanguages lang_1 [lang_2] [lang_3] ... 
    --excludeLanguages lang_1 [lang_2] [lang_3] ...
~~~
Available on EXPORT step only:
~~~
    # skip ZIM files for individual languages 
    --mulOnly 
~~~
Example: `npm run get -- --includeLanguages en ru fr`

## Config

Another way to configure behaviour is through environment variables. Sample `.env` file (with default values):
~~~
# request per second, affects GET step only
PHET_RPS=8
# async workers on TRANSFORM step (keep it equal to number of CPU cores) 
PHET_WORKERS=10
# number of retries on GET step (delay grow with exponential backoff)
PHET_RETRIES=5
# display verbose errors 
PHET_VERBOSE_ERRORS=false
~~~

## About

This project achieves multiple things:
* Download PhET content
* Generate an Index for said content
* Generate a ZIM file containing content and index

Things this project does not yet do, but should:
* Generate Android APK

## Usage

The functionality is split into 5 ```npm scripts```:
* ```npm run setup``` - deletes state from previous runs
* ```npm run get``` - downloads PhET simulations in specified languages
* ```npm run transform``` - generates a JSON file which is used to generate the index
* ```npm run export``` - generates index and ZIM file
* ```npm start``` - runs all of the above in sequence

The steps get, transform and export have their own output directories:
* ```get``` outputs HTML and PNG files to ```state/get```
* ```transform``` outputs a JSON file to ```state/transform```
* ```export``` outputs HTML and PNG files to ```state/export``` AND a ZIM file to ```dist/```

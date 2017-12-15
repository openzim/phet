# PhET

## Quick Start

```bash
npm i && npm start
```

The above will eventually output a ZIM file to ```dist/```

## Notes

It is likely that the export to ZIM will fail - modify the ```export2zim``` file to point at a working zimwriterfs executable.

Hopefully this step will be removed once there are bindings for libzim and node.

## Config

The only way to configure behaviour is through ```config.json```. It accepts the following properties:
* languages:Array - PhET country codes (possible values can be found below)
* languageMapping:Object<string, string> - Mapping between language code and displayName

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

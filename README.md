#Kiwix - PhET

##Quick Start
```bash
npm i && npm start
```

##Notes
It is likely that the export to ZIM will fail - modify the ```export2zim``` file to point at a working zimwriterfs executable.

Hopefully this step will be removed once there are bindings for libzim and node.

##About

This project achieves multiple things:
* Download PhET content
* Generate an Index for said content
* Generate a ZIM file containing content and index

Things this project does not yet do, but should:
* Generate Android APK


The functionality is split into 5 ```npm scripts```:
* ```npm run setup``` - deletes state from previous runs
* ```npm run get``` - downloads PhET simulations in specified languages
* ```npm run transform``` - generates a JSON file which is used to generate the index
* ```npm run export``` - generates index and ZIM file
* ```npm start``` - runs all of the above in sequence


#Contributing
If in doubt, create a Pull Request, we won't bite!
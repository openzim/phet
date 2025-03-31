# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.1.0] - 2025-03-31

### Fixed

* Fix responsivness (#260)
* Lazy load home page images
* stop loading simulation when clicking in the backdrop (outside) of the popup
* Add support for ku_TR, only has a variant
* Sort language combobox in UI by locale language name alphabetical order
* Include all variants in mul ZIM, not only the ones for which there is only variants
* Add fallback for slug without known locale language name (#261)
* Remove English name property on language descriptors: property is unused and missing on variants

## [3.0.2] - 2025-03-21

### Fixed

* Fix compression of documents (#256)

## [3.0.1] - 2025-03-20

### Changed

* Use CMD instead of ENTRYPOINT for proper Zimfarm operation (#253)

## [3.0.0] - 2025-03-20

### Added

* Add CLI interface (#231)

### Changed

* Upgrade to node-libzim 3.2.3 (libzim 9.2.1) (#239)
* Update to Node.JS 22 and upgrade dependencies (#243)
* Stop removing third-party license information (#240)
* By default, do not create mul ZIM (#242)

### Fixed

* Some simulations are failing to load with phet.chipper.localeData is undefined (#237)
* Use tsx instead of ts-node
* Add fallback for Efik and Sepedi languages which have unknown ISO639-1 codes
* Rework retrieval of languages list (#216)

## [2.5.0] - 2023-03-19

### Fixed

* Broken 2.4.0 version in Zimfarm (@pavel-karatsiuba #197 198)
* Better handling of language variants(@pavel-karatsiuba #206 #211)
* Non-conform ZIM metadata (@pavel-karatsiuba #201 #208 210)
* Use ESLint instead of TSLint (@pavel-karatsiuba #202)

### Added

* Update of UI in many languages

## [2.4.0] - 2022-12-31

### Added

* Full localization system (still no translations) (@pavel-karatsiuba #178)
* Harmonisation of the logo (@pavel-karatsiuba #177)

### Fixed

* Many CSS odities (@pavel-karatsiuba #178)
* Broken favicon links (@pavel-karatsiuba #175)
* Limited support of favicons (@pavel-karatsiuba #175)
* Empty entries in language selecbox (@pavel-karatsiuba #176)
* Proper suggestion/fulltext indexes (@Kelson42 #181)

## [2.3.0] - 2022-12-03

### Added

* Fix Docker image build + upload to ghcr.io (@kelson42 #170)
* CD autopublish to npm.js (@kelson42 #172)

### Changed

* Source code refactored to work as ES modules (@pavel-karatsiuba #168)
* Dependences when possible (@pavel-karatsiuba #154)
* Continuous integration workflow (@kelson42 #158)
* Docker image using Node.js 18 (@kelson42 #169)* FIX Remove many inline Javascript (@pavel-karatsiuba #152)

### Fixed

* FIX Remove google-analytics & others external resources (@pavel-karatsiuba #153)
* FIX Adapt scraper to new Phets Web site (@pavel-karatsiuba #150)

## [2.2.2] - 2021-06-18

### Changed

* Use libzim 2.4.4

## [2.2.1]

* Fix bad ZIM Metadata date
* Use latest nodejs-libzim 2.4.3
* Update all dependences to latest version
* Compress using zstd in ZIM (instead of xz)
* Remove support to Node.js v10
* Slightly improve error handling

## [2.2.0]

* Use latest nodejs-libzim 2.4.0
* Update many dependences
* Adapt to new upstream layout
* Fix wrong month number in filenames

## [2.1.1]

* Use latest nodejs-libzim 2.2.4

## [2.1.0]

* Use latest nodejs-libzim
* Few small bug fixes

## [2.0.0]

* Lot of visual improvements
* Migrated to node-libzim
* Internal logic reworked
* Removed languages hardcoding
* Improved image compression algorythms
* Better async flow, speeding up the scraping process
* Better logging and error handling
* Added code linting
* Moved to Typescript partially
* Fixed bugs

## [1.0.0]

* First version of the Phets scraper


"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ArrayFrom = require("array-from");
if (!Array.from)
    Array.from = ArrayFrom;
var sweetalert2_1 = require("sweetalert2");
var navigatorLanguage = (window.navigator &&
    ((window.navigator.languages && window.navigator.languages[0]) ||
        window.navigator.userLanguage ||
        window.navigator.language)) || 'en';
navigatorLanguage = window.importedData.languageMappings[navigatorLanguage.split('-')[0]];
var languageToUse = window.importedData.simsByLanguage[navigatorLanguage] ? navigatorLanguage : Object.keys(window.importedData.simsByLanguage)[0];
var currentLanguage = (localStorage && localStorage[window.lsPrefix + 'currentLanguage']) ?
    localStorage[window.lsPrefix + 'currentLanguage'] :
    languageToUse;
var ractive = new Ractive({
    el: '#ractive-target',
    template: '#ractive-template',
    computed: {
        languages: function () {
            return Object.keys(this.get('simulationsByLanguage'));
        },
        categories: function () {
            var lang = this.get('selectedLanguage');
            var sims = this.get("simulationsByLanguage." + lang);
            var makeCategoryId = this.get('makeCategoryId');
            return sims.reduce(function (acc, sim) { return acc.concat(sim.categories); }, [])
                .sort(function (a, b) { return makeCategoryId(a) < makeCategoryId(b) ? -1 : 1; })
                .filter(function (val, index, arr) { return makeCategoryId(val) !== makeCategoryId(arr[index - 1] || []); });
        },
        simulations: function () {
            var lang = this.get('selectedLanguage');
            var sims = this.get("simulationsByLanguage." + lang);
            var category = this.get('selectedCategory') || 'all';
            if (category === 'all') {
                return sims;
            }
            else {
                return sims.filter(function (sim) {
                    return !!~sim.categories.map(function (c) { return c.map(function (c) { return c.slug; }).join('-'); }).indexOf(category);
                });
            }
        }
    },
    data: {
        simulationsByLanguage: window.importedData.simsByLanguage,
        selectedLanguage: currentLanguage,
        languageMappings: window.importedData.languageMappings,
        makeCategoryId: function (category) {
            return category.map(function (c) { return c.slug; }).join('-');
        },
        makeCategoryName: function (category) {
            return category.map(function (c) { return c.title; }).join(' / ');
        }
    },
    oninit: function () {
        this.observe('selectedLanguage', function (selectedLanguage) {
            if (localStorage) {
                localStorage[window.lsPrefix + 'currentLanguage'] = selectedLanguage;
            }
            ;
        });
        this.on('showConfirm', function (ev) {
            var simulation = ev.context;
            var categoryHTML = simulation.categories.map(function (cat) {
                var categoryContent = cat.map(function (c) {
                    return c.title;
                }).join(' / ');
                return "<li>" + categoryContent + "</li>";
            }).join('');
            var topicsHTML = simulation.topics.map(function (t) { return "<li>" + t + "</li>"; }).join('');
            sweetalert2_1.default({
                title: "" + simulation.title,
                html: "\n                <div>\n                    <img src='../I/" + simulation.id + ".png' />\n                </div>\n                <div class='flex-cont'>\n                    <div>\n                        <span>Categories</span>\n                        <ul>" + categoryHTML + "</ul>\n                    </div>\n                    <div>\n                        <span>Topics</span>\n                        <ul class='topics'>" + topicsHTML + "</ul>\n                    </div>\n                </div>\n                <div class='description'>" + simulation.description + "</div>",
                showCloseButton: true,
                showCancelButton: true,
                confirmButtonText: 'Load'
            }).then(function (isConfirm) {
                var a = document.createElement('a');
                a.href = simulation.id + "_" + simulation.language + ".html";
                document.body.appendChild(a).click();
            });
        });
    }
});

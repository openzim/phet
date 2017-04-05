(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
        }
    },
    data: {
        simulationsByLanguage: window.importedData.simsByLanguage,
        selectedLanguage: currentLanguage,
        languageMappings: window.importedData.languageMappings
    },
    oninit: function () {
        this.observe('selectedLanguage', function (selectedLanguage) {
            if (localStorage) {
                localStorage[window.lsPrefix + 'currentLanguage'] = selectedLanguage;
            }
            ;
        });
        //swal('hi');
    }
});

},{}]},{},[1]);

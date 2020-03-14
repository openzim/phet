import { Category, Simulation } from '../../steps/types';
import * as ArrayFrom from 'array-from';
if (!(<any>Array).from) (<any>Array).from = ArrayFrom;
import swal from 'sweetalert2';

declare global {
    interface Navigator {
        userLanguage: string
    }

    interface Window {
        importedData: {
            languageMappings: { [langCode: string]: string },
            simsByLanguage: {
                [langCode: string]: Simulation[]
            }
        },
        lsPrefix: string
    }
}


var navigatorLanguage = (window.navigator &&
    ((window.navigator.languages && window.navigator.languages[0]) ||
        window.navigator.userLanguage ||
        window.navigator.language)
) || 'en';

navigatorLanguage = window.importedData.languageMappings[navigatorLanguage.split('-')[0]]
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
            const lang = this.get('selectedLanguage');
            const sims = this.get(`simulationsByLanguage.${lang}`);
            const makeCategoryId = this.get('makeCategoryId');
            return sims.reduce((acc, sim) => acc.concat(sim.categories), [])
                .filter(a => a.slug !== 'by-device')
                .sort((a, b) => makeCategoryId(a) < makeCategoryId(b) ? -1 : 1)
                .filter((val, index, arr) => makeCategoryId(val) !== makeCategoryId(arr[index - 1] || []));
        },
        simulations: function () {
            const lang = this.get('selectedLanguage');
            const sims = this.get(`simulationsByLanguage.${lang}`);
            const category = this.get('selectedCategory') || 'all';

            if (category === 'all') {
                return sims;
            } else {
                return sims.filter(sim => {
                    return !!~sim.categories.map(c => c.slug).indexOf(category);
                });
            }
        }
    },
    data: {
        simulationsByLanguage: window.importedData.simsByLanguage,
        selectedLanguage: currentLanguage,
        languageMappings: window.importedData.languageMappings,

        makeCategoryId: function (category: Category) {
            return category.slug;
        },
        makeCategoryName: function (category: Category) {
            return category.title;
        }
    },
    oninit: function () {
        this.observe('selectedLanguage', function (selectedLanguage) {
            if (localStorage) {
                localStorage[window.lsPrefix + 'currentLanguage'] = selectedLanguage;
            }
        });
        this.on('showConfirm', function (ev) {
            const simulation: Simulation = ev.context;

            const categoryHTML = simulation.categories.map(cat => {
                // const categoryContent = cat.map(c => {
                //     return c.title;
                // }).join(' / ');
                // return `<li>${categoryContent}</li>`;
                return `<li>cat.title</li>`;
            }).join('');

            const topicsHTML = simulation.topics.map(t => `<li>${t}</li>`).join('');

            swal.fire({
                title: `${simulation.title}`,
                html: `
                <div>
                    <img src='../I/${simulation.id}.png' />
                </div>
                <div class='flex-cont'>
                    <div>
                        <span>Categories</span>
                        <ul>${categoryHTML}</ul>
                    </div>
                    <div>
                        <span>Topics</span>
                        <ul class='topics'>${topicsHTML}</ul>
                    </div>
                </div>
                <div class='description'>${simulation.description}</div>`,
                showCloseButton: true,
                showCancelButton: true,
                confirmButtonText: 'Load'
            }).then(({dismiss}) => {
                const reasonsToCancel = [
                    swal.DismissReason.cancel,
                    swal.DismissReason.close,
                    swal.DismissReason.esc,
                ];
                if (reasonsToCancel.includes(dismiss)) return;
                const a = document.createElement('a');
                a.href = `${simulation.id}_${simulation.language}.html`;
                document.body.appendChild(a).click();
            });
        });
    }
});

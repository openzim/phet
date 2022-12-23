import swal from 'sweetalert2';
import * as ArrayFrom from 'array-from';
import {Category, Simulation} from '../../lib/types.js';
import { template as reactiveTemplate } from '../templates/reactive-template';
import Banana from 'banana-i18n';

if (!(Array as any).from) (Array as any).from = ArrayFrom;

declare global {
  interface Navigator {
    userLanguage: string;
  }

  interface Window {
    importedData: {
      languageMappings: { [langCode: string]: string },
      simsByLanguage: {
        [langCode: string]: Simulation[]
      }
    };
    lsPrefix: string;
  }
}
(async () => {
  const fetchTranslations = (locale) => {
    
    return fetch(`../-/${locale}.json`)
      .then((response) => response.json())
  };

  const defaultTranslations = await fetchTranslations('en');

  const banana = new Banana('en', defaultTranslations);

  const loadTranslations = (locale) => {
    
    return fetchTranslations(locale).then((messages) => {
        banana.load(messages, locale);
        banana.setLocale(locale);
      }).catch(() => {
        banana.load(defaultTranslations)        
      })
  };

  const translatePage = (locale) => {
    return loadTranslations(locale).then(() =>{
        document.title = banana.getMessage('document-title');

        if (document.getElementById('translateSlogan')) {
          document.getElementById('translateSlogan').innerHTML = banana.getMessage('helping-students-engage-in-science-and-mathematics');
        }
        if (document.getElementById('logoContainerText')) {
          document.getElementById('logoContainerText').innerHTML = banana.getMessage('logo-text');
        }
        if (document.getElementById('translateAllCategories')) {
          document.getElementById('translateAllCategories').innerHTML = banana.getMessage('category-all-categories');
        }
      });
  };

  let navigatorLanguage = (window.navigator &&
    ((window.navigator.languages && window.navigator.languages[0]) ||
      window.navigator.userLanguage ||
      window.navigator.language)
  ) || 'en';

  navigatorLanguage = navigatorLanguage.split('-')[0];
  const languageToUse = window.importedData.simsByLanguage[navigatorLanguage] ? navigatorLanguage : Object.keys(window.importedData.simsByLanguage)[0];

  const currentLanguage = (localStorage && localStorage[window.lsPrefix + 'currentLanguage']) ?
    localStorage[window.lsPrefix + 'currentLanguage'] :
    languageToUse;

  const currentCategory = (localStorage && localStorage[window.lsPrefix + 'currentCategory']) ?
    localStorage[window.lsPrefix + 'currentCategory'] : 'all';

  const ractive = new Ractive({
    el: '#content',
    template: reactiveTemplate,
    computed: {
      languages() {
        return Object.entries(this.get('languageMappings'));
      },
      updateCategories() {
        const lang = this.get('selectedLanguage');
        const sims = this.get(`simulationsByLanguage.${lang}`);
        const makeCategoryId = this.get('makeCategoryId');
        return sims.reduce((acc, sim) => acc.concat(sim.categories), [])
          .sort((a, b) => makeCategoryId(a) < makeCategoryId(b) ? -1 : 1)
          .filter((val, index, arr) => makeCategoryId(val) !== makeCategoryId(arr[index - 1] || []));
      },
      simulations() {
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
      categories: [],
      slogan: banana.getMessage('helping-students-engage-in-science-and-mathematics'),
      simulationsByLanguage: window.importedData.simsByLanguage,
      selectedLanguage: currentLanguage,
      selectedCategory: currentCategory,
      languageMappings: window.importedData.languageMappings,

      makeCategoryId(category: Category) {
        return category.slug;
      },
      makeCategoryName(category: Category) {
        return banana.getMessage(`category-${category.slug}`);
      },
      getSlug: (item) => {
        return JSON.stringify(item);
      }
    },
    oninit() {
      this.observe('selectedLanguage', function (selectedLanguage) {
        translatePage(selectedLanguage).then(() => {
          const categories = ractive.get('updateCategories');
          ractive.set('categories', categories);
        });

        if (localStorage) localStorage[window.lsPrefix + 'currentLanguage'] = selectedLanguage;
      });
      this.observe('selectedCategory', function (selectedCategory) {
        if (localStorage) localStorage[window.lsPrefix + 'currentCategory'] = selectedCategory;
      });
      this.on('showConfirm', function (ev) {
        const simulation: Simulation = ev.context;

        const categoryHTML = simulation.categories.map(cat => `<li>${cat.title}</li>`).join('');
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
          confirmButtonText: banana.getMessage('load-button'),
          cancelButtonText: banana.getMessage('cancel-button')
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
})();
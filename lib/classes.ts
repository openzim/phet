import * as fs from 'fs';
import * as path from 'path';
import * as op from 'object-path';

import {log} from './logger';
import {Simulation} from './types';
import {getIdAndLanguage} from './common';


export class Base64Entity {
  public data: string;
  public mimeType: string;

  constructor(encoded) {
    const decoded = encoded.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    this.mimeType = decoded && decoded[1];
    this.data = decoded && decoded[2];
  }

  isEmpty(): boolean {
    return !this.data || this.data.length === 0 || !this.mimeType;
  }

  isImage(): boolean {
    return this.mimeType.split('/')[0] === 'image';
  }
}


export class SimulationsList {
  public items: Simulation[] = [];
  private readonly language: string;

  add(item: Simulation): void {
    this.items.push(item);
  }

  constructor(lang: string) {
    this.language = lang;
  }

  // addWithFallbackLanguage(id: string, lang: string, fallbackLanguage: string = 'en'): void {
  //   const fallbackItem = this.getItem(fallbackLanguage, id);
  //   if (!fallbackItem) throw new Error(`There\'s no fallback item for ${id}`);
  //   this.add(lang, {...fallbackItem, fallbackLanguage});
  // }

  private getItem(id: string) {
    return (this.items.filter(x => x.id === id) || []).shift();
  }

  async persist(dir: string): Promise<void> {
    const file = path.join(dir, `${this.language}.json`);
    try {
      await fs.promises.writeFile(file, JSON.stringify(this.getSortedItems()), 'utf8');
    } catch (e) {
      console.error(`Failed to save the catalog ${file}`);
    }
  }

  private getSortedItems(): Simulation[] {
    return this.items.sort(SimulationsList.getComparator('title'));
  }

  private static getComparator(propName: string) {
    return (a, b) => {
      if (a[propName] > b[propName]) return 1;
      if (a[propName] < b[propName]) return -1;
      return 0;
    };
  }
}


export class Catalog {
  public languageMappings: { [langCode: string]: string } = {};
  public simsByLanguage: { [langCode: string]: Simulation[] } = {};

  private readonly catalogsDir: string;
  private readonly target;
  private readonly languages;
  private titlesById = {};


  constructor({target, languages, catalogsDir}) {
    this.catalogsDir = catalogsDir;
    this.target = target;
    this.languages = languages;
  }

  public async init() {
    this.fetchLanguageMappings();
    await this.fetchSimsByLanguage();
  }

  public getTitle(filename: string): string {
    if (path.extname(filename) !== '.html' || ['index.html', 'template.html'].includes(filename)) return filename;
    const [simId, language] = getIdAndLanguage(filename);
    return op.get(this.titlesById, [language, simId]);
  }

  private fetchLanguageMappings(): void {
    this.languageMappings = this.target.languages.reduce((acc, langCode) => {
      op.set(acc, langCode, this.languages[langCode].localName);
      return acc;
    }, {});
    }

  private async fetchSimsByLanguage(): Promise<void> {
    for (const langCode of this.target.languages) {
      const cat = await this.getCatalog(langCode);
      op.set(this.simsByLanguage, langCode, cat);
      cat.forEach((item) => op.set(this.titlesById, [langCode, item.id], item.title));
    }
  }

  private async getCatalog(lang): Promise<Simulation[]> {
    try {
      const file = await fs.promises.readFile(path.join(this.catalogsDir, `${lang}.json`));
      return JSON.parse(file.toString());
    } catch (e) {
      log.error(`Failed to get catalog for language ${lang}`);
      log.error(e);
    }
  }
}

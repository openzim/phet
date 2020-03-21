import * as fs from 'fs';
import * as op from 'object-path';
import {LanguageDescriptor, LanguageItemPair, Simulation} from './types';


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
  public items: LanguageItemPair<Simulation[]>[] = [];
  private languages: LanguageItemPair<LanguageDescriptor>;

  constructor(languages) {
    this.languages = languages;
  }

  add(lang: string, item: Simulation): void {
    if (!this.items[lang]) this.items[lang] = [];
    this.items[lang].push(item);
  }

  async persist(dir: string): Promise<void> {
    try {
      await fs.promises.writeFile(`${dir}catalog.json`, JSON.stringify(this.getSimIdsByLanguages()), 'utf8');
      console.log('Saved Catalog');
    } catch (e) {
      console.error(`Failed to save the catalog`);
    }
  }

  private getSimIdsByLanguages(): LanguageItemPair<Simulation[]> {
    const result = {};
    Object.entries(this.items).forEach(([lang, sims]) => op.set(result, this.languages[lang].localName, Object.values(sims).sort(SimulationsList.getComparator('title'))));
    return result;
  }

  private static getComparator(propName: string) {
    return (a, b) => {
      if (a[propName] > b[propName]) return 1;
      if (a[propName] < b[propName]) return -1;
      return 0;
    };
  }
}

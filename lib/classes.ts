import * as fs from 'fs';
import * as path from 'path';
import {Simulation} from './types';


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

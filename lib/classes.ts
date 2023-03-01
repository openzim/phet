import * as fs from 'fs';
import * as path from 'path';
import glob from 'glob';
import op from 'object-path';
import {SingleBar} from 'cli-progress';
import asyncPool from 'tiny-async-pool';

import {log} from './logger.js';
import {Simulation} from './types.js';
import {getIdAndLanguage} from './common.js';


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

  remove(idToRemove: string): void {
    this.items = this.items.filter(function( { id } ) {
      return id !== idToRemove;
    });
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
      log.error(`Failed to save the catalog ${file}`);
      log.error(e);
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

  public isEmpty(): boolean {
    const count = Object.keys(this.simsByLanguage).reduce((acc, langCode) =>
      acc + op.get(this.simsByLanguage[langCode].length) as number, 0);
    return count === 0;
  }

  private fetchLanguageMappings(): void {
    this.languageMappings = this.target.languages.reduce((acc, langCode) => {
      op.set(acc, langCode, this.languages[langCode].localName);
      return acc;
    }, {});
  }

  private async fetchSimsByLanguage(): Promise<void> {
    for (const langCode of this.target.languages) {
      try {
        const cat = await this.getCatalog(langCode);
        op.set(this.simsByLanguage, langCode, cat);
        cat.forEach((item) => op.set(this.titlesById, [langCode, item.id], item.title));
      } catch (e) {
        log.error(`Failed to get catalog for language ${langCode}`);
        log.error(e);
      }
    }
  }

  private async getCatalog(lang): Promise<Simulation[]> {
    const file = await fs.promises.readFile(path.join(this.catalogsDir, `${lang}.json`));
    return JSON.parse(file.toString());
  }
}


export class Transformer {

  private readonly source: string;
  private readonly bar: SingleBar;
  private readonly handler: (any) => Promise<any>;
  private readonly verbose: boolean;
  private readonly workers: number;

  constructor({source, bar, handler, verbose = false, serial = false, workers = 0}) {
    this.source = source;
    this.bar = bar;
    this.handler = handler;
    this.verbose = verbose;
    this.workers = workers;
  }

  public async transform(): Promise<any[]> {
    const items: string[] = await Promise.all(glob.sync(this.source, {}));
    this.bar.start(items.length, 0);

    let result = [];
    if (this.workers === 0) {
      for (const item of items) {
        result.push(await this.handle(item));
      }
    } else {
      result = await asyncPool(
        this.workers,
        items,
        (item) => this.handle(item)
      );
    }
    this.bar.stop();
    return result;
  }

  private async handle(item) {
    try {
      await this.handler(item);
    } catch (e) {
      if (this.verbose) {
        log.error(`Error while processing: ${item}`);
        log.error(e);
      } else {
        log.warn(`Unable to process ${item}. Skipping it.`);
      }
    } finally {
      this.bar.increment(1, {prefix: '', postfix: path.basename(item)});
      if (!process.stdout.isTTY) log.info(` + ${path.basename(item)}`);
    }
  }
}

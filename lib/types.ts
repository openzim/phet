export type Category = {
  title: string,
  slug: string
};

export type Simulation = {
  id: string,
  language: string,
  fallbackLanguage?: string;
  title: string,
  categories: Category[],
  difficulty?: string[],
  topics: string[],
  description: string
};

export type Catalog = {
  languageMappings: {
    [langCode: string]: string,
  }
  simsByLanguage: {
    [langCode: string]: Simulation[]
  }
};

export type LanguageDescriptor = {
  slug: string,
  name: string,
  localName: string,
  url: string,
  count: number
};

export type LanguageItemPair<T> = {
  [lang: string]: T,
};

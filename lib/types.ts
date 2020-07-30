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

export type Target = {
  output: string,
  date: Date,
  languages: string[]
};

export type LocalizedSimulation = {
  title: string;
  isCheerpj: boolean;
};

export type MetaSimulation = {
  a11yFeatures: any[];
  highGradeLevel: number;
  subjects: number[];
  name: string;
  id: number;
  isNew: 0 | 1;
  relatedSimulations: number[];
  lowGradeLevel: number;
  localizedSimulations: LanguageItemPair<LocalizedSimulation>;
};

export type MetaProject = {
  name: string;
  type: 0 | 1 | 2;
  simulations: MetaSimulation[];
};

export type Meta = {
  projects: MetaProject[],
  common: any,
  count: number;
};

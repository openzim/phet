export type Category = {
    title: string,
    slug: string
};

export type Simulation = {
    id: string,
    language: string,
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

export type LanguageItemPair<T> = {
    [lang: string]: T
};

export type SetByLanguage<T> = [
    LanguageItemPair<T>
];

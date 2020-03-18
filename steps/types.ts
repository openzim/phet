export type Category = {
    title: string,
    slug: string
};

export type SimulationWithoutAdditional = {
    id: string,
    language: string,
};

export type Simulation = SimulationWithoutAdditional & {
    title: string
    categories: Category[],
    difficulty: string[],
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

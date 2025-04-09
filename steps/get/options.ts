import yargs from 'yargs'
import * as dotenv from 'dotenv'
import { hideBin } from 'yargs/helpers'
import { formatLanguages, formatSubjects } from 'steps/utils'
import { categoriesTree, cats, rootCategories } from 'lib/const'
import slugify from 'slugify'

dotenv.config()

const { argv } = yargs(hideBin(process.argv)).boolean('withoutLanguageVariants').string('includeLanguages').string('excludeLanguages').string('subjects')

const defaultOptions = {
  failedDownloadsCountBeforeStop: 10,
  outDir: 'state/get/',
  imageResolution: 600,
  rps: 8,
  verbose: false,
  withoutLanguageVariants: false,
  gotOptions: {
    prefixUrl: 'https://phet.colorado.edu/',
    retry: {
      limit: 5,
    },
  },
}

if (argv.includeLanguages && !argv.includeLanguages.includes('en')) {
  argv.includeLanguages += ',en'
}

export default {
  ...defaultOptions,
  ...(process.env.PHET_RPS ? { rps: parseInt(process.env.PHET_RPS || '', 10) } : {}),
  ...(process.env.PHET_VERBOSE_ERRORS !== undefined ? { verbose: process.env.PHET_VERBOSE_ERRORS === 'true' } : {}),
  ...(argv.withoutLanguageVariants ? { withoutLanguageVariants: argv.withoutLanguageVariants } : {}),
  ...(argv.includeLanguages ? { includeLanguages: formatLanguages(argv.includeLanguages) } : {}),
  ...(argv.excludeLanguages ? { excludeLanguages: formatLanguages(argv.excludeLanguages) } : {}),
  gotOptions: {
    ...defaultOptions.gotOptions,
    retry: {
      ...defaultOptions.gotOptions.retry,
      ...(process.env.PHET_RETRIES ? { limit: parseInt(process.env.PHET_RETRIES, 10) } : {}),
    },
  },
}

const matchedrootCategories = (input: string): string[] => {
  const rootCats = new Set<string>()
  const formatedSubjects = formatSubjects(input)

  // ensure that if input 'math, motion', rootCategories will be [Math, Physics]
  // it checks each root and its subcats to see if they're exist in input
  Object.entries(categoriesTree).forEach(([root, subcats]) => {
    if (formatedSubjects.includes(slugify(root, { lower: true }))) {
      rootCats.add(root)
    } else {
      formatedSubjects.forEach((sub) => {
        if (subcats.includes(sub)) {
          rootCats.add(root)
        }
      })
    }
  })

  return [...rootCats]
}

const matchedCats = (input: string) => {
  const formatedSubjects = formatSubjects(input)
  const catsKeys = Object.keys(cats)
  const catsValues = Object.values(cats)

  const validCats = {}

  formatedSubjects.forEach((sub) => {
    const index = catsValues.indexOf(sub)
    if (index >= 0) validCats[catsKeys[index]] = sub
  })

  return validCats
}

export const categories = {
  rootCats: argv.subjects ? matchedrootCategories(argv.subjects) : rootCategories,
  cats: argv.subjects ? matchedCats(argv.subjects) : cats,
}

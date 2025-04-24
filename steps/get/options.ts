import yargs from 'yargs'
import * as dotenv from 'dotenv'
import { hideBin } from 'yargs/helpers'
import { formatLanguages, formatSubjects, getMatchedCats } from 'steps/utils'
import { cats, rootCategories } from 'lib/const'

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

export const categories = {
  rootCats: argv.subjects ? formatSubjects(argv.subjects) : rootCategories,
  cats: argv.subjects ? getMatchedCats(argv.subjects) : cats,
}

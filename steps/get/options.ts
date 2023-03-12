import yargs from 'yargs'
import * as dotenv from 'dotenv'
import { hideBin } from 'yargs/helpers'
dotenv.config()

const { argv } = yargs(hideBin(process.argv)).boolean('withoutLanguageVariants').array('includeLanguages').array('excludeLanguages')

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
  argv.includeLanguages.unshift('en')
}

export default {
  ...defaultOptions,
  ...(process.env.PHET_RPS ? { rps: parseInt(process.env.PHET_RPS || '', 10) } : {}),
  ...(process.env.PHET_VERBOSE_ERRORS !== undefined ? { verbose: process.env.PHET_VERBOSE_ERRORS === 'true' } : {}),
  ...(argv.withoutLanguageVariants ? { withoutLanguageVariants: argv.withoutLanguageVariants } : {}),
  ...(argv.includeLanguages ? { includeLanguages: argv.includeLanguages } : {}),
  ...(argv.excludeLanguages ? { excludeLanguages: argv.excludeLanguages } : {}),
  gotOptions: {
    ...defaultOptions.gotOptions,
    retry: {
      ...defaultOptions.gotOptions.retry,
      ...(process.env.PHET_RETRIES ? { limit: parseInt(process.env.PHET_RETRIES, 10) } : {}),
    },
  },
}

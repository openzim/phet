import yargs from 'yargs'
import { log } from '../../lib/logger.js'
import welcome from '../../lib/welcome.js'
import { hideBin } from 'yargs/helpers'
import { fetchMetaAndLanguages, fetchCategoriesTree, fetchSimsList, fetchSims } from './fetchers.js'
;(async () => {
  welcome('get')
  await fetchMetaAndLanguages()
  await fetchCategoriesTree()
  await fetchSimsList()
  await fetchSims()
  log.info('Done.')
})().catch((err: Error) => {
  if (err && err.message) {
    log.error(err.message)
  } else {
    log.error(`An unidentified error occured ${err}`)
  }
  yargs(hideBin(process.argv)).exit(1, err)
})

import { log } from '../../lib/logger.js'
import welcome from '../../lib/welcome.js'
import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { convertImages, convertDocuments } from './converter.js'
;(async () => {
  welcome('transform')
  await convertImages()
  await convertDocuments()
  log.info('Done.')
})().catch((err: Error) => {
  if (err && err.message) {
    log.error(err.message)
  } else {
    log.error(`An unidentified error occured ${err}`)
  }
  yargs(hideBin(process.argv)).exit(1, err)
})

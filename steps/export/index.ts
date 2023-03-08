import yargs from 'yargs'
import { log } from '../../lib/logger.js'
import welcome from '../../lib/welcome.js'
import { hideBin } from 'yargs/helpers'
import Banana from 'banana-i18n'
import { prepareTargets, convertTranslations, loadTranslations, exportTarget } from './converters.js'
;(async () => {
  welcome('export')
  const targets = prepareTargets()

  await convertTranslations()

  const defaultTranslations = await loadTranslations('en')
  const banana = new Banana('en', { messages: defaultTranslations })
  for (const target of targets) {
    await exportTarget(target, banana)
  }
  log.info('Done.')
})().catch((err: Error) => {
  if (err && err.message) {
    log.error(err.message)
  } else {
    log.error(`An unidentified error occured ${err}`)
  }
  yargs(hideBin(process.argv)).exit(1, err)
})

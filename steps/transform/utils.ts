import * as fs from 'fs'
import md5 from 'md5'
import * as path from 'path'
import * as dotenv from 'dotenv'
import * as cheerio from 'cheerio'

import * as minifier from 'html-minifier'
import { log } from '../../lib/logger.js'
import { loadingImage } from '../../res/templates/loading-image.js'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

const outDir = 'state/transform/'
const verbose = process.env.PHET_VERBOSE_ERRORS !== undefined ? process.env.PHET_VERBOSE_ERRORS === 'true' : false

export const modifyHTML = async (fileName, html): Promise<string> => {
  const simScript = await fs.promises.readFile(path.join(__dirname, '../../res/js/sim.js'), 'utf8')
  const simCss = await fs.promises.readFile(path.join(__dirname, '../../res/css/sim.css'), 'utf8')
  const $ = cheerio.load(html)
  $('meta[property^="og:"]').remove()
  $('img#splash').attr('src', loadingImage)
  $('script').last().after(`<script>${simScript}</script>`)
  $('head').append(`<style>${simCss}</style>`)
  await Promise.all(
    $('script')
      .each((indx, elem: cheerio.Element) => {
        const script = $(elem).html().trim()
        const scriptId = $(elem).attr('id')
        if ((scriptId && scriptId.search('google-analytics') > -1) || script.search('google-analytics.com') > -1) {
          $(elem).remove()
          return
        }
        if (script) {
          const newFileName = `${md5(script)}.js`
          $(elem).attr('src', newFileName)
          $(elem).html('')
          try {
            fs.promises.writeFile(`${outDir}${newFileName}`, script, 'utf8')
          } catch (e) {
            if (verbose) {
              log.error(`Failed to extract script from ${fileName}`)
              log.error(e)
            } else {
              log.warn(`Unable to extract script from ${fileName}. Skipping it.`)
            }
          }
        }
      })
      .toArray(),
  )
  return $.html()
}

export const removeStrings = (html): string => {
  html = minifier.minify(html, { removeComments: true })
  return html
}

export const extractBase64 = async (fileName, html): Promise<string> => {
  const b64files = html.match(/( src=)?'data:([A-Za-z-+/]+);base64,[^']*/g)

  await Promise.all(
    (b64files || []).map(async (b64entry) => {
      const isInSrc = b64entry.slice(0, 6) === ' src="'
      b64entry = b64entry.slice(isInSrc ? 6 : 1)

      const { elementData, mimeType } = extractBase64Entity(b64entry)
      if (!elementData) return html

      const fileExt = path.extname(mimeType).slice(1)
      if (['ogg', 'mpeg'].includes(fileExt)) return html

      const newName = md5(elementData)
      html.replace(b64entry, `${newName}.${fileExt}`)

      await fs.promises.writeFile(`${outDir}${newName}.${fileExt}`, elementData, { encoding: 'base64' })
      await fs.promises.writeFile(`${outDir}${fileName}`, html, 'utf8')
    }),
  )

  return html
}

const extractBase64Entity = (encoded) => {
  const decoded = encoded.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/)
  const mimeType = decoded && decoded[1]
  const elementData = !decoded || !decoded[2] || decoded[2].length === 0 || !mimeType ? null : decoded && decoded[2]
  return { elementData, mimeType }
}

import got from 'got'
import op from 'object-path'
import { RateLimit } from 'async-sema'
import options from './options.js'

export const popValueUpIfExists = (items: string[], value: string) => {
  const index = items.indexOf(value)
  if (index !== -1 && items.splice(items.indexOf(value), 1)) items.unshift('en')
  return items
}

export const delay = RateLimit(options.rps)

export const downloadCatalogData = async (url, simName) => {
  let response
  let fallback = false
  let status: number
  try {
    response = await got(url, { ...options.gotOptions })
  } catch (e) {
    status = op.get(e, 'response.statusCode')
    if (status === 404) {
      fallback = true
      url = `en/simulation/${simName}`
      response = await got(url, { ...options.gotOptions })
    }
  }
  if (!response) throw new Error(`Got no response from ${options.gotOptions.prefixUrl}${url}`)
  const { body } = response
  return { body, fallback, status }
}

export const unshiftValueUpIfNotExists = (items: string[], value: string): string[] => {
  if (!items) return []
  if (!items.includes(value)) items.unshift('en')
  return items
}

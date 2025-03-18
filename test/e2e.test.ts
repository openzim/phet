import 'ts-jest'
import * as fs from 'fs'
import { join } from 'path'
import { fork } from 'child_process'
import { ZimReader } from '@openzim/libzim'
import path from 'path'
import { fileURLToPath } from 'url'
import { jest } from '@jest/globals'
import { zimcheckAvailable, zimcheck } from './utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

jest.setTimeout(20 * 60 * 1000)

const language = 'cy'
const targetDir = './dist/'

const now = new Date()
const datePostfix = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`
const files = [`${targetDir}phet_mul_all_${datePostfix}.zim`, `${targetDir}phet_${language}_all_${datePostfix}.zim`]

const options = {
  cwd: join(__dirname, '..'),
  silent: false,
  execPath: 'ts-node-esm',
  execArgv: [],
}

describe('Create ZIM', () => {
  beforeAll(async () => {
    await removeZim()
  })

  beforeAll((done) => {
    const proc = fork('./steps/setup.ts', [], options)
    proc.on('close', done)
  })

  test(`Get [${language}]`, (done) => {
    const proc = fork('./steps/get/index.ts', ['--includeLanguages', language], options)
    proc.on('close', done)
  })

  test('Transform', (done) => {
    const proc = fork('./steps/transform/index.ts', [], options)
    proc.on('close', done)
  })

  test('Export', (done) => {
    const proc = fork('./steps/export/index.ts', [], options)
    proc.on('close', done)
  })
})

describe('Validate ZIM', () => {
  let zim: ZimReader

  beforeAll(() => {
    zim = new ZimReader(files[0])
  })

  test('Two zim files', async () => {
    const zim1 = await fs.promises.stat(files[0])
    expect(zim1).toBeDefined()
    const zim2 = await fs.promises.stat(files[1])
    expect(zim2).toBeDefined()
    // expect(zim1.size).toEqual(zim2.size);
  })

  test('zimcheck', async () => {
    if (await zimcheckAvailable()) {
      await expect(zimcheck(files[0])).resolves.not.toThrowError()
      await expect(zimcheck(files[1])).resolves.not.toThrowError()
    } else {
      console.log('Zimcheck not installed, skipping test')
    }
  })

  test('Count', async () => {
    const articlesCount = await zim.getCountArticles()
    expect(articlesCount).toBeGreaterThan(500)
  })

  test('Meta records', async () => {
    const article = await zim.getArticleByUrl('M/Counter')
    expect(article).toBeDefined()
    const meta: any = {}
    article.data
      .toString()
      .split(';')
      .forEach((item) => {
        const x = item.split('=')
        meta[x[0]] = x[1]
      })
    expect(parseInt(meta['text/html'], 10)).toBeGreaterThan(80)
    expect(parseInt(meta['image/png'], 10)).toBeGreaterThan(80)
    expect(parseInt(meta['font/ttf'], 10)).toBeGreaterThan(10)
    expect(parseInt(meta['application/javascript'], 10)).toBeGreaterThan(300)
  })

  test('Main page', async () => {
    const article = await zim.getArticleByUrl('A/index.html')
    expect(article).toBeDefined()
    expect(article.mimeType).toEqual('text/html')
    expect(article.data.length).toBeGreaterThan(1000)
  })

  afterAll(async () => {
    await zim.destroy()
    removeZim()
  })
})

const removeZim = () => {
  try {
    for (const file of files) {
      fs.promises.unlink(path.join(__dirname, file)).catch(() => {
        // noop
      })
    }
  } catch {
    // noop
  }
}

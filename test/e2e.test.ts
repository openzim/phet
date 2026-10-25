import 'ts-jest'
import * as fs from 'fs'
import { join } from 'path'
import { fork } from 'child_process'
import { Archive } from '@openzim/libzim'
import path from 'path'
import { fileURLToPath } from 'url'
import { jest } from '@jest/globals'
import { zimcheckAvailable, zimcheck } from './utils'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

jest.setTimeout(20 * 60 * 1000)

const language = 'cy'
const rootDir = join(__dirname, '..')
const targetDir = join(rootDir, 'output')

const now = new Date()
const datePostfix = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`
const files = [join(targetDir, `phet_mul_all_${datePostfix}.zim`), join(targetDir, `phet_${language}_all_${datePostfix}.zim`)]

const options = {
  cwd: rootDir,
  silent: false,
  execPath: process.execPath,
  execArgv: ['--import', 'tsx'],
}

const runStep = (script: string, args: string[] = []): Promise<void> =>
  new Promise((resolve, reject) => {
    const proc = fork(script, args, options)
    proc.on('error', reject)
    proc.on('close', (code, signal) => {
      if (code !== 0) {
        reject(new Error(`Script ${script} exited with code ${code}, signal ${signal}`))
      } else {
        resolve()
      }
    })
  })

describe('Create ZIM', () => {
  beforeAll(async () => {
    await removeZim()
    await runStep('./steps/setup.ts')
  })

  test(`Get [${language}]`, async () => {
    await runStep('./steps/get/index.ts', ['--includeLanguages', language])
  })

  test('Transform', async () => {
    await runStep('./steps/transform/index.ts')
  })

  test('Export', async () => {
    await runStep('./steps/export/index.ts')
  })
})

describe('Validate ZIM', () => {
  let zim: Archive

  beforeAll(async () => {
    for (const file of files) {
      await fs.promises.access(file)
    }
    zim = new Archive(files[0])
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

  test('Count', () => {
    const articlesCount = zim.allEntryCount
    expect(articlesCount).toBeGreaterThan(500)
  })

  test('Meta records', () => {
    const counterData = zim.getMetadata('Counter')
    expect(counterData).toBeDefined()
    const meta: any = {}
    counterData.split(';').forEach((item) => {
      const x = item.split('=')
      meta[x[0]] = x[1]
    })
    expect(parseInt(meta['text/html'], 10)).toBeGreaterThan(80)
    expect(parseInt(meta['image/png'], 10)).toBeGreaterThan(80)
    expect(parseInt(meta['font/ttf'], 10)).toBeGreaterThan(10)
    expect(parseInt(meta['application/javascript'], 10)).toBeGreaterThan(300)
  })

  test('Main page', () => {
    const entry = zim.hasMainEntry() ? zim.mainEntry : zim.getEntryByPath('index.html')
    expect(entry).toBeDefined()
    const item = entry.item
    expect(item.mimetype).toEqual('text/html')
    expect(item.size).toBeGreaterThan(1000)
  })

  afterAll(async () => {
    zim = null as any
    await removeZim()
  })
})

const removeZim = async () => {
  for (const file of files) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.promises.unlink(file)
        break
      } catch (err: any) {
        if (err.code === 'ENOENT') break
        const retryable = ['EBUSY', 'EPERM', 'EACCES'].includes(err.code)
        if (!retryable || attempt === 4) throw err
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
    }
  }
}

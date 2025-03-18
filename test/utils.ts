import { execa } from 'execa'

const zimcheckPath = process.env.ZIMCHECK_PATH || 'zimcheck'

export async function zimcheckAvailable() {
  try {
    await execa(`which ${zimcheckPath}`, { shell: true })
    return true
  } catch {
    return false
  }
}

export async function zimcheck(filePath: string) {
  await execa(`${zimcheckPath} ${filePath}`, { shell: true })
}

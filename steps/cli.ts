'use strict'

import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'
import { parameterDescriptions, applyParameterConstraints } from './parameterList'
import { spawn } from 'child_process'

/** **********************************/
/** Command Parsing ******************/
/** **********************************/

// Nota: this is only used to check consistency of arguments, parsed values
// are not used further down for simplicity

// eslint-disable-next-line @typescript-eslint/no-unused-expressions
yargs(hideBin(process.argv))
  .help('help')
  .usage(
    `Create a ZIM of PHET courses.

Usage: phet2zim --help`,
  )
  .describe(parameterDescriptions)
  .check(applyParameterConstraints)
  .strict().argv

/** **********************************/
/** Utility to run child with args ***/
/** **********************************/
const runProcess = (script: string) => {
  return new Promise<void>((resolve, reject) => {
    const child = spawn('tsx', [script, ...hideBin(process.argv)], { stdio: 'inherit' })

    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${script} exited with code ${code}`))
      }
    })
  })
}

/** **********************************/
/** Run steps in sequence ************/
/** **********************************/
;(async () => {
  try {
    await runProcess('steps/setup.ts')
    await runProcess('steps/get/index.ts')
    await runProcess('steps/transform/index.ts')
    await runProcess('steps/export/index.ts')
    console.log('All scripts executed successfully!')
  } catch (error) {
    console.error('Error executing scripts:', error)
    process.exit(1)
  }
})()

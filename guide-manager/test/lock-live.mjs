/** Opt-in contention test against the installed official lock, on a new test file. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { officialRuntime } from '../helper/apply-install.mjs'
const output = resolve(process.argv[2] ?? '')
if (!process.argv[2]) throw Error('output-required')
const file = join(output, 'package.json')
const mode = process.argv[3]
const runtime = await officialRuntime()
if (mode) {
  try {
    await runtime.withLock(file, async () => {
      if (mode === 'owner') {
        writeFileSync(join(output, 'held'), 'held')
        while (!existsSync(join(output, 'release'))) await delay(50)
      } else writeFileSync(file, mode)
    })
  } catch { process.exitCode = 2 }
} else {
  if (existsSync(output)) throw Error('new-output-required')
  mkdirSync(output, { recursive: true })
  writeFileSync(file, 'original')
  const launch = (kind) => {
    const child = spawn(process.execPath, ['--expose-internals', fileURLToPath(import.meta.url), output, kind], { windowsHide: true, stdio: 'ignore' })
    return { child, done: new Promise((resolveResult, reject) => { child.on('error', reject); child.on('exit', resolveResult) }) }
  }
  const owner = launch('owner')
  try {
    for (let i = 0; !existsSync(join(output, 'held')); i++) { if (i > 100) throw Error('owner-did-not-lock'); await delay(50) }
    assert.equal(await launch('contender').done, 2)
    assert.equal(readFileSync(file, 'utf8'), 'original')
    writeFileSync(join(output, 'release'), 'release')
    assert.equal(await owner.done, 0)
    assert.equal(await launch('after-release').done, 0)
    assert.equal(readFileSync(file, 'utf8'), 'after-release')
    writeFileSync(join(output, 'result.json'), JSON.stringify({ status: 'passed', officialLock: true, processes: 3, contenderRefused: true, originalPreservedWhileLocked: true }) + '\n')
    console.log('official-lock-contention-passed')
  } finally { if (owner.child.exitCode === null) { writeFileSync(join(output, 'release'), 'release'); await owner.done } }
}

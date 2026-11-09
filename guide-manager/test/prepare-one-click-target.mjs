/** Isolated same-protocol manager target; never changes workspace versions. */
import { existsSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baselineSource } from './baseline-source.mjs'
import { readJson, writeJson } from '../install.js'
const output = resolve(process.argv[2])
if (existsSync(output)) throw Error('use a new fixture directory')
baselineSource(output, resolve(dirname(fileURLToPath(import.meta.url)), '../..'))
const file = join(output, 'guide-manager/package.json')
writeJson(file, { ...readJson(file), version: '1.2.1' })
console.log(JSON.stringify({ output, managerVersion: '1.2.1', published: false }))

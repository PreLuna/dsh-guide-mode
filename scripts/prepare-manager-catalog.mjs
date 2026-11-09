/** Merge explicitly selected local manager releases; never fetches arbitrary packages. */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readManagerCatalog } from '../guide-manager/maintenance.js'
import { readJson, writeJson } from '../guide-manager/install.js'
const args = process.argv.slice(2)
const output = args.indexOf('--output')
if (output < 0 || !args[output + 1]) throw new Error('usage: node scripts/prepare-manager-catalog.mjs --release <manager-catalog.json> ... --output <new-file>')
const path = resolve(args[output + 1])
if (existsSync(path)) throw new Error('output already exists')
const artifacts = args.flatMap((arg, index) => arg === '--release' ? readJson(resolve(args[index + 1])).artifacts : [])
const seen = new Map()
for (const entry of artifacts) {
  if (seen.has(entry.version) && seen.get(entry.version).sha256 !== entry.sha256) throw new Error('same-version-different-manager-bytes')
  seen.set(entry.version, entry)
}
writeJson(path, { schema: 3, product: 'dsh-guide-mode', artifacts: [...seen.values()] })
readManagerCatalog(path, readJson(fileURLToPath(new URL('../guide-manager/package.json', import.meta.url))).dshGuide.host)
console.log(JSON.stringify({ status: 'prepared', path, versions: [...seen.keys()] }))

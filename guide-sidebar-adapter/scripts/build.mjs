// Bundle only our own vanilla JavaScript; upstream stays a runtime module dependency.
import { readFileSync, writeFileSync } from 'node:fs'
const core = readFileSync(new URL('../core.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const entry = readFileSync(new URL('../client.entry.js', import.meta.url), 'utf8')
if (!entry.includes('/* OWN_CORE */')) throw new Error('Missing own-code insertion point')
writeFileSync(new URL('../client.js', import.meta.url), entry.replace('/* OWN_CORE */', core))
console.log('Built sidebar adapter from own sources; no upstream code included')

// Bundle only our own vanilla JavaScript; upstream stays a runtime module dependency.
import { readFileSync, writeFileSync } from 'node:fs'
const core = readFileSync(new URL('../core.js', import.meta.url), 'utf8').replace(/^export /gm, '')
const entry = readFileSync(new URL('../client.entry.js', import.meta.url), 'utf8')
if (!entry.includes('/* OWN_CORE */')) throw new Error('Missing own-code insertion point')
const expected=entry.replace('/* OWN_CORE */', core)
const target=new URL('../client.js', import.meta.url)
if(process.argv.includes('--check')){
  if(readFileSync(target,'utf8')!==expected)throw Error('Generated sidebar client is stale; run node guide-sidebar-adapter/scripts/build.mjs')
  console.log('Generated sidebar client matches own sources')
}else{
  writeFileSync(target,expected)
  console.log('Built sidebar adapter from own sources; no upstream code included')
}

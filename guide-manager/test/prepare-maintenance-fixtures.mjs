/** Test-only good and load-failing manager candidates; production stays 1.1.0. */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson } from '../install.js'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(process.argv[2])
if (existsSync(output)) throw new Error('use a new fixture directory')
mkdirSync(output, { recursive: true })
for (const [kind, version] of [['good', '1.1.1'], ['broken', '1.1.2']]) {
  const source = join(output, kind)
  for (const name of ['guide-manager', 'guide-preset', 'guide-shield', 'guide-admission', 'guide-panel', 'guide-sidebar-adapter', 'guide-goal-adapter']) {
    cpSync(join(root, name), join(source, name), { recursive: true, filter: (path) => !path.split(sep).some((part) => ['node_modules', 'test', 'scripts', '.git'].includes(part)) })
  }
  const path = join(source, 'guide-manager/package.json')
  writeFileSync(path, `${JSON.stringify({ ...readJson(path), version }, null, 2)}\n`)
  if (kind === 'broken') writeFileSync(join(source, 'guide-manager/index.js'), "throw new Error('isolated-phase5c-manager-load-failure')\n")
}
console.log(JSON.stringify({ status: 'prepared', output, productionVersionsChanged: false }))

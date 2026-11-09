/** Test-only version candidates; never edits production versions or publishes. */
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readJson } from '../install.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const output = resolve(process.argv[2])
if (existsSync(output)) throw new Error('use a new fixture directory')
mkdirSync(output, { recursive: true })
for (const kind of ['single', 'coupled']) {
  const source = join(output, kind)
  mkdirSync(source)
  for (const name of ['guide-manager', 'guide-preset', 'guide-shield', 'guide-admission', 'guide-panel', 'guide-sidebar-adapter', 'guide-goal-adapter']) {
    cpSync(join(root, name), join(source, name), { recursive: true, filter: (path) => !path.split(sep).some((part) => ['node_modules', 'test', 'scripts', '.git'].includes(part)) })
  }
  const panelPath = join(source, 'guide-panel', 'package.json')
  const panel = readJson(panelPath)
  panel.version = kind === 'single' ? '1.1.1' : '1.2.0'
  if (kind === 'coupled') {
    panel.peerDependencies['@local/dsh-guide-shield'] = '1.1.1'
    panel.peerDependencies['@local/dsh-guide-admission'] = '1.1.1'
    for (const name of ['guide-shield', 'guide-admission']) {
      const path = join(source, name, 'package.json')
      const manifest = readJson(path)
      manifest.version = '1.1.1'
      if (name === 'guide-admission') manifest.peerDependencies['@local/dsh-guide-shield'] = '1.1.1'
      writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
    }
  }
  writeFileSync(panelPath, `${JSON.stringify(panel, null, 2)}\n`)
}
console.log(JSON.stringify({ status: 'prepared', output, productionVersionsChanged: false }))

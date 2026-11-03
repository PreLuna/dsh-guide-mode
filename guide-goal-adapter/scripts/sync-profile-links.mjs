/** Update only the two owned link importer records; never resolve or change registry packages. */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, copyFileSync, existsSync, renameSync, unlinkSync, mkdirSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const profile = join(process.env.USERPROFILE, '.dsh/profiles/desktop')
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(profile, 'package.json'))
const YAML = require('yaml')
const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
const lockPath = join(profile, 'pnpm-lock.yaml')
const text = readFileSync(lockPath, 'utf8')
const document = YAML.parseDocument(text)
if (document.errors.length) throw document.errors[0]
const before = document.toJS()
if (String(before.lockfileVersion) !== '9.0' || before.settings?.excludeLinksFromLockfile !== false
  || !before.importers?.['.']?.dependencies) throw new Error('Unsupported lockfile importer layout; use the profile package manager')
const owned = ['@local/dsh-guide-goal-adapter', '@local/dsh-guide-sidebar-adapter']
for (const name of owned) {
  const specifier = manifest.dependencies?.[name]
  if (specifier === undefined) document.deleteIn(['importers', '.', 'dependencies', name])
  else {
    const directory = name.endsWith('goal-adapter') ? 'guide-goal-adapter' : 'guide-sidebar-adapter'
    const expected = `link:${join(workspace, directory).replaceAll('\\', '/')}`
    if (specifier !== expected) throw new Error(`Unexpected owned link specifier for ${name}`)
    document.setIn(['importers', '.', 'dependencies', name], { specifier, version: specifier })
  }
}
const after = document.toJS()
const stripOwned = value => {
  const copy = structuredClone(value)
  for (const name of owned) delete copy.importers['.'].dependencies[name]
  return copy
}
if (!isDeepStrictEqual(stripOwned(before), stripOwned(after))) throw new Error('Lockfile update escaped the owned importer records')
const output = document.toString({ lineWidth: 0 })
if (output !== text) {
  const backups = join(workspace, 'evidence/LI-stage2-2026-11-02/desktop-before')
  mkdirSync(backups, { recursive: true })
  const backup = join(backups, 'pnpm-lock.before-links.yaml')
  if (!existsSync(backup)) copyFileSync(lockPath, backup)
  const temporary = `${lockPath}.li-${randomUUID()}.tmp`
  try { writeFileSync(temporary, output, { flag: 'wx' }); renameSync(temporary, lockPath) }
  finally { if (existsSync(temporary)) unlinkSync(temporary) }
}
console.log('Profile lockfile: owned link records synchronized; registry dependency graph unchanged')

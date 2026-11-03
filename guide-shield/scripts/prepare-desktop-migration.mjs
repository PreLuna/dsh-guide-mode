/** Read-only profile inspection; write the proposed migration under evidence. */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync, lstatSync, realpathSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const profile = join(process.env.USERPROFILE, '.dsh/profiles/desktop')
const output = join(workspace, 'evidence/O2-R6-desktop-migration-2026-11-03')
const source = join(workspace, 'guide-shield')
const name = '@local/dsh-guide-shield'
const specifier = `link:${source.replaceAll('\\', '/')}`
const YAML = createRequire(join(profile, 'package.json'))('yaml')
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
mkdirSync(output, { recursive: true })
const files = []
function propose(relative, candidateName, transform) {
  const before = readFileSync(join(profile, relative))
  const after = Buffer.from(transform(before.toString('utf8')))
  writeFileSync(join(output, candidateName), after)
  files.push({ relative, candidate: candidateName, beforeSha256: hash(before), afterSha256: hash(after), changed: !before.equals(after) })
}
const originalManifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
if (originalManifest.dependencies?.['@local/dsh-guide-panel'] !== `link:${join(workspace, 'guide-panel').replaceAll('\\', '/')}`) {
  throw new Error('The desktop panel is not linked to this reviewed workspace')
}
if (!originalManifest.dsh.profile.bundles.includes('@local/dsh-guide-goal-adapter')
  || !originalManifest.dsh.profile.bundles.includes('@local/dsh-guide-sidebar-adapter')) {
  throw new Error('Expected the existing paired goal/sidebar adapter selection')
}
propose('package.json', 'package.next.json', text => {
  const manifest = JSON.parse(text)
  if (manifest.dependencies[name] && manifest.dependencies[name] !== specifier) throw new Error('Conflicting shield dependency')
  manifest.dependencies[name] = specifier
  const bundles = manifest.dsh.profile.bundles.filter(item => item !== name)
  const panel = bundles.indexOf('@local/dsh-guide-panel')
  if (panel < 0) throw new Error('Panel bundle missing')
  bundles.splice(panel, 0, name)
  manifest.dsh.profile.bundles = bundles
  const stripped = structuredClone(manifest)
  delete stripped.dependencies[name]
  stripped.dsh.profile.bundles = stripped.dsh.profile.bundles.filter(item => item !== name)
  const before = structuredClone(originalManifest)
  delete before.dependencies[name]
  before.dsh.profile.bundles = before.dsh.profile.bundles.filter(item => item !== name)
  if (!isDeepStrictEqual(stripped, before)) throw new Error('Manifest change escaped shield ownership')
  return JSON.stringify(manifest, null, 2) + '\n'
})

const customShield = []
const patchPaths = [join(process.env.USERPROFILE, '.dsh/cordis.patch.yml'), join(profile, 'cordis.patch.yml')]
for (const path of patchPaths) {
  if (!existsSync(path)) continue
  const doc = YAML.parseDocument(readFileSync(path, 'utf8'))
  if (doc.errors.length) throw doc.errors[0]
  function visit(value) {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    if ((value.id === 'guide-panel' || value.name === '@local/dsh-guide-panel') && value.config?.shield) {
      customShield.push({ path, config: value.config.shield })
    }
    for (const child of Object.values(value)) visit(child)
  }
  visit(doc.toJS())
}
// This deployment has no override. Do not silently choose precedence for a
// different profile: prepare an explicit config transfer before applying it.
if (customShield.length) throw new Error('Custom panel shield overrides require an explicit transfer plan')

for (const [relative, candidate] of [['pnpm-lock.yaml', 'pnpm-lock.next.yaml'], ['node_modules/.pnpm/lock.yaml', 'installed-lock.next.yaml']]) {
  propose(relative, candidate, text => {
    const doc = YAML.parseDocument(text)
    if (doc.errors.length) throw doc.errors[0]
    const before = doc.toJS()
    if (String(before.lockfileVersion) !== '9.0' || before.settings?.excludeLinksFromLockfile !== false) throw new Error('Unsupported lockfile layout')
    const dependencies = doc.getIn(['importers', '.', 'dependencies'], true)
    if (!dependencies?.range) throw new Error('No dependency map range')
    const record = before.importers?.['.']?.dependencies?.[name]
    if (record) {
      if (!isDeepStrictEqual(record, { specifier, version: specifier })) throw new Error('Conflicting shield lock record')
      return text
    }
    const block = YAML.stringify({ [name]: { specifier, version: specifier } }).trimEnd()
      .split('\n').map(line => `      ${line}`).join('\n') + '\n'
    const position = dependencies.range[1]
    const next = text.slice(0, position) + block + text.slice(position)
    const after = YAML.parse(next)
    delete after.importers['.'].dependencies[name]
    if (!isDeepStrictEqual(before, after)) throw new Error('Lockfile change escaped the shield importer record')
    return next
  })
}

const link = join(profile, 'node_modules', name)
let linkExists = false
try {
  const stat = lstatSync(link)
  if (!stat.isSymbolicLink() || realpathSync(link).toLowerCase() !== realpathSync(source).toLowerCase()) throw new Error('Unexpected existing shield installation path')
  linkExists = true
} catch (error) { if (error.code !== 'ENOENT') throw error }
const plan = { date: '2026-11-03', profile, source, link, linkExists, files,
  preservedConfig: { enabled: true, inject: true, customPanelOverrides: customShield.length },
  unchangedHashes: Object.fromEntries(['cordis.patch.yml', 'cordis.yml', 'pnpm-workspace.yaml', 'node_modules/.modules.yaml'].map(relative =>
    [relative, hash(readFileSync(join(profile, relative)))])),
  checks: { manifestOnlyAddsShield: true, registryLockGraphsUnchanged: true, goalSidebarSelectionPreserved: true },
}
writeFileSync(join(output, 'plan.json'), JSON.stringify(plan, null, 2) + '\n')
console.log(JSON.stringify({ status: 'prepared', profile, files: files.map(file => ({ relative: file.relative, changed: file.changed })), linkExists, config: plan.preservedConfig }))

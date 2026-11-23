/** Freeze test data versions independently of the checkout's release versions. */
import { cpSync, mkdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { readJson, writeJson } from '../install.js'
import { RELEASE_KEYS, RELEASE_PACKAGES } from '../release.js'
export function baselineSource(output, workspace, versions = {}) {
  const versionOf = (name) => versions[name] ?? '1.1.0'
  mkdirSync(output, { recursive: true })
  for (const key of RELEASE_KEYS) {
    const directory = RELEASE_PACKAGES[key].slice('@local/dsh-'.length)
    cpSync(join(workspace, directory), join(output, directory), { recursive: true,
      filter: (path) => !path.split(sep).some((part) => ['node_modules', 'test', 'scripts', '.git'].includes(part)) })
    const file = join(output, directory, 'package.json'), manifest = readJson(file)
    manifest.version = versionOf(manifest.name)
    for (const group of ['dependencies', 'peerDependencies']) for (const name of Object.keys(manifest[group] ?? {})) {
      if (Object.values(RELEASE_PACKAGES).includes(name)) manifest[group][name] = versionOf(name)
    }
    // The manager BOM is a second version source: keep it aligned with the
    // versions used for the synthetic package, or the release has no matching
    // install combination.
    for (const [name, entry] of Object.entries(manifest.dshGuide?.components ?? {})) entry.version = versionOf(name)
    writeJson(file, manifest)
  }
  return output
}

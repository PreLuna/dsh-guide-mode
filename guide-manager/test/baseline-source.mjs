/** Freeze test data versions independently of the checkout's release versions. */
import { cpSync, mkdirSync } from 'node:fs'
import { join, sep } from 'node:path'
import { readJson, writeJson } from '../install.js'
import { RELEASE_KEYS, RELEASE_PACKAGES } from '../release.js'
export function baselineSource(output, workspace) {
  mkdirSync(output, { recursive: true })
  for (const key of RELEASE_KEYS) {
    const directory = RELEASE_PACKAGES[key].slice('@local/dsh-'.length)
    cpSync(join(workspace, directory), join(output, directory), { recursive: true,
      filter: (path) => !path.split(sep).some((part) => ['node_modules', 'test', 'scripts', '.git'].includes(part)) })
    const file = join(output, directory, 'package.json'), manifest = readJson(file)
    manifest.version = '1.1.0'
    for (const group of ['dependencies', 'peerDependencies']) for (const name of Object.keys(manifest[group] ?? {})) {
      if (Object.values(RELEASE_PACKAGES).includes(name)) manifest[group][name] = '1.1.0'
    }
    writeJson(file, manifest)
  }
  return output
}

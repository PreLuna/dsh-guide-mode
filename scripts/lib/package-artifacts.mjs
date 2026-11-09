/** Shared offline npm pack and fixed-commit materialization. Never publishes. */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { artifactInventory } from '../../guide-manager/artifacts.js'
import { digest, fingerprint } from '../../guide-manager/install.js'
import { commitSha, packageAsset, RELEASE_KEYS, RELEASE_PACKAGES } from '../../guide-manager/release.js'

export const packageDirectory = (key) => RELEASE_PACKAGES[key].slice('@local/dsh-'.length)
export function resolveNpmCli(value = process.env.npm_execpath) {
  const path = value ?? join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js')
  if (!existsSync(path)) throw new Error('npm-cli-unavailable-run-through-npm')
  return path
}
export function packPackages({ sourceRoot, output, npmCli = process.env.npm_execpath, cacheRoot = join(output, '.npm-cache') }) {
  npmCli = resolveNpmCli(npmCli)
  mkdirSync(output, { recursive: true })
  return RELEASE_KEYS.map((key) => {
    const source = join(sourceRoot, packageDirectory(key))
    const manifest = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
    if (manifest.name !== RELEASE_PACKAGES[key] || !/^\d+\.\d+\.\d+$/.test(manifest.version) || manifest.private !== true || manifest.license !== 'UNLICENSED'
      || (manifest.dshGuide?.dataSchema ?? 1) !== 1 || (key !== 'manager' && manifest.dshGuide?.contract !== 1)
      || (key === 'manager' && (manifest.dshGuide?.product !== 'dsh-guide-mode' || (manifest.dshGuide.controlSchema ?? 1) !== 1))) throw new Error(`unsupported-package-metadata:${key}`)
    const [pack] = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', source, '--offline', '--ignore-scripts', '--json', '--pack-destination', output], {
      encoding: 'utf8', windowsHide: true,
      env: { ...process.env, npm_config_cache: resolve(cacheRoot), npm_config_update_notifier: 'false' },
    }))
    if (pack.name !== manifest.name || pack.version !== manifest.version || pack.filename !== packageAsset(key, manifest.version)
      || pack.files.some((file) => /(^|\/)(test|tests|scripts|node_modules|evidence|\.git)(\/|$)/.test(file.path))) throw new Error(`invalid-pack-result:${key}`)
    const file = join(output, pack.filename)
    const sha256 = digest(readFileSync(file))
    const inventory = artifactInventory(file, sha256)
    if (fingerprint(Object.keys(inventory.files).sort()) !== fingerprint(pack.files.map((item) => item.path).sort())) throw new Error(`pack-inventory-mismatch:${key}`)
    for (const [path, hash] of Object.entries(inventory.files)) if (digest(readFileSync(join(source, path))) !== hash) throw new Error(`pack-source-mismatch:${key}/${path}`)
    return { key, package: manifest.name, version: manifest.version, contract: manifest.dshGuide?.contract ?? null,
      file, sha256, bytes: statSync(file).size, integrity: pack.integrity, files: pack.files.map((item) => item.path), manifest, fileHashes: inventory.files }
  })
}

export function materializeCommit(repositoryRoot, requestedCommit, output) {
  if (!commitSha(requestedCommit)) throw new Error('full-source-commit-required')
  const git = (args, encoding = 'utf8') => execFileSync('git', args, { cwd: repositoryRoot, encoding, windowsHide: true })
  const commit = git(['rev-parse', '--verify', `${requestedCommit}^{commit}`]).trim()
  if (!commitSha(commit)) throw new Error('invalid-source-commit')
  const rows = git(['ls-tree', '-r', commit]).trim().split('\n')
  if (rows.some((row) => !/^(100644|100755) blob /.test(row))) throw new Error('non-regular-source-tree')
  if (existsSync(output)) throw new Error('source-output-already-exists')
  mkdirSync(output, { recursive: true })
  const archive = join(output, 'source.zip')
  git(['archive', '--format=zip', '--prefix=source/', '-o', archive, commit])
  const entries = execFileSync('tar', ['-tf', archive], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter((item) => item && !item.endsWith('/')).map((item) => item.replace(/^source\//, '')).sort()
  const expected = git(['ls-tree', '-r', '--name-only', commit]).trim().split('\n').sort()
  if (fingerprint(entries) !== fingerprint(expected)) throw new Error('source-archive-inventory-mismatch')
  execFileSync('tar', ['-xf', archive, '-C', output], { windowsHide: true })
  return { commit, sourceRoot: join(output, 'source'), archive, files: entries.length }
}

export function verifyPackageCommit(repositoryRoot, commit, key, files) {
  if (!commitSha(commit)) throw new Error('invalid-source-commit')
  for (const [path, hash] of Object.entries(files)) {
    const content = execFileSync('git', ['show', `${commit}:${packageDirectory(key)}/${path}`], { cwd: repositoryRoot, windowsHide: true, maxBuffer: 32 * 1024 * 1024 })
    if (digest(content) !== hash) throw new Error(`package-commit-mismatch:${key}/${path}`)
  }
}

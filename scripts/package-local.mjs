import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packages = ['guide-preset', 'guide-shield', 'guide-admission', 'guide-panel', 'guide-sidebar-adapter', 'guide-goal-adapter']
const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true }).trim()
if (git(['status', '--porcelain'])) throw Error('Commit the reviewed workspace before packaging; a snapshot must have an exact source commit.')
const commit = git(['rev-parse', 'HEAD'])
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version
const output = join(root, 'dist', `${version}-${commit.slice(0, 12)}`)
if (existsSync(output)) throw Error('Snapshot already exists; preserve its hashes instead of overwriting it.')
const npmCli = process.env.npm_execpath
if (!npmCli || !existsSync(npmCli)) throw Error('Run this script with npm run pack:local.')
mkdirSync(output, { recursive: true })
const sourceName = `dsh-guide-mode-${version}-${commit.slice(0, 12)}.zip`
if (git(['ls-tree', '-r', commit]).split('\n').some(row => !/^(100644|100755) blob /.test(row))) throw Error('Source snapshots require regular files; review links or submodules separately.')
execFileSync('git', ['archive', '--format=zip', '--prefix=dsh-guide-mode/', '-o', join(output, sourceName), commit], { cwd: root, windowsHide: true })
const sourceEntries = execFileSync('tar', ['-tf', join(output, sourceName)], { encoding: 'utf8', windowsHide: true }).split(/\r?\n/).filter(entry => entry && !entry.endsWith('/')).map(entry => entry.replace(/^dsh-guide-mode\//, '')).sort()
const expected = git(['ls-tree', '-r', '--name-only', commit]).split('\n').sort()
if (JSON.stringify(sourceEntries) !== JSON.stringify(expected)) throw Error('Source ZIP differs from the reviewed Git tree')
const verificationRoot = join(output, 'source-for-verification')
mkdirSync(verificationRoot)
execFileSync('tar', ['-xf', join(output, sourceName), '-C', verificationRoot], { windowsHide: true })
// Pack committed bytes, independent of Windows checkout line-ending filters.
const sourceRoot = join(verificationRoot, 'dsh-guide-mode')
const rows = []
const hashFile = path => createHash('sha256').update(readFileSync(path)).digest('hex')
for (const directory of packages) {
  const source = join(sourceRoot, directory)
  const metadata = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'))
  if (metadata.version !== version || metadata.private !== true || metadata.license !== 'UNLICENSED') throw Error(`Unexpected private snapshot metadata: ${directory}`)
  const result = JSON.parse(execFileSync(process.execPath, [npmCli, 'pack', source, '--offline', '--ignore-scripts', '--json', '--pack-destination', output], {
    cwd: root, encoding: 'utf8', windowsHide: true,
    env: { ...process.env, npm_config_cache: join(root, 'dist/.npm-cache'), npm_config_update_notifier: 'false' },
  }))
  if (result.length !== 1 || result[0].name !== metadata.name || result[0].version !== version) throw Error(`Pack metadata mismatch: ${directory}`)
  const pack = result[0]
  if (/[\\/]/.test(pack.filename)) throw Error('Unexpected archive filename')
  if (pack.files.some(file => /(^|\/)(test|tests|scripts|node_modules|evidence|\.git)(\/|$)/.test(file.path))) throw Error(`Non-runtime files in package: ${directory}`)
  const tarEntries = execFileSync('tar', ['-tzf', join(output, pack.filename)], { encoding: 'utf8', windowsHide: true }).trim().split(/\r?\n/).filter(entry => !entry.endsWith('/')).map(entry => entry.replace(/^package\//, '')).sort()
  if (JSON.stringify(tarEntries) !== JSON.stringify(pack.files.map(file => file.path).sort())) throw Error(`Archive inventory mismatch: ${directory}`)
  rows.push({ name: metadata.name, version, file: pack.filename, sha256: hashFile(join(output, pack.filename)), integrity: pack.integrity, files: pack.files.map(file => file.path) })
}
rows.push({ file: sourceName, sha256: hashFile(join(output, sourceName)), fileCount: sourceEntries.length })
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ distribution: 'private-github-snapshot', version, commit, externalModelCalls: 0, artifacts: rows }, null, 2) + '\n')
writeFileSync(join(output, 'SHA256SUMS.txt'), rows.map(row => `${row.sha256}  ${row.file}`).join('\n') + '\n')
console.log(JSON.stringify({ status: 'packed', distribution: 'private-github-snapshot', commit, output, packages: packages.length, sourceFiles: sourceEntries.length }))

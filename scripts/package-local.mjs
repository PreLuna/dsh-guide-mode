import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { packPackages } from './lib/package-artifacts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
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
for (const entry of packPackages({ sourceRoot, output, npmCli, cacheRoot: join(root, 'dist/.npm-cache') })) {
  rows.push({ name: entry.package, version: entry.version, file: entry.file.split(/[\\/]/).at(-1), sha256: entry.sha256, integrity: entry.integrity, files: entry.files })
}
rows.push({ file: sourceName, sha256: hashFile(join(output, sourceName)), fileCount: sourceEntries.length })
writeFileSync(join(output, 'manifest.json'), JSON.stringify({ distribution: 'private-github-snapshot', version, commit, externalModelCalls: 0, artifacts: rows }, null, 2) + '\n')
writeFileSync(join(output, 'SHA256SUMS.txt'), rows.map(row => `${row.sha256}  ${row.file}`).join('\n') + '\n')
console.log(JSON.stringify({ status: 'packed', distribution: 'private-github-snapshot', commit, output, packages: rows.filter((row) => row.name).length, sourceFiles: sourceEntries.length }))

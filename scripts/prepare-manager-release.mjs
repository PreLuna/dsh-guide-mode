/** Package working-tree bytes for isolated Phase 5A tests; does not publish or edit a profile. */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { packPackages } from './lib/package-artifacts.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const sourceIndex = args.indexOf('--source')
const sourceRoot = sourceIndex >= 0 ? resolve(args[sourceIndex + 1]) : root
const index = args.indexOf('--output')
if (index < 0 || !args[index + 1]) throw new Error('usage: npm run manager:release -- --output <new-directory>')
const output = resolve(args[index + 1])
if (existsSync(output)) throw new Error('output already exists; preserve the existing release')
const npmCli = process.env.npm_execpath
if (!npmCli || !existsSync(npmCli)) throw new Error('run through npm run manager:release')
mkdirSync(output, { recursive: true })
const artifacts = packPackages({ sourceRoot, output, npmCli, cacheRoot: join(root, 'dist', '.npm-cache') })
  .map(({ manifest, fileHashes, bytes, integrity, ...entry }) => entry)
const catalogPath = join(output, 'release-catalog.json')
const catalog = { schema: 1, product: 'dsh-guide-mode', release: 'private-development-snapshot', components: artifacts.filter((item) => item.key !== 'manager').map(({ files, ...entry }) => entry) }
writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
writeFileSync(join(output, 'manager-catalog.json'), `${JSON.stringify({ schema: 3, product: 'dsh-guide-mode', artifacts: artifacts.filter((item) => item.key === 'manager').map(({ files, contract, ...entry }) => entry) }, null, 2)}\n`)
writeFileSync(join(output, 'manifest.json'), `${JSON.stringify({ source: sourceRoot === root ? 'working-tree' : 'external-source-tree', sourceRoot, published: false, artifacts }, null, 2)}\n`)
writeFileSync(join(output, 'manager-config.json'), `${JSON.stringify({ catalogPath }, null, 2)}\n`)
console.log(JSON.stringify({ status: 'packed', published: false, output, catalogPath, packages: artifacts.length }))

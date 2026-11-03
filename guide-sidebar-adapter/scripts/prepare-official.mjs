// Download and verify the exact published baseline, without altering desktop.
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'

const workspace = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const destination = join(workspace, 'evidence/LI-stage2-2026-11-02/official')
mkdirSync(destination, { recursive: true })
const metadata = await fetch('https://registry.npmjs.org/dsh-better-sidebar/0.28.2').then(response => {
  if (!response.ok) throw new Error(`Registry metadata: ${response.status}`)
  return response.json()
})
const url = new URL(metadata.dist.tarball)
if (url.hostname !== 'registry.npmjs.org' || url.protocol !== 'https:') throw new Error('Unexpected registry tarball URL')
const tarball = join(destination, 'dsh-better-sidebar-0.28.2.tgz')
let bytes = existsSync(tarball) ? readFileSync(tarball) : Buffer.from(await fetch(url).then(response => {
  if (!response.ok) throw new Error(`Registry tarball: ${response.status}`)
  return response.arrayBuffer()
}))
const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`
if (integrity !== metadata.dist.integrity) throw new Error('Published package integrity mismatch')
writeFileSync(tarball, bytes)
const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split(/\r?\n/)
if (entries.some(entry => !entry.startsWith('package/') || entry.split('/').includes('..'))) throw new Error('Unsafe package archive paths')
if (!existsSync(join(destination, 'package/package.json'))) execFileSync('tar', ['-xzf', tarball, '-C', destination])
writeFileSync(join(destination, 'registry-baseline.json'), JSON.stringify({ name: metadata.name, version: metadata.version, tarball: url.href, integrity }, null, 2) + '\n')
console.log(JSON.stringify({ status: 'verified', version: metadata.version, integrity, files: entries.length }))

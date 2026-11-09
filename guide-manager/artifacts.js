/** Read-only, bounded inventory of trusted npm tarballs. Never extracts paths. */
import { readFileSync, existsSync, lstatSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { digest } from './install.js'

export function artifactInventory(file, sha256) {
  const packed = readFileSync(file)
  if (packed.length > 8 * 1024 * 1024 || digest(packed) !== sha256) throw new Error('artifact-integrity-mismatch')
  const bytes = gunzipSync(packed, { maxOutputLength: 32 * 1024 * 1024 })
  const files = {}
  const paths = new Set()
  let manifest
  for (let offset = 0; offset + 512 <= bytes.length;) {
    const header = bytes.subarray(offset, offset + 512)
    if (header.every((value) => value === 0)) break
    const string = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '')
    const octal = (start, length) => {
      const value = string(start, length).trim()
      if (!/^[0-7]+$/.test(value)) throw new Error('unsupported-tar-number')
      return parseInt(value, 8)
    }
    const checksum = [...header].reduce((sum, value, index) => sum + (index >= 148 && index < 156 ? 32 : value), 0)
    if (checksum !== octal(148, 8)) throw new Error('invalid-tar-checksum')
    const name = `${string(345, 155) ? `${string(345, 155)}/` : ''}${string(0, 100)}`
    const type = string(156, 1)
    const size = octal(124, 12)
    if (offset + 512 + size > bytes.length || !['', '0', '5'].includes(type)) throw new Error('unsupported-tar-entry')
    if (!/^package\//.test(name) || name.includes('\\') || name.includes(':') || name.split('/').some((part) => ['.', '..'].includes(part))) throw new Error('unsafe-tar-path')
    const relative = name.slice(8)
    if (type !== '5') {
      if (!relative || paths.has(relative.toLowerCase()) || paths.size > 2000) throw new Error('duplicate-or-excessive-tar-path')
      paths.add(relative.toLowerCase())
      const content = bytes.subarray(offset + 512, offset + 512 + size)
      files[relative] = digest(content)
      if (relative === 'package.json') manifest = JSON.parse(content.toString('utf8'))
    }
    offset += 512 + Math.ceil(size / 512) * 512
  }
  // The preset is a data-only bundle and has no JavaScript entry point.
  const entry = manifest?.exports?.['.']
  if (!manifest || !files['cordis.patch.yml'] || (typeof entry === 'string' && !files[entry.replace(/^\.\//, '')])) throw new Error('incomplete-package-artifact')
  return { manifest, files }
}

export function packageInventory(profile, entry) {
  const root = join(profile, 'node_modules', ...entry.package.split('/'))
  return Object.fromEntries(Object.keys(entry.files).map((name) => {
    const file = join(root, ...name.split('/'))
    // Reject symbolic file replacements; the package root itself may be a pnpm link.
    return [name, existsSync(file) && lstatSync(file).isFile() ? digest(readFileSync(file)) : null]
  }))
}

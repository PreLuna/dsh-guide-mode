import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: root }).toString().split('\0').filter(Boolean)
const forbidden = /(^|\/)(node_modules|__pycache__|isolated-home|\.dsh)(\/|$)|^(evidence|better-sidebar-fork|docs\/archive|dist)\/|(^|\/)\.env($|\.)|\.(pyc|tgz|zip)$/
const errors = []
for (const name of [...new Set(files)]) {
  const path = resolve(root, name)
  if (!existsSync(path)) continue // A tracked file pending deletion is absent from the proposed tree.
  if (forbidden.test(name)) errors.push(`Excluded artifact in repository: ${name}`)
  if (!name.endsWith('.md')) continue
  const text = readFileSync(path, 'utf8')
  for (const [, link] of text.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^[a-z]+:\/\//i.test(link) || link.startsWith('#')) continue
    const local = link.split('#')[0]
    const target = resolve(dirname(path), local)
    const within = relative(root, target)
    // Original evidence stays on the maintainer's machine and is intentionally not in Git.
    if (within === 'evidence' || within.startsWith(`evidence${sep}`)) continue
    if (!existsSync(target)) errors.push(`Missing Markdown target in ${name}: ${link}`)
  }
}
if (errors.length) throw Error(errors.join('\n'))
console.log('Repository boundaries and current Markdown links passed; local evidence is excluded.')

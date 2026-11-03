import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { foldSubagentDescriptor, SubagentError } from '@deepseek-ai/dsh-subagent'
import { apply as mount } from './core.js'
export { name, inject } from './core.js'

const sources = {
  '@deepseek-ai/dsh-subagent': '9a9572e70fffdb100deb63326167f32bbf63016ce49c0017495dabcb95b44168',
  '@deepseek-ai/cordis': '6a9394c0877ff45218818c6e815edd038f8057e1a1deb390a8d43ec81c57691e',
}
export function apply(ctx, config) {
  let sourceError
  try {
    for (const [specifier, expected] of Object.entries(sources)) {
      const actual = createHash('sha256').update(readFileSync(fileURLToPath(import.meta.resolve(specifier)))).digest('hex')
      if (actual !== expected) throw Error(`unsupported-source:${specifier}`)
    }
  } catch (error) { sourceError = error.message }
  return mount(ctx, config, { foldDescriptor: foldSubagentDescriptor, SubagentError, sourceError })
}

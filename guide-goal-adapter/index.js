import * as originalDriver from '@deepseek-ai/dsh-goal-round-driver'
import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { createAdapter } from './core.js'

// Resolve through DSH's installed-module router. No vendored upstream source.
const driverUrl = import.meta.resolve('@deepseek-ai/dsh-goal-round-driver')
const driverHash = createHash('sha256').update(readFileSync(new URL(driverUrl))).digest('hex')
const adapter = createAdapter(originalDriver, { driverHash, foldDescriptor: foldSubagentDescriptor })
export const name = adapter.name
export const inject = adapter.inject
export const apply = adapter.apply

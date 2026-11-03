import { foldSubagentDescriptor } from '@deepseek-ai/dsh-subagent'
import { apply as mountShield } from './core.js'
export { name, inject } from './core.js'
export function apply(ctx, config) { return mountShield(ctx, config, foldSubagentDescriptor) }

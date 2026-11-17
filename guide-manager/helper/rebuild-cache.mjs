/** Explicit local cache rebuild. Read-only unless --apply is passed. */
import { resolve } from 'node:path'
import { applyCacheRebuildPlan, cachePlanView } from '../cache.js'

const args = process.argv.slice(2)
let profile = null
const catalogs = []
let apply = false
for (let index = 0; index < args.length; index++) {
  const name = args[index]
  if (name === '--apply') { apply = true; continue }
  if (name === '--profile' || name === '--catalog') {
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`missing-${name.slice(2)}`)
    if (name === '--profile') profile = resolve(args[++index])
    else catalogs.push(resolve(args[++index]))
    continue
  }
  throw new Error('usage: rebuild-cache.mjs --profile <dir> --catalog <catalog.json> [--catalog ...] [--apply]')
}
if (!profile) throw new Error('profile-required')
const plan = cachePlanView({ dir: profile }, catalogs)
if (plan.blockers.length) {
  console.log(JSON.stringify({ status: 'blocked', blockers: plan.blockers, targets: plan.targets }, null, 2))
  process.exitCode = 1
} else if (!apply) {
  console.log(JSON.stringify({ status: 'planned', plan }, null, 2))
} else {
  console.log(JSON.stringify(applyCacheRebuildPlan(plan), null, 2))
}

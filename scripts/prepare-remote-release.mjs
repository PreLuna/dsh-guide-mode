import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { prepareRemoteRelease } from './lib/release-bundle.mjs'
import { readJson } from '../guide-manager/install.js'
const args = process.argv.slice(2)
const options = {}
const previous = []
for (let index = 0; index < args.length; index++) {
  const name = args[index]
  if (name === '--development') { options.development = true; continue }
  if (!['--repository', '--commit', '--source', '--output', '--tag', '--channel', '--previous', '--history-if-present', '--root'].includes(name) || !args[index + 1] || args[index + 1].startsWith('--')) throw new Error('invalid-remote-release-arguments')
  const value = args[++index]
  if (name === '--previous') previous.push(resolve(value))
  else if (name === '--history-if-present') {
    const directory = resolve(value)
    if (existsSync(resolve(directory, 'guide-release.json'))) previous.push(directory)
    else if (readJson(resolve(directory, 'history-status.json')).empty !== true) throw new Error('invalid-optional-history')
  } else {
    if (Object.hasOwn(options, name.slice(2))) throw new Error('duplicate-release-option')
    options[name.slice(2)] = value
  }
}
const [owner, repo, extra] = (options.repository ?? '').split('/')
if (extra || !options.output || !options.tag) throw new Error('usage: npm run manager:remote-release -- --repository owner/repo --commit <full-sha> --tag <tag> --output <new-directory> [--previous <bundle>]')
const root = resolve(options.root ?? fileURLToPath(new URL('..', import.meta.url)))
const result = prepareRemoteRelease({ repositoryRoot: root, commit: options.commit, sourceRoot: options.source, development: options.development,
  tag: options.tag, repository: { owner, repo }, channel: options.channel ?? 'stable', previous, output: resolve(options.output) })
console.log(JSON.stringify({ status: 'prepared', published: false, publishable: result.plan.publishable, output: result.directory, commit: result.plan.commit, artifacts: result.catalog.artifacts.length, assets: result.plan.assets.length }))

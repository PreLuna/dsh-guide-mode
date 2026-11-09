/** Explicit maintainer actions. draft/publish default to an offline preview. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyReleaseBundle } from './lib/release-bundle.mjs'
import { exportLatestHistory, GitHubReleaseClient, publishGitHubDraft, stageGitHubDraft } from './lib/github-release.mjs'
const args = process.argv.slice(2)
const action = args.shift()
const options = {}
for (let index = 0; index < args.length; index++) {
  const name = args[index]
  if (name === '--execute') { options.execute = true; continue }
  if (!['--bundle', '--output', '--repository', '--root', '--token-env'].includes(name) || !args[index + 1] || args[index + 1].startsWith('--') || Object.hasOwn(options, name.slice(2))) throw new Error('invalid-github-release-arguments')
  options[name.slice(2)] = args[++index]
}
if (!['verify', 'draft', 'publish', 'history'].includes(action)) throw new Error('action-must-be-verify-draft-publish-or-history')
const tokenEnv = options['token-env'] ?? 'DSH_GUIDE_RELEASE_TOKEN'
if (!/^DSH_GUIDE_[A-Z0-9_]*TOKEN$/.test(tokenEnv)) throw new Error('invalid-release-token-variable')
if (action === 'history') {
  const [owner, repo, extra] = (options.repository ?? '').split('/')
  if (extra || !options.output) throw new Error('history-requires-repository-and-new-output')
  const client = new GitHubReleaseClient({ repository: { owner, repo }, token: process.env[tokenEnv] })
  console.log(JSON.stringify(await exportLatestHistory(options.output, client)))
} else {
  if (!options.bundle) throw new Error('release-bundle-required')
  const repositoryRoot = resolve(options.root ?? fileURLToPath(new URL('..', import.meta.url)))
  const bundle = verifyReleaseBundle(options.bundle, { repositoryRoot })
  if (action === 'verify' || !options.execute) {
    console.log(JSON.stringify({ status: 'verified', action, executed: false, repository: bundle.plan.repository,
      tag: bundle.plan.tag, commit: bundle.plan.commit, assets: bundle.plan.assets, publishable: bundle.plan.publishable }))
  } else {
    const token = process.env[tokenEnv]
    if (!token) throw new Error('release-token-unavailable')
    const client = new GitHubReleaseClient({ repository: bundle.plan.repository, token })
    const receipt = action === 'draft' ? await stageGitHubDraft(options.bundle, client, { repositoryRoot }) : await publishGitHubDraft(options.bundle, client, { repositoryRoot })
    console.log(JSON.stringify({ status: receipt.status, tag: receipt.tag, commit: receipt.commit, releaseId: receipt.releaseId, assets: receipt.assets.length }))
  }
}

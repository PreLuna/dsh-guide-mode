/** Opt-in retained fixed-commit fixture. No remote calls or root Git mutations. */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { digest, writeJson } from '../install.js'
import { RELEASE_KEYS, RELEASE_PACKAGES } from '../release.js'
import { prepareRemoteRelease, verifyReleaseBundle } from '../../scripts/lib/release-bundle.mjs'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
if (!process.argv[2]) throw new Error('new-evidence-directory-required')
const output = resolve(process.argv[2])
if (existsSync(output)) throw new Error('use-new-evidence-directory')
mkdirSync(output, { recursive: true })
const source = join(output, 'fixed-source')
mkdirSync(source)
for (const key of RELEASE_KEYS) {
  const directory = RELEASE_PACKAGES[key].slice('@local/dsh-'.length)
  cpSync(join(root, directory), join(source, directory), { recursive: true,
    filter: (path) => !path.split(sep).some((part) => ['node_modules', 'test', 'scripts', '.git'].includes(part)) })
}
writeFileSync(join(source, '.gitattributes'), '* text=auto eol=lf\n')
const git = (args) => execFileSync('git', args, { cwd: source, encoding: 'utf8', windowsHide: true }).trim()
git(['init', '-q', '--initial-branch=fixture'])
git(['add', '.'])
git(['-c', 'user.name=Guide release evidence', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'Local fixed-commit fixture; not pushed'])
const commit = git(['rev-parse', 'HEAD'])
const bundle = prepareRemoteRelease({ repositoryRoot: source, commit, repository: { owner: 'PreLuna', repo: 'dsh-guide-mode' },
  tag: 'guide-fixture-20261108', channel: 'prerelease', output: join(output, 'bundle') })
verifyReleaseBundle(bundle.directory, { repositoryRoot: source })
const dev = prepareRemoteRelease({ development: true, sourceRoot: source, repository: bundle.plan.repository,
  tag: 'development-fixture-20261108', output: join(output, 'development') })
writeJson(join(output, 'result.json'), { status: 'passed', fixtureCommit: true, commit, rootGitHistoryModified: false, remoteWrites: 0,
  productionFormat: bundle.plan.publishable, developmentPublishable: dev.plan.publishable,
  artifacts: bundle.catalog.artifacts.map(({ key, version, sha256, bytes }) => ({ key, version, sha256, bytes })),
  uploadAssets: bundle.plan.assets.length, catalogSha256: digest(readFileSync(join(bundle.directory, 'guide-release.json'))) })
console.log(JSON.stringify({ status: 'passed', output, fixtureCommit: commit, packages: 7, uploadAssets: bundle.plan.assets.length, remoteWrites: 0 }))

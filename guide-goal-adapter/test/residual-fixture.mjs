import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

/** Fixtures for remaining pane/Git/timer checks, never mounted in desktop. */
export function createResidualFixture(ctx, { rootAgent, child, until, controller }) {
  let scene
  let parent
  const workers = []
  const holds = new Map()
  const git = (...args) => execFileSync('git', ['-c', 'commit.gpgsign=false', '-C', scene.cwd, ...args],
    { encoding: 'utf8', windowsHide: true, timeout: 15_000 })
  const snapshot = () => scene ? { ...scene, workers: workers.map(row => row.childId),
    guideStatus: { dual: ctx.agents.get(scene.dual)?.status ?? 'unloaded', other: ctx.agents.get(scene.other)?.status ?? 'unloaded' },
    admission: ctx.get('guideAdmission').state({ sessionId: parent.id }),
    gitHead: git('log', '-1', '--format=%H%n%s'), gitStatus: git('status', '--porcelain'),
    disk: readFileSync(join(scene.cwd, 'notes.txt'), 'utf8') } : { status: 'idle' }

  function stream(options) {
    const latest = [...options.messages].reverse().find(message => message.role === 'user'
      && message.content?.some(block => block.type === 'text' && /LI_RESIDUAL_WORK ([a-f0-9-]+)/.test(block.text)))
    const text = latest?.content?.filter(block => block.type === 'text').map(block => block.text).join('\n') ?? ''
    const token = /LI_RESIDUAL_WORK ([a-f0-9-]+)/.exec(text)?.[1]
    const gate = holds.get(token)
    if (!gate) return undefined
    return (async function* () {
      await Promise.race([gate.promise, new Promise((_, reject) => {
        if (options.signal?.aborted) return reject(options.signal.reason)
        options.signal?.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })])
      yield { type: 'text-delta', index: 0, text: 'Residual test worker complete.' }
      yield { type: 'finish', reason: { kind: 'stop' } }
    })()
  }

  async function addGuide(label) {
    const receipt = await child(parent, 'guide-fork', label, { cwd: scene.cwd, prompt: `Residual fixed guide ${label}` })
    await receipt.result
    await until(() => !ctx.subagents.manager.resident.has(receipt.childId), 'residual guide settled')
    return receipt.childId
  }

  async function setup() {
    if (scene) return snapshot()
    const cwd = mkdtempSync(join(tmpdir(), 'dsh-residual-'))
    scene = { status: 'starting', cwd }
    git('init')
    git('config', 'user.name', 'Isolated validation')
    git('config', 'user.email', 'validation@example.invalid')
    git('config', 'core.hooksPath', join(cwd, 'no-hooks'))
    writeFileSync(join(cwd, 'notes.txt'), 'original disk line\n')
    git('add', 'notes.txt'); git('commit', '-m', 'Isolated baseline')
    scene.baseHead = git('rev-parse', 'HEAD').trim()
    parent = (await rootAgent({ workspaceCwd: cwd })).agent
    scene.parent = parent.id
    scene.dual = await addGuide('residual-dual')
    scene.other = await addGuide('residual-other')
    scene.status = 'ready'
    return snapshot()
  }

  async function pressure(count) {
    await setup()
    for (const row of workers.splice(0)) {
      holds.get(row.token)?.resolve()
      await row.receipt.result
      holds.delete(row.token)
    }
    const idleGuide = await addGuide(`residual-idle-${count}`)
    for (let index = 0; index < count; index++) {
      const token = randomUUID()
      holds.set(token, Promise.withResolvers())
      const receipt = await child(parent, 'spawn', `residual-worker-${index}`, { cwd: scene.cwd,
        prompt: `LI_RESIDUAL_WORK ${token}` })
      receipt.result.catch(() => {})
      workers.push({ token, childId: receipt.childId, receipt })
    }
    await until(() => ctx.get('guideAdmission').state({ sessionId: parent.id }).used === count,
      'residual requested pool pressure', 10_000)
    return { ...snapshot(), idleGuide }
  }

  async function cleanup() {
    if (!scene) return { status: 'idle' }
    for (const row of workers.splice(0)) holds.get(row.token)?.resolve()
    for (const gate of holds.values()) gate.resolve()
    await until(() => ctx.get('guideAdmission').state({ sessionId: parent.id }).used === 0,
      'residual worker cleanup', 15_000)
    return snapshot()
  }
  return { stream, setup, pressure, snapshot, cleanup }
}

window.__ModuleLoader__.load({
  id: '@local/dsh-guide-sidebar-adapter',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { tearDownEntryFiber } = require('@deepseek-ai/dsh-client-modules')
    /** Own code only. The build embeds this file into the client factory. */
function createTaskRegistry() {
  const filters = new Set(), sections = new Map(), listeners = new Set()
  let revision = 0
  const notify = () => { revision++; for (const listener of [...listeners]) { try { listener() } catch {} } }
  return {
    version: 1,
    getSnapshot: () => revision,
    touch: notify,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    registerTaskFilter(filter) {
      if (typeof filter !== 'function') throw new TypeError('Task filter must be a function')
      filters.add(filter); notify()
      return () => { if (filters.delete(filter)) notify() }
    },
    registerTaskSection(section) {
      if (!section?.id || typeof section.component !== 'function') throw new TypeError('Task section requires id and component')
      if (sections.has(section.id)) throw new Error(`Task section already registered: ${section.id}`)
      sections.set(section.id, section); notify()
      return () => { if (sections.get(section.id) === section) { sections.delete(section.id); notify() } }
    },
    getTaskSections: () => [...sections.values()].sort((a, b) => (a.order ?? 100) - (b.order ?? 100)),
    hidden(entry, summary) {
      for (const filter of filters) { try { if (filter(entry, summary) === true) return true } catch {} }
      return false
    },
    clear() { filters.clear(); sections.clear(); notify(); listeners.clear() },
  }
}

/** Filter enumerable task rows, preserving direct session lookup for files/sidechat. */
function taskSnapshot(source, registry) {
  if (!source?.byId) return source
  const hidden = new Set()
  const summaries = source.byId
  const projections = source.projectionsBySession ?? {}
  for (const summary of Object.values(summaries)) if (registry.hidden(undefined, summary)) hidden.add(summary.id)
  for (const snapshot of Object.values(projections)) {
    for (const entry of snapshot?.values?.subagentCatalog ?? []) if (registry.hidden(entry, summaries[entry.id])) hidden.add(entry.id)
  }
  // Hide the whole guidance branch from topology enumeration, not only its root.
  for (const summary of Object.values(summaries)) {
    const visited = new Set()
    let current = summary
    while (current?.parentId && !visited.has(current.id)) {
      if (hidden.has(current.parentId)) { hidden.add(summary.id); break }
      visited.add(current.id); current = summaries[current.parentId]
    }
  }
  if (hidden.size === 0) return source
  // Host snapshots can be frozen. Proxying a configurable mirror avoids
  // ownKeys invariants while direct indexing still resolves every real session.
  const mirror = { ...summaries }
  const byId = new Proxy(mirror, {
    ownKeys: target => Reflect.ownKeys(target).filter(id => !hidden.has(id)),
    set() { throw new Error('Task snapshot is read-only') },
    deleteProperty() { throw new Error('Task snapshot is read-only') },
    defineProperty() { throw new Error('Task snapshot is read-only') },
  })
  const projectionsBySession = { ...projections }
  for (const [id, snapshot] of Object.entries(projections)) {
    const catalog = snapshot?.values?.subagentCatalog
    if (!Array.isArray(catalog)) continue
    const filtered = catalog.filter(entry => !hidden.has(entry.id))
    if (filtered.length !== catalog.length) projectionsBySession[id] = { ...snapshot, values: { ...snapshot.values, subagentCatalog: filtered } }
  }
  return { ...source, byId, projectionsBySession }
}

function createTaskListView(list, registry) {
  let previous, revision = -1, snapshot
  return {
    getSnapshot() {
      const current = list.getSnapshot(), nextRevision = registry.getSnapshot()
      if (current !== previous || revision !== nextRevision) {
        previous = current; revision = nextRevision; snapshot = taskSnapshot(current, registry)
      }
      return snapshot
    },
    subscribe(listener) {
      const offList = list.subscribe(listener), offRegistry = registry.subscribe(listener)
      return () => { offList(); offRegistry() }
    },
  }
}

function sessionFacade(sessions, registry) {
  const list = createTaskListView(sessions.list, registry)
  const methods = new Map()
  return new Proxy({}, { get(_target, property) {
    if (property === 'list') return list
    const value = sessions[property]
    if (typeof value !== 'function') return value
    if (!methods.has(property)) methods.set(property, value.bind(sessions))
    return methods.get(property)
  }, set() { throw new Error('Session facade is read-only') } })
}

    const WRAPPER = Symbol.for('dsh-guide-sidebar-adapter.wrapper')

    class SectionBoundary extends React.Component {
      state = { failed: false }
      static getDerivedStateFromError() { return { failed: true } }
      componentDidCatch(error) { console.warn('[guide-sidebar-adapter] section failed', error) }
      render() { return this.state.failed ? null : this.props.children }
    }
    function GuidanceSections({ registry, props, rawContext }) {
      React.useSyncExternalStore(registry.subscribe, registry.getSnapshot)
      const sections = registry.getTaskSections()
      if (!sections.length) return null
      return h('div', {
        'data-guide-task-sections': '',
        style: { flex: '0 1 auto', minHeight: 0, maxHeight: '42%', overflow: 'auto', borderTop: '1px solid var(--dsw-alias-hairline)', padding: 8 },
      }, sections.map(section => h(SectionBoundary, { key: section.id }, h('section', { 'data-task-section': section.id },
        h('div', { style: { fontSize: 12, fontWeight: 600, color: 'var(--dsw-alias-label-secondary)', paddingBottom: 6 } },
          typeof section.title === 'function' ? section.title() : section.title),
        h(section.component, { ...props, ctx: rawContext }),
      ))))
    }
    function decorateTaskDescriptor(service, registry, rawContext) {
      const descriptor = service.getTab('subagent')
      if (!descriptor || descriptor.component?.[WRAPPER]) return () => {}
      const original = descriptor.component
      function TasksWithGuidance(props) {
        return h('div', { 'data-guide-tasks-adapter': '', style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
          h('div', { style: { display: 'flex', flexDirection: 'column', flex: '1 1 0%', minHeight: 96, overflow: 'hidden' } }, h(original, props)),
          h(GuidanceSections, { registry, props, rawContext }),
        )
      }
      TasksWithGuidance[WRAPPER] = true
      descriptor.component = TasksWithGuidance
      return () => { if (descriptor.component === TasksWithGuidance) descriptor.component = original }
    }

    return {
      inject: ['modules', 'sessions'],
      async apply(ctx) {
        const registry = createTaskRegistry()
        let mode = 'loading', reason = null
        const status = { ...registry, getState: () => ({ mode, reason }) }
        ctx.provide('guideSidebarAdapter', status)
        if (typeof tearDownEntryFiber !== 'function' || typeof ctx.modules.entries?.state?.subscribe !== 'function') {
          mode = 'native'; reason = 'unsupported-client-runtime'; registry.touch(); return
        }
        let stopping = false
        let queue = Promise.resolve()
        let installed
        const loader = ctx.get('loader')
        const findEntry = () => [...loader.entries()].find(entry => entry.options.name === 'dsh-better-sidebar' && !entry.disabled)
        async function restart(entry) {
          if (!entry) return
          await tearDownEntryFiber(entry)
          await entry.refresh()
          await entry.fiber?.await()
        }
        async function install() {
          if (stopping) return
          const original = await ctx.modules.import('dsh-better-sidebar')
          if (original.apply?.[WRAPPER] === registry) return
          if (original.apply?.[WRAPPER]) throw new Error('Another sidebar adapter already owns this module')
          const response = await fetch(new URL('./guide-sidebar/api/state', document.baseURI))
          const state = await response.json()
          if (!response.ok || state.value?.supported !== true) {
            mode = 'native'; reason = state.value?.reason ?? 'compatibility-check-failed'; registry.touch()
            return
          }
          if (typeof original.apply !== 'function') throw new Error('Original sidebar apply export is unavailable')
          const previous = original.apply
          function wrapped(owner) {
            const scoped = owner.isolate('sessions')
            scoped.provide('sessions', sessionFacade(owner.sessions, registry))
            // Task sections get the unfiltered services; the original sidebar
            // alone receives the task-enumeration view.
            const result = previous(scoped)
            const service = owner.get('betterSidebar', false)
            if (!service) throw new Error('Original sidebar did not publish its registry')
            const off = decorateTaskDescriptor(service, registry, owner)
            owner.effect(() => off, 'guide-sidebar-adapter: task component')
            return result
          }
          wrapped[WRAPPER] = registry
          if (!Reflect.set(original, 'apply', wrapped)) throw new Error('Sidebar module exports are immutable')
          installed = { original, previous, wrapped }
          await restart(findEntry())
          mode = 'active'; reason = null; registry.touch()
        }
        async function restore() {
          const current = installed
          if (current && current.original.apply === current.wrapped) {
            const entry = findEntry()
            const owned = entry?.moduleNamespace === current.original
            current.original.apply = current.previous
            if (owned && ctx.root.fiber.state === 2) await restart(entry)
          }
        }
        const enqueue = () => {
          if (stopping || ctx.modules.entries.state.getSnapshot().syncing) return
          queue = queue.then(install).catch(async error => {
            await restore()
            mode = 'native'; reason = String(error.message ?? error)
            registry.touch()
            console.warn('[guide-sidebar-adapter]', reason)
          })
        }
        ctx.effect(() => () => {
          stopping = true
          return queue.then(async () => {
            await restore()
            registry.clear()
          })
        }, 'guide-sidebar-adapter: restore original module')
        ctx.effect(() => ctx.modules.entries.state.subscribe(enqueue), 'guide-sidebar-adapter: module updates')
        enqueue()
        await queue
      },
    }
  },
})

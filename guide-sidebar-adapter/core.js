/** Own code only. The build embeds this file into the client factory. */
export function createTaskRegistry() {
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
export function taskSnapshot(source, registry) {
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

export function createTaskListView(list, registry) {
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

export function sessionFacade(sessions, registry) {
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

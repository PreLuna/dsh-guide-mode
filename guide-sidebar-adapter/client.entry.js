window.__ModuleLoader__.load({
  id: '@local/dsh-guide-sidebar-adapter',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { tearDownEntryFiber } = require('@deepseek-ai/dsh-client-modules')
    /* OWN_CORE */
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

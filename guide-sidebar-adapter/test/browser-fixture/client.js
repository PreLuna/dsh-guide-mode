window.__ModuleLoader__.load({
  id: '@local/dsh-guide-browser-fixture',
  factory() {
    return {
      inject: ['uiWorkspace', 'sessions', 'modules', 'sidebarRight'],
      apply(ctx) {
        window.__liFixture = { ctx }
        ctx.effect(() => () => { delete window.__liFixture })
      },
    }
  },
})

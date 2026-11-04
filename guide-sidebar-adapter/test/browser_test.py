"""Real stock-package UI test in an isolated Edge profile. Input URLs never logged."""
import asyncio
import json
import sys
import re
import traceback
from pathlib import Path
from datetime import datetime, timezone
from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
from pty_ui import run_pt6
from residual_ui import run_residual
from r5_extended import run_r5_extended


SURVEY_JS = """() => {
  const visible = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  const box = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } }
  const describe = el => ({
    tag: el.tagName.toLowerCase(),
    cls: typeof el.className === 'string' ? el.className : '',
    role: el.getAttribute('role'),
    data: Object.fromEntries([...el.attributes].filter(a => a.name.startsWith('data-')).map(a => [a.name, a.value])),
    rect: box(el),
  })
  const lists = [...document.querySelectorAll('[role="tablist"]')].filter(visible).map(list => ({
    ...describe(list),
    tabs: [...list.querySelectorAll('[role="tab"]')].filter(visible).map(tab => ({
      ...describe(tab), text: (tab.innerText || '').trim(), selected: tab.getAttribute('aria-selected'),
    })),
    ancestors: (() => { const out = []; let p = list.parentElement; for (let i = 0; i < 6 && p; i++, p = p.parentElement) out.push(describe(p)); return out })(),
  }))
  const paneish = [...document.querySelectorAll('[class*="pane" i], [data-pane], [data-pane-id], [data-dockkit-pane]')]
    .filter(visible).slice(0, 80).map(describe)
  const panels = [...document.querySelectorAll('[data-sidebar-right-panel]')].filter(visible).map(describe)
  const panes = [...document.querySelectorAll('[data-sidebar-right-panel] [data-dockkit-pane]')].filter(visible).map(pane => ({
    ...describe(pane),
    paneId: pane.getAttribute('data-dockkit-pane'),
    column: pane.getAttribute('data-dockkit-column'),
    content: pane.getAttribute('data-dockkit-content'),
    active: pane.getAttribute('data-dockkit-pane-active'),
    tabs: [...pane.querySelectorAll('[role="tab"]')].map(tab => ({
      id: tab.getAttribute('data-dockkit-tab'),
      text: (tab.innerText || '').trim(),
      selected: tab.getAttribute('aria-selected'),
      rect: box(tab),
    })),
  }))
  return {
    url: location.href, panels, lists, paneish, panes,
    tablistCount: lists.length,
    tabCount: lists.reduce((n, l) => n + l.tabs.length, 0),
  }
}"""


RIGHT_JS = """(id) => {
  const right = window.__liFixture.ctx.sidebarRight
  const safe = fn => { try { return fn() } catch (error) { return { error: String(error) } } }
  const pick = tab => tab === null || typeof tab !== 'object' ? tab : ({
    id: tab.id, kind: tab.kind, title: tab.title, contentId: tab.contentId,
    sessionId: tab.sessionId, path: tab.path, paneId: tab.paneId, pane: tab.pane,
  })
  const proto = Object.getPrototypeOf(right)
  return {
    mounted: safe(() => right.mounted?.getSnapshot?.()),
    ownKeys: safe(() => Object.keys(right)),
    protoMethods: safe(() => Object.getOwnPropertyNames(proto).filter(name => typeof right[name] === 'function')),
    tabsIn: safe(() => (right.tabsIn?.(id) ?? []).map(pick)),
    openTabs: safe(() => (right.openTabs?.getSnapshot?.() ?? []).map(pick)),
    adoptedKeys: safe(() => right.adopted ? [...right.adopted.keys()] : null),
    adoptedTabs: safe(() => right.adopted ? [...right.adopted.keys()].map(seat => ({
      seat, tabs: (right.tabsIn?.(seat) ?? []).map(pick),
    })) : null),
    tabsRegistry: safe(() => {
      const tabs = window.__liFixture.ctx.get('sidebarRightTabs')
      return tabs ? { keys: Object.keys(tabs), subagentchat: tabs.get?.('subagentchat') !== undefined, panel: tabs.get?.('guide-panel') !== undefined } : null
    }),
  }
}"""


def now():
    return datetime.now(timezone.utc).isoformat()


async def run_probe(page, config, output, errors):
    """Feasibility probe: can this Host actually hold two panes, and how are they observable?"""
    parent = config['parent']
    result = {'scenario': 'probe', 'parent': parent, 'startedAt': now(), 'steps': [], 'errors': [], 'consoleErrors': errors}

    async def capture(label, extra=None):
        item = {
            'label': label,
            'survey': await page.evaluate(SURVEY_JS),
            'right': await page.evaluate(RIGHT_JS, parent),
        }
        if extra:
            item.update(extra)
        result['steps'].append(item)
        return item

    async def guarded(label, coro):
        try:
            return await coro
        except Exception as error:  # noqa: BLE001 - the probe must record every failure
            result['errors'].append({'step': label, 'error': str(error)})
            return None

    await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
    result['tools'] = await page.evaluate("async () => (await fetch('./li-runtime/tools')).json()")
    result['modules'] = await page.evaluate("""() => {
      const ctx = window.__liFixture.ctx
      const out = { ctxKeys: Object.keys(ctx).slice(0, 80) }
      try { out.modulesKeys = Object.keys(ctx.modules ?? {}) } catch (error) { out.modulesError = String(error) }
      try {
        const snap = ctx.modules?.entries?.state?.getSnapshot?.()
        out.snapType = typeof snap
        out.snapKeys = snap && typeof snap === 'object' ? Object.keys(snap).slice(0, 30) : null
        out.snapText = JSON.stringify(snap).slice(0, 4000)
      } catch (error) { out.snapError = String(error) }
      return out
    }""")
    await capture('initial')
    await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
    await page.wait_for_timeout(700)
    await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:id})", parent)
    await guarded('task-page', page.locator('[data-guide-tasks-adapter]').wait_for(timeout=10000))
    await page.wait_for_timeout(300)
    await capture('after-task-page')
    await page.screenshot(path=str(output / 'probe-after-task.png'), full_page=True)

    guide = await guarded('add-guide', page.evaluate("async () => (await fetch('./li-runtime/add-guide', {method:'POST'})).json()"))
    if isinstance(guide, dict) and isinstance(guide.get('childId'), str):
        await guarded('guide-session', page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=guide['childId']))
        await capture('after-add-guide', {'guide': guide})

        async def open_guide(child):
            opened = await page.evaluate("""({ parent, child }) => {
              const right = window.__liFixture.ctx.sidebarRight
              const address = `dsh-resource://subagentchat/session/${encodeURIComponent(child)}?parent=${encodeURIComponent(parent)}&mode=continuable`
              try { right.openResource(address, { kind: 'subagentchat', preferNewPane: true }); return { ok: true, address } }
              catch (error) { return { ok: false, error: String(error), address } }
            }""", {'parent': parent, 'child': child})
            await page.wait_for_timeout(1500)
            return opened

        opened = await guarded('open-guide', open_guide(guide['childId']))
        await capture('after-open-guide', {'open': opened})
        await page.screenshot(path=str(output / 'probe-after-guide.png'), full_page=True)

        opened_again = await guarded('open-guide-again', open_guide(guide['childId']))
        await capture('after-open-guide-again', {'open': opened_again})

        second = await guarded('add-second-guide', page.evaluate("async () => (await fetch('./li-runtime/add-guide', {method:'POST'})).json()"))
        if isinstance(second, dict) and isinstance(second.get('childId'), str):
            await guarded('second-session', page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=second['childId']))
            opened_second = await guarded('open-second-guide', open_guide(second['childId']))
            await capture('after-open-second-guide', {'guide': second, 'open': opened_second})
            await page.screenshot(path=str(output / 'probe-after-second.png'), full_page=True)

        panel = await page.evaluate("""() => {
          const right = window.__liFixture.ctx.sidebarRight
          try { right.openTab('guide-panel', { preferNewPane: true }); return { ok: true } }
          catch (error) { return { ok: false, error: String(error) } }
        }""")
        await page.wait_for_timeout(1200)
        await capture('after-panel-prefer-new-pane', {'open': panel})

        forced = await page.evaluate("""({ parent, child }) => {
          const right = window.__liFixture.ctx.sidebarRight
          const address = `dsh-resource://subagentchat/session/${encodeURIComponent(child)}?parent=${encodeURIComponent(parent)}&mode=continuable`
          try { right.openResource(address, { kind: 'subagentchat', preferNewPane: true, revealIfOpened: false }); return { ok: true } }
          catch (error) { return { ok: false, error: String(error) } }
        }""", {'parent': parent, 'child': guide['childId']})
        await page.wait_for_timeout(1200)
        await capture('after-force-second-instance', {'open': forced})

        cross = await page.evaluate("""({ parent, child }) => {
          const ctx = window.__liFixture.ctx
          const address = `dsh-resource://subagentchat/session/${encodeURIComponent(child)}?parent=${encodeURIComponent(parent)}&mode=continuable`
          try {
            ctx.uiWorkspace.openSession(child)
            ctx.sidebarRight.openResourceIn?.(child, address, { kind: 'subagentchat', preferNewPane: true })
            return { ok: true }
          } catch (error) { return { ok: false, error: String(error) } }
        }""", {'parent': parent, 'child': guide['childId']})
        await page.wait_for_timeout(1500)
        await capture('child-seat-open', {'cross': cross})
        await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
        await page.wait_for_timeout(1000)
        await capture('back-in-parent-seat', {'cross': cross})

    result['finishedAt'] = now()
    result['status'] = 'completed' if not result['errors'] else 'completed-with-errors'
    (output / 'probe-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': result['status'], 'steps': [step['label'] for step in result['steps']],
                      'errors': result['errors'], 'consoleErrors': len(errors)}, ensure_ascii=False))


MODULE_ACCESS_JS = """() => {
  const m = window.__liFixture.ctx.modules
  const describe = value => {
    if (value instanceof Map) return { type: 'Map', size: value.size, keys: [...value.keys()].slice(0, 40).map(String) }
    if (value && typeof value === 'object') return { type: 'object', keys: Object.keys(value).slice(0, 40) }
    return { type: typeof value }
  }
  return { loadCache: describe(m?.loadCache), factories: describe(m?.factories), entries: describe(m?.entries) }
}"""


GUARD_JS = """({ parent, child }) => {
  const ctx = window.__liFixture.ctx
  const m = ctx.modules
  const inspect = value => {
    if (value === null || typeof value !== 'object') return null
    for (const candidate of [value.__internals, value.exports?.__internals, value.module?.__internals, value.default?.__internals]) {
      if (candidate && typeof candidate.threadOpen === 'function') return candidate
    }
    return null
  }
  const fromMap = map => {
    if (!(map instanceof Map)) return null
    for (const [key, value] of map) {
      if (!String(key).includes('guide-panel')) continue
      const found = inspect(value)
      if (found) return found
    }
    return null
  }
  const fromObject = object => {
    if (!object || typeof object !== 'object') return null
    for (const [key, value] of Object.entries(object)) {
      if (!String(key).includes('guide-panel')) continue
      const found = inspect(value)
      if (found) return found
    }
    return null
  }
  const internals = fromMap(m?.loadCache) ?? fromObject(m?.loadCache) ?? fromMap(m?.factories) ?? fromObject(m?.factories)
  if (!internals) return { available: false }
  try {
    return { available: true, open: internals.threadOpen(ctx.sidebarRight, parent, child, ctx.uiWorkspace) }
  } catch (error) {
    return { available: true, error: String(error) }
  }
}"""


async def run_multi_pane(page, config, output, errors):
    """A1: the multi-pane browser matrix from docs/O11-VALIDATION-PLAN.md §3.2."""
    parent = config['parent']
    result = {
        'status': 'failed', 'scenario': 'multi-pane', 'sourceVersions': {}, 'startedAt': now(),
        'finishedAt': None, 'assertions': [], 'errors': [], 'knownDiagnostics': [],
        'consoleErrors': errors, 'evidence': [], 'steps': [],
        'items': {f'MP-{index}': {'status': 'blocked', 'assertions': [], 'evidence': []} for index in range(1, 8)},
    }
    result['items']['MP-2']['limitations'] = []
    result['items']['MP-6']['limitations'] = []

    def item(key):
        return result['items'][key]

    def check(key, label, ok, detail=None):
        entry = {'label': label, 'ok': bool(ok)}
        if detail is not None:
            entry['detail'] = detail
        item(key)['assertions'].append(entry)
        result['assertions'].append({'item': key, 'label': label, 'ok': bool(ok)})
        if ok:
            if item(key)['status'] == 'blocked':
                item(key)['status'] = 'passed'
        else:
            item(key)['status'] = 'failed'
        return bool(ok)

    def block(key, reason):
        item(key)['status'] = 'blocked'
        item(key)['blockedReason'] = reason

    async def survey():
        return await page.evaluate(SURVEY_JS)

    async def right(seat=None):
        return await page.evaluate(RIGHT_JS, seat or parent)

    async def capture(label):
        entry = {'label': label, 'survey': await survey(), 'right': await right()}
        result['steps'].append(entry)
        return entry

    def visible_panes(snapshot):
        return [pane for pane in snapshot.get('panes', []) if pane['rect']['w'] > 0 and pane['rect']['h'] > 0]

    def content_of(snapshot, tab_id):
        for tab in snapshot.get('tabsIn', []):
            if tab.get('id') == tab_id:
                return tab.get('contentId') or ''
        return ''

    def tabs_for_child(snapshot, child):
        return [tab for tab in snapshot.get('tabsIn', []) if child in (tab.get('contentId') or '')]

    async def open_chat(child, prefer_new=True, reveal=True):
        opened = await page.evaluate("""({ parent, child, preferNew, reveal }) => {
          const right = window.__liFixture.ctx.sidebarRight
          const address = `dsh-resource://subagentchat/session/${encodeURIComponent(child)}?parent=${encodeURIComponent(parent)}&mode=continuable`
          try {
            right.openResource(address, { kind: 'subagentchat', preferNewPane: preferNew, revealIfOpened: reveal })
            return { ok: true, address }
          } catch (error) {
            return { ok: false, error: String(error), address }
          }
        }""", {'parent': parent, 'child': child, 'preferNew': prefer_new, 'reveal': reveal})
        await page.wait_for_timeout(1200)
        return opened

    async def add_guide():
        data = await page.evaluate("async () => (await fetch('./li-runtime/add-guide', {method:'POST'})).json()")
        child = data.get('childId') if isinstance(data, dict) else None
        if not isinstance(child, str) or child == '':
            raise RuntimeError(f'add-guide returned no childId: {data}')
        await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=child)
        return child

    async def focus_tab(tab_id):
        await page.locator(f'[data-dockkit-tab="{tab_id}"]').first.click()
        await page.wait_for_timeout(350)

    async def close_tab(tab_id):
        await page.evaluate('(id) => window.__liFixture.ctx.sidebarRight.close(id)', tab_id)
        await page.wait_for_timeout(450)

    async def archived_ids():
        return await page.evaluate("() => window.__liFixture.ctx.get('workspaces').list.getSnapshot().archivedSessionIds ?? []")

    try:
        await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
        result['sourceVersions'] = await page.evaluate("""() => ({
          origin: location.origin,
          userAgent: navigator.userAgent,
          adapter: window.__liFixture.ctx.get('guideSidebarAdapter')?.getState?.(),
        })""")
        result['moduleAccess'] = await page.evaluate(MODULE_ACCESS_JS)

        await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
        await page.wait_for_timeout(700)
        await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:id})", parent)
        await page.locator('[data-guide-tasks-adapter]').wait_for(timeout=10000)
        await page.wait_for_timeout(350)

        guide_a = await add_guide()
        guide_b = await add_guide()
        result['guides'] = {'a': guide_a, 'b': guide_b}
        result['children'] = await page.evaluate("""(id) => {
          const list = window.__liFixture.ctx.sessions.list.getSnapshot()
          const catalog = list.projectionsBySession?.[id]?.values?.subagentCatalog ?? []
          return catalog.map(row => ({ id: row.id, label: row.label, createdAt: row.createdAt }))
        }""", parent)
        await capture('startup')

        # ── MP-1: two panes render independently ─────────────────────────
        opened = await open_chat(guide_a, prefer_new=True)
        check('MP-1', 'opening guide-a with preferNewPane succeeds', opened.get('ok') is True, opened)
        snapshot = await survey()
        inventory = await right()
        panes = visible_panes(snapshot)
        check('MP-1', 'exactly two visible right-sidebar panes', len(panes) == 2,
              [{'paneId': pane['paneId'], 'column': pane['column'], 'w': pane['rect']['w']} for pane in panes])
        task_pane = next((pane for pane in panes if any(tab['text'] == 'Tasks' for tab in pane['tabs'])), None)
        guide_pane = next((pane for pane in panes
                           if any(guide_a in content_of(inventory, tab['id']) for tab in pane['tabs'])), None)
        check('MP-1', 'the task page has its own pane', task_pane is not None,
              task_pane['paneId'] if task_pane else None)
        check('MP-1', 'guide-a has a different pane', guide_pane is not None and task_pane is not None
              and guide_pane['paneId'] != task_pane['paneId'],
              {'task': task_pane['paneId'] if task_pane else None, 'guide': guide_pane['paneId'] if guide_pane else None})
        check('MP-1', 'both panes have usable geometry', len(panes) == 2
              and all(pane['rect']['w'] > 100 and pane['rect']['h'] > 100 for pane in panes),
              [pane['rect'] for pane in panes])
        dom_ids = [tab['id'] for pane in panes for tab in pane['tabs']]
        api_ids = [tab['id'] for tab in inventory.get('tabsIn', [])]
        check('MP-1', 'tabsIn(seat) agrees with the pane headers', sorted(dom_ids) == sorted(api_ids),
              {'dom': dom_ids, 'api': api_ids})
        check('MP-1', 'no duplicate tab ids', len(dom_ids) == len(set(dom_ids)), dom_ids)
        check('MP-1', 'exactly one visible task section is rendered',
              await page.locator('[data-sidebar-right-panel]:visible [data-guide-tasks-adapter]').count() == 1)
        await capture('mp1-two-panes')
        await page.screenshot(path=str(output / 'pane-1.png'), full_page=True)
        result['evidence'].append('pane-1.png')

        # ── MP-2: close isolation and same-child multiplicity ───────────
        opened_b = await open_chat(guide_b, prefer_new=True)
        inventory = await right()
        btab = next((tab['id'] for tab in tabs_for_child(inventory, guide_b)), None)
        check('MP-2', 'guide-b opens beside guide-a', btab is not None,
              {'open': opened_b, 'tab': btab})
        if btab is not None:
            await close_tab(btab)
            inventory = await right()
            check('MP-2', 'closing guide-b leaves guide-a usable',
                  len(tabs_for_child(inventory, guide_a)) >= 1)
            check('MP-2', 'closing guide-b leaves the task pane intact',
                  'Tasks' in [tab['text'] for pane in visible_panes(await survey()) for tab in pane['tabs']])

        forced = await open_chat(guide_a, prefer_new=True, reveal=False)
        inventory = await right()
        duplicates = [tab['id'] for tab in tabs_for_child(inventory, guide_a)]
        check('MP-2', 'revealIfOpened:false adds a second guide-a tab', len(duplicates) >= 2,
              {'open': forced, 'tabs': duplicates})
        if len(duplicates) >= 2:
            await close_tab(duplicates[0])
            inventory = await right()
            check('MP-2', 'closing one guide-a instance leaves the other usable',
                  len(tabs_for_child(inventory, guide_a)) >= 1)
            for tab_id in [tab['id'] for tab in tabs_for_child(inventory, guide_a)][1:]:
                await close_tab(tab_id)

        # Best effort: put the same child in both panes by focusing the task pane first.
        inventory = await right()
        task_tab = next((tab['id'] for tab in inventory.get('tabsIn', [])
                         if tab.get('kind') == 'subagent' and tab.get('id')), None)
        if task_tab is not None:
            await focus_tab(task_tab)
            await open_chat(guide_a, prefer_new=True, reveal=False)
            snapshot = await survey()
            inventory = await right()
            panes_with_child = [pane['paneId'] for pane in visible_panes(snapshot)
                                if any(guide_a in content_of(inventory, tab['id']) for tab in pane['tabs'])]
            item('MP-2')['sameChildTwoPanes'] = len(set(panes_with_child)) >= 2
            item('MP-2')['paneIdsWithChild'] = panes_with_child
            if len(set(panes_with_child)) < 2:
                item('MP-2')['limitations'].append(
                    'the host keeps one guide-a tab per pane/seat; a forced duplicate landed in the active pane')
            # Keep exactly one guide-a tab for the archive scene.
            inventory = await right()
            for tab_id in [tab['id'] for tab in tabs_for_child(inventory, guide_a)][1:]:
                await close_tab(tab_id)
        await capture('mp2-close-isolation')
        await page.screenshot(path=str(output / 'pane-2.png'), full_page=True)
        result['evidence'].append('pane-2.png')

        # ── MP-4: Q7 C grouping on a child session's task page ─────────
        mp4_failed = False
        try:
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', guide_b)
            await page.wait_for_timeout(800)
            switched = await page.evaluate("""() => {
              try { window.__liFixture.ctx.sidebarRight.openTab('subagent'); return { ok: true } }
              catch (error) { return { ok: false, error: String(error) } }
            }""")
            child_section = page.locator('[data-sidebar-right-panel]:visible [data-guide-tasks-adapter]')
            await child_section.wait_for(timeout=10000)
            await page.wait_for_timeout(450)
            text = await child_section.inner_text()
            check('MP-4', 'opening the child session task page succeeds', switched.get('ok') is True, switched)
            check('MP-4', 'the child task page shows the root guidance group',
                  any(label in text for label in ('根会话指导', '根会话其他指导',
                                                  'Guidance under the root session',
                                                  'Other guidance under the root session')), text[:1200])
            check('MP-4', 'the root group has actionable rows',
                  await child_section.locator('button').count() >= 1,
                  await child_section.locator('button').count())
            check('MP-4', 'the child task page renders exactly one guide section',
                  await child_section.count() == 1)
            await page.screenshot(path=str(output / 'mp4-child-task.png'), full_page=True)
            result['evidence'].append('mp4-child-task.png')
        except Exception as error:
            mp4_failed = True
            result['errors'].append({'step': 'MP-4', 'error': str(error)})
            block('MP-4', str(error))
        finally:
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
            await page.wait_for_timeout(800)
            inventory = await right()
            if not mp4_failed:
                check('MP-4', 'the parent seat keeps its tabs after returning',
                      'Tasks' in [tab['text'] for pane in visible_panes(await survey()) for tab in pane['tabs']]
                      and len(tabs_for_child(inventory, guide_a)) >= 1)

        # ── MP-3: manual archive while another pane is open ─────────────
        await open_chat(guide_b, prefer_new=True)
        await page.evaluate("() => window.__liFixture.ctx.sidebarRight.openTab('guide-panel', { preferNewPane: true })")
        pre_archive_panes = visible_panes(await survey())
        item('MP-3')['panesBeforeArchive'] = [pane['paneId'] for pane in pre_archive_panes]
        if len(pre_archive_panes) < 2:
            item('MP-3')['limitations'] = ['could not establish two panes before the archive action']
        await capture('mp3-before-archive')
        panel = page.locator('[data-sidebar-right-panel]:visible').first
        try:
            await panel.get_by_role('button', name=re.compile('归档|Archive')).first.wait_for(timeout=8000)
        except Exception:
            pass
        buttons = panel.get_by_role('button', name=re.compile('归档|Archive'))
        button_count = await buttons.count()
        item('MP-3')['archiveButtonCount'] = button_count
        before_archived = await archived_ids()
        item('MP-3')['archivedBefore'] = before_archived
        if button_count > 0:
            guide_rows = [row for row in result.get('children', [])
                          if isinstance(row.get('label'), str) and row['label'].startswith('指导: ')]
            guide_rows.sort(key=lambda row: row.get('createdAt') or 0, reverse=True)
            ordered_ids = [row.get('id') for row in guide_rows]
            target_index = ordered_ids.index(guide_a) if guide_a in ordered_ids else button_count - 1
            item('MP-3')['rowOrder'] = ordered_ids
            item('MP-3')['targetIndex'] = target_index
            await buttons.nth(target_index).click()
            for _ in range(20):
                await page.wait_for_timeout(250)
                archived_now = await archived_ids()
                if any(child in archived_now for child in (guide_a, guide_b)):
                    break
            after_archived = await archived_ids()
            archived_child = next((child for child in (guide_a, guide_b) if child in after_archived), None)
            check('MP-3', 'a guide was archived', archived_child is not None,
                  {'archived': after_archived, 'buttons': button_count})
            check('MP-3', 'the intended guide (guide-a) was the archived target',
                  archived_child == guide_a, {'archivedChild': archived_child, 'a': guide_a, 'b': guide_b})
            inventory = await right()
            check('MP-3', 'the archived guide has no chat tab left',
                  len(tabs_for_child(inventory, guide_a)) == 0,
                  [tab['id'] for tab in tabs_for_child(inventory, guide_a)])
            check('MP-3', 'the other guide tab is untouched',
                  len(tabs_for_child(inventory, guide_b)) >= 1,
                  [tab['id'] for tab in tabs_for_child(inventory, guide_b)])
            check('MP-3', 'the task pane still renders',
                  'Tasks' in [tab['text'] for pane in visible_panes(await survey()) for tab in pane['tabs']])
            after_panes = visible_panes(await survey())
            item('MP-3')['panesAfterArchive'] = [pane['paneId'] for pane in after_panes]
            check('MP-3', 'the other guide and task tabs remain in the inventory',
                  len(tabs_for_child(inventory, guide_b)) >= 1
                  and any(tab.get('kind') == 'subagent' for tab in inventory.get('tabsIn', [])))
            await capture('mp3-after-archive')
            await page.screenshot(path=str(output / 'mp3-after-archive.png'), full_page=True)
            result['evidence'].append('mp3-after-archive.png')
        else:
            check('MP-3', 'the panel exposes an archive action', False, 'no 归档 button found')
            block('MP-3', 'panel archive action was not found')
        if len(pre_archive_panes) < 2:
            block('MP-3', 'could not establish two panes before the archive action')

        # ── MP-5: adapter remount and page reload ───────────────────────
        refresh_panes = visible_panes(await survey())
        if len(refresh_panes) < 2:
            await open_chat(guide_a, prefer_new=True, reveal=False)
            await page.wait_for_timeout(900)
            refresh_panes = visible_panes(await survey())
        item('MP-5')['panesBeforeRefresh'] = [pane['paneId'] for pane in refresh_panes]
        await capture('mp5-before-refresh')
        try:
            remount = await page.evaluate("""async () => {
              const entry = [...window.__liFixture.ctx.get('loader').entries()]
                .find(e => e.options.name === '@local/dsh-guide-sidebar-adapter')
              await entry.update({disabled: true}); await entry.fiber?.await()
              const gone = !window.__liFixture.ctx.get('guideSidebarAdapter')
              await entry.update({disabled: false}); await entry.fiber?.await()
              return { gone }
            }""")
            await page.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter')?.getState().mode === 'active'")
            inventory = await right()
            remount_panes = visible_panes(await survey())
            item('MP-5')['remountInventory'] = inventory.get('tabsIn', [])
            item('MP-5')['panesAfterRemount'] = [pane['paneId'] for pane in remount_panes]
            check('MP-5', 'adapter remount removes and restores the adapter', remount.get('gone') is True, remount)
            check('MP-5', 'adapter remount keeps the tab inventory',
                  len(tabs_for_child(inventory, guide_b)) >= 1
                  and any(tab.get('kind') == 'subagent' for tab in inventory.get('tabsIn', [])))
            check('MP-5', 'adapter remount keeps the two-pane layout',
                  len(remount_panes) >= len(refresh_panes),
                  {'before': [pane['paneId'] for pane in refresh_panes],
                   'after': [pane['paneId'] for pane in remount_panes]})
            check('MP-5', 'adapter remount leaves one visible guide section',
                  await page.locator('[data-sidebar-right-panel]:visible [data-guide-tasks-adapter]').count() == 1)
            await capture('mp5-remount')
        except Exception as error:
            result['errors'].append({'step': 'MP-5-remount', 'error': str(error)})
            check('MP-5', 'adapter remount completed', False, str(error))

        try:
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function('window.__liFixture !== undefined', timeout=25000)
            await page.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter')?.getState().mode === 'active'", timeout=15000)
            await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
            await page.wait_for_timeout(1000)
            snapshot = await survey()
            inventory = await right()
            restored_tasks = any(tab.get('kind') == 'subagent' for tab in inventory.get('tabsIn', []))
            restored_guide = len(tabs_for_child(inventory, guide_b)) >= 1
            item('MP-5')['reloadInventory'] = {
                'panes': len(visible_panes(snapshot)),
                'tabs': [{'id': tab.get('id'), 'kind': tab.get('kind'), 'contentId': tab.get('contentId')}
                         for tab in inventory.get('tabsIn', [])],
                'restoredTasks': restored_tasks,
                'restoredGuide': restored_guide,
            }
            await capture('mp5-reload')
            check('MP-5', 'reload restores the task page tab', restored_tasks)
            check('MP-5', 'reload restores the guide tab', restored_guide)
            check('MP-5', 'reload restores the multi-pane layout',
                  len(visible_panes(snapshot)) >= len(refresh_panes),
                  {'before': [pane['paneId'] for pane in refresh_panes],
                   'after': [pane['paneId'] for pane in visible_panes(snapshot)]})
            item('MP-5')['limitations'] = ['a page reload reloads both panes; per-pane refresh is not exposed by the host']
        except Exception as error:
            result['errors'].append({'step': 'MP-5-reload', 'error': str(error)})
            check('MP-5', 'page reload completed', False, str(error))
        if len(refresh_panes) < 2:
            block('MP-5', 'could not establish two panes before the refresh tests')

        # Rebuild a usable scene for the remaining checks after reload/archive.
        if await page.locator('[data-guide-tasks-adapter]').count() == 0:
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:id})", parent)
            await page.wait_for_timeout(600)
        await open_chat(guide_b, prefer_new=True)

        # ── MP-6: the auto-archive open-view guard ─────────────────────
        guard = await page.evaluate(GUARD_JS, {'parent': parent, 'child': guide_b})
        item('MP-6')['guard'] = guard
        if guard.get('available') is True:
            check('MP-6', 'threadOpen sees the guide chat tab in a pane', guard.get('open') is True, guard)
            inventory = await right()
            for tab in tabs_for_child(inventory, guide_b):
                await close_tab(tab['id'])
            guard_closed = await page.evaluate(GUARD_JS, {'parent': parent, 'child': guide_b})
            check('MP-6', 'threadOpen reports closed after the tab is closed', guard_closed.get('open') is False,
                  guard_closed)
            item('MP-6')['limitations'].append(
                'the production guard was called with real sidebar services; the pressure-driven scheduler itself was not run')
        else:
            block('MP-6', 'guide-panel __internals are not reachable from the client module registry; '
                          'auto-archive is disabled by default and no pressure scene was configured')

        # ── MP-7: the 2-pane cap, empty pane and reopen ────────────────
        guide_c = await add_guide()
        result['guides']['c'] = guide_c
        opened_c = await open_chat(guide_c, prefer_new=True)
        snapshot = await survey()
        inventory = await right()
        panes = visible_panes(snapshot)
        check('MP-7', 'opening a third conversation keeps the 2-pane cap', len(panes) == 2,
              {'open': opened_c, 'panes': [pane['paneId'] for pane in panes]})
        check('MP-7', 'the third conversation is still reachable', len(tabs_for_child(inventory, guide_c)) >= 1)
        # Empty the second pane and see whether the host collapses it.
        empty_pane = next((pane for pane in panes if len(pane['tabs']) > 0 and pane['column'] == '1'), None)
        if empty_pane is not None:
            for tab in empty_pane['tabs']:
                await close_tab(tab['id'])
            await page.wait_for_timeout(600)
            collapsed = len(visible_panes(await survey()))
            item('MP-7')['emptyPaneVisibleCount'] = collapsed
            reopened = await open_chat(guide_b, prefer_new=True)
            after = visible_panes(await survey())
            inventory = await right()
            check('MP-7', 'a second pane can be reopened after emptying it',
                  len(after) == 2 and len(tabs_for_child(inventory, guide_b)) >= 1,
                  {'reopen': reopened, 'panes': [pane['paneId'] for pane in after]})
        else:
            check('MP-7', 'the second pane was found for the empty-pane check', False)
        await capture('mp7-cap-and-reopen')
        await page.screenshot(path=str(output / 'mp7-after-reopen.png'), full_page=True)
        result['evidence'].append('mp7-after-reopen.png')

    except Exception as error:  # noqa: BLE001 - record the failure and keep the partial evidence
        result['errors'].append({'step': 'unhandled', 'error': str(error), 'repr': repr(error),
                                 'traceback': traceback.format_exc()})
    finally:
        result['finishedAt'] = now()
        result['consoleErrors'] = errors
        result['knownDiagnostics'] = [message for message in errors
                                      if 'WebSocket is closed before the connection is established' in message
                                      or 'Session reference' in message
                                      or '503 (Service Unavailable)' in message]
        statuses = [result['items'][f'MP-{index}']['status'] for index in range(1, 8)]
        if 'failed' in statuses or result['errors']:
            result['status'] = 'failed'
        elif 'blocked' in statuses:
            result['status'] = 'blocked'
        else:
            result['status'] = 'passed'
        inventory_steps = [{
            'label': step['label'],
            'panes': [{'paneId': pane.get('paneId'), 'column': pane.get('column'),
                       'tabs': [{'id': tab.get('id'), 'text': tab.get('text')} for tab in pane.get('tabs', [])]}
                      for pane in step['survey'].get('panes', [])],
            'tabsIn': step['right'].get('tabsIn', []),
            'openTabs': step['right'].get('openTabs', []),
        } for step in result['steps']]
        (output / 'multi-pane-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        (output / 'tab-inventory.json').write_text(json.dumps(inventory_steps, ensure_ascii=False, indent=2), encoding='utf-8')
        (output / 'console.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({
            'status': result['status'],
            'items': {key: value['status'] for key, value in result['items'].items()},
            'assertions': len(result['assertions']),
            'errors': result['errors'],
            'consoleErrors': len(errors),
        }, ensure_ascii=False))


async def run_git_file_edit(page, output):
    """A2 core: real Host file/Git scene via the isolated fixture route."""
    result = await page.evaluate("async () => (await fetch('./li-runtime/gf', {method: 'POST'})).json()")
    result = {'scenario': 'git-file-edit', 'startedAt': now(), 'finishedAt': now(), **result}
    (output / 'git-file-edit-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': result.get('status'), 'checks': result.get('checks'), 'dir': result.get('dir')}, ensure_ascii=False))


async def run_gf_ui_probe(page, config, output):
    """Probe the native editor path before automating GF-4/5/6."""
    file_path = output / 'notes-ui.txt'
    file_path.write_text('alpha\nbeta\n', encoding='utf-8', newline='')
    await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=config['parent'])
    await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', config['parent'])
    await page.wait_for_timeout(700)
    await page.evaluate("""({ id, path }) => {
      window.__liFixture.ctx.get('betterSidebar').openTab({ type: 'editor', path, title: 'notes-ui.txt' }, { sessionId: id })
    }""", {'id': config['parent'], 'path': str(file_path)})
    await page.wait_for_timeout(500)
    await page.wait_for_selector('.cm-content', timeout=12000)
    await page.wait_for_timeout(400)
    state = await page.evaluate("""() => ({
      inputs: [...document.querySelectorAll('input')].map(input => ({ placeholder: input.placeholder, value: input.value })),
      buttons: [...document.querySelectorAll('button')].map(button => ({ text: (button.innerText || '').trim(),
        aria: button.getAttribute('aria-label'), title: button.title })).filter(button => button.text || button.aria || button.title),
      cm: !!document.querySelector('.cm-content'),
      text: (document.querySelector('.cm-content')?.innerText || '').slice(0, 800),
    })""")
    await page.screenshot(path=str(output / 'gf-ui-open.png'), full_page=True)
    edited = False
    save = None
    try:
        await page.locator('.cm-content').click()
        await page.keyboard.press('Control+A')
        await page.keyboard.type('alpha\nbeta\nguide-ui-line\n')
        await page.wait_for_timeout(300)
        save = page.get_by_role('button', name=re.compile('保存|Save')).first
        await save.click()
        await page.wait_for_timeout(1000)
        edited = True
    except Exception as error:
        state['editError'] = str(error)
    await page.screenshot(path=str(output / 'gf-ui-saved.png'), full_page=True)
    disk = file_path.read_text(encoding='utf-8')
    result = {'scenario': 'gf-ui-probe', 'status': 'completed', 'file': str(file_path),
              'edited': edited, 'disk': disk, 'state': state, 'saveFound': save is not None}
    (output / 'gf-ui-probe-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': 'completed', 'edited': edited, 'disk': disk, 'saveFound': save is not None}, ensure_ascii=False))


async def run_git_file_edit_ui(page, config, output, errors):
    """A2 UI half: native editor save/EOL, same file in two panes, Git refresh."""
    parent = config['parent']
    result = {'scenario': 'git-file-edit-ui', 'startedAt': now(), 'finishedAt': None, 'errors': [],
              'items': {key: {'status': 'blocked', 'assertions': []} for key in ('GF-4', 'GF-5', 'GF-6')}}

    def check(key, label, ok, detail=None):
        entry = {'label': label, 'ok': bool(ok)}
        if detail is not None:
            entry['detail'] = detail
        result['items'][key]['assertions'].append(entry)
        if ok and result['items'][key]['status'] == 'blocked':
            result['items'][key]['status'] = 'passed'
        if not ok:
            result['items'][key]['status'] = 'failed'

    lf_path = output / 'notes-ui.txt'
    crlf_path = output / 'notes-ui-crlf.txt'
    lf_path.write_text('alpha\nbeta\n', encoding='utf-8', newline='')
    crlf_path.write_bytes(b'one\r\ntwo\r\n')

    async def open_editor(path, target=None):
        return await page.evaluate("""({ id, path, target }) => {
          const side = window.__liFixture.ctx.get('betterSidebar')
          const seed = { type: 'editor', path, title: path.split(/[\\\\/]/).pop() }
          if (target) seed.target = target
          try { side.openTab(seed, { sessionId: id }); return { ok: true } }
          catch (error) { return { ok: false, error: String(error) } }
        }""", {'id': parent, 'path': str(path), 'target': target})

    async def wait_editor(text):
        await page.wait_for_function("""(expected) => {
          const nodes = [...document.querySelectorAll('.cm-content')].filter(node => {
            const box = node.getBoundingClientRect(); return box.width > 0 && box.height > 0
          })
          return nodes.some(node => (node.innerText || '').includes(expected))
        }""", arg=text, timeout=15000)

    async def save_visible():
        save = page.get_by_role('button', name=re.compile('保存|Save')).first
        await save.click()
        await page.wait_for_timeout(900)

    try:
        await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
        await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
        await page.wait_for_timeout(600)

        # GF-4: editor save + EOL
        opened = await open_editor(lf_path)
        await wait_editor('alpha')
        check('GF-4', 'the native editor opens the LF file', opened.get('ok') is True, opened)
        content = await page.locator('.cm-content:visible').first.inner_text()
        check('GF-4', 'the editor shows the current disk content', 'alpha' in content and 'beta' in content, content[:500])
        await page.locator('.cm-content:visible').first.click()
        await page.keyboard.press('Control+A')
        await page.keyboard.type('alpha\nbeta\nguide-ui-line\n')
        await save_visible()
        disk = lf_path.read_text(encoding='utf-8')
        check('GF-4', 'saving the editor writes the edited content to disk', 'guide-ui-line' in disk, disk)
        await page.screenshot(path=str(output / 'gf4-editor-save.png'), full_page=True)

        opened_crlf = await open_editor(crlf_path)
        await wait_editor('one')
        check('GF-4', 'the native editor opens the CRLF file', opened_crlf.get('ok') is True, opened_crlf)
        await page.locator('.cm-content:visible').first.click()
        await page.keyboard.press('Control+A')
        await page.keyboard.type('one\ntwo\nthree\n')
        await save_visible()
        raw = crlf_path.read_bytes()
        check('GF-4', 'saving preserves CRLF EOL', raw.count(b'\r\n') >= 3 and b'three' in raw,
              {'crlf': raw.count(b'\r\n'), 'lf': raw.count(b'\n'), 'bytes': list(raw[:32])})
        await page.screenshot(path=str(output / 'gf4-editor-eol.png'), full_page=True)

        # GF-5: same file in two panes
        opened_lf = await open_editor(lf_path)
        await wait_editor('guide-ui-line')
        first_panes = await page.evaluate(SURVEY_JS)
        side_open = await open_editor(lf_path, target='side')
        await page.wait_for_timeout(900)
        after = await page.evaluate(SURVEY_JS)
        panes = [pane for pane in after.get('panes', []) if pane['rect']['w'] > 0]
        editor_tabs = [tab for pane in panes for tab in pane['tabs'] if 'notes-ui' in tab['text']]
        check('GF-5', 'opening the same file to the side adds a second pane', len(panes) >= 2,
              {'open': side_open, 'panes': [pane['paneId'] for pane in panes]})
        check('GF-5', 'the same file is visible in both panes', len(editor_tabs) >= 2,
              {'tabs': editor_tabs, 'before': first_panes.get('tabCount')})
        if len(panes) >= 2:
            await page.locator('.cm-content:visible').first.click()
            await page.keyboard.press('Control+A')
            await page.keyboard.type('alpha\nbeta\npane-one\n')
            await save_visible()
            disk = lf_path.read_text(encoding='utf-8')
            visible_texts = await page.locator('.cm-content:visible').all_text_contents()
            result['items']['GF-5']['behavior'] = {'disk': disk, 'visible': [text[-200:] for text in visible_texts]}
            check('GF-5', 'the second pane behavior is recorded', True, result['items']['GF-5']['behavior'])
        await page.screenshot(path=str(output / 'gf5-two-panes.png'), full_page=True)

        # GF-6: Git status refresh for an untracked workspace file
        temp_file = Path.cwd() / 'gf-ui-tmp.txt'
        temp_file.write_text('git refresh probe\n', encoding='utf-8')
        try:
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'git'}, {sessionId:id})", parent)
            await page.wait_for_timeout(1800)
            panel_text = await page.locator('[data-sidebar-right-panel]:visible').first.inner_text()
            check('GF-6', 'the Git tab lists the new untracked file', 'gf-ui-tmp.txt' in panel_text,
                  panel_text[-1500:])
            inventory = await page.evaluate(RIGHT_JS, parent)
            git_tab = next((tab['id'] for tab in inventory.get('tabsIn', []) if tab.get('kind') == 'git'), None)
            editor_tab = next((tab['id'] for tab in inventory.get('tabsIn', [])
                               if tab.get('kind') == 'editor' and 'notes-ui' in (tab.get('title') or '')), None)
            temp_file.unlink()
            if git_tab is not None:
                if editor_tab is not None:
                    await page.locator(f'[data-dockkit-tab="{editor_tab}"]').first.click()
                    await page.wait_for_timeout(400)
                await page.locator(f'[data-dockkit-tab="{git_tab}"]').first.click()
            panel_after = ''
            for _ in range(10):
                await page.wait_for_timeout(800)
                panel_after = await page.locator('[data-sidebar-right-panel]:visible').first.inner_text()
                if 'gf-ui-tmp.txt' not in panel_after:
                    break
            check('GF-6', 'the Git tab drops the removed file after becoming visible',
                  'gf-ui-tmp.txt' not in panel_after, {'gitTab': git_tab, 'panel': panel_after[-1500:]})
            await page.screenshot(path=str(output / 'gf6-git-refresh.png'), full_page=True)
        finally:
            if temp_file.exists():
                temp_file.unlink()
    except Exception as error:
        result['errors'].append({'step': 'unhandled', 'error': str(error), 'traceback': traceback.format_exc()})
    finally:
        result['finishedAt'] = now()
        result['consoleErrors'] = errors
        statuses = [item['status'] for item in result['items'].values()]
        result['status'] = 'failed' if 'failed' in statuses or result['errors'] else (
            'blocked' if 'blocked' in statuses else 'passed')
        (output / 'git-file-edit-ui-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': result['status'], 'items': {key: value['status'] for key, value in result['items'].items()},
                          'errors': result['errors'], 'consoleErrors': len(errors)}, ensure_ascii=False))


async def run_pty_probe(page, config, output):
    """Probe the host's webTerminals service (real PTY) before automating PT-1..PT-5."""
    info = await page.evaluate("""() => {
      const ctx = window.__liFixture.ctx
      const service = ctx.get('webTerminals')
      if (!service) return { available: false }
      return { available: true, serviceKeys: Object.keys(service) }
    }""")
    result = {'scenario': 'pty-probe', 'info': info, 'frames': []}
    if not info.get('available'):
        (output / 'pty-probe-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': 'blocked', 'reason': 'webTerminals missing'}, ensure_ascii=False))
        return
    # The host terminal service is session-scoped; create a root session first so
    # the view's working directory exists.
    await page.evaluate("""(id) => {
      const view = window.__liFixture.ctx.get('webTerminals').view(id, 'pty-probe', 'pty-probe')
      window.__ptyView = view
      window.__ptyDetach = view.mount()
    }""", config['parent'])
    await page.wait_for_timeout(1500)
    schedule = []
    for index in range(8):
        await page.wait_for_timeout(400)
        frames = await page.evaluate("""() => {
          const view = window.__ptyView
          const state = view.state.getSnapshot()
          const frames = []
          if (state.render) {
            frames.push(state.render.frame)
            view.acknowledge(state.render.revision)
          }
          return { phase: state.phase, writable: state.writable, info: state.info, frames }
        }""")
        result['frames'].append({'step': 'boot', 'value': frames})
        if frames.get('phase') == 'connected':
            break
    await page.evaluate("""() => { window.__ptyView.write("Write-Output 'pty-probe-ok'\\r") }""")
    for index in range(10):
        await page.wait_for_timeout(500)
        frames = await page.evaluate("""() => {
          const view = window.__ptyView
          const state = view.state.getSnapshot()
          const frames = []
          if (state.render) {
            frames.push(state.render.frame)
            view.acknowledge(state.render.revision)
          }
          return { phase: state.phase, writable: state.writable, info: state.info, frames }
        }""")
        result['frames'].append({'step': 'command', 'value': frames})
        text = json.dumps(frames, ensure_ascii=False)
        if 'pty-probe-ok' in text:
            break
    result['status'] = 'completed'
    (output / 'pty-probe-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': 'completed', 'info': info, 'frames': len(result['frames'])}, ensure_ascii=False))


PTY_HELPERS_JS = """() => {
  const service = window.__liFixture.ctx.get('webTerminals')
  if (!service) return { available: false }
  window.__ptyViews = {}
  window.__ptyCreate = (sessionId, key) => {
    const view = service.view(sessionId, key, key)
    view.mount()
    window.__ptyViews[key] = view
    return { id: view.id, state: view.state.getSnapshot() }
  }
  window.__ptyRead = key => {
    const view = window.__ptyViews[key]
    const state = view.state.getSnapshot()
    const frames = []
    if (state.render) { frames.push(state.render.frame); view.acknowledge(state.render.revision) }
    return { phase: state.phase, writable: state.writable, info: state.info, frames }
  }
  window.__ptySend = (key, text) => { window.__ptyViews[key].write(text); return true }
  window.__ptyResize = (key, cols, rows) => { window.__ptyViews[key].resize(cols, rows); return true }
  window.__ptyClose = async key => { await window.__ptyViews[key].close(); return true }
  return { available: true }
}"""


async def run_pty(page, config, output, errors):
    parent = config['parent']
    result = {'scenario': 'pty', 'startedAt': now(), 'finishedAt': None, 'errors': [],
              'items': {f'PT-{index}': {'status': 'blocked', 'assertions': []} for index in range(1, 7)},
              'screens': {}}
    screens = {}

    def check(key, label, ok, detail=None):
        entry = {'label': label, 'ok': bool(ok)}
        if detail is not None:
            entry['detail'] = detail
        result['items'][key]['assertions'].append(entry)
        if ok and result['items'][key]['status'] == 'blocked':
            result['items'][key]['status'] = 'passed'
        if not ok:
            result['items'][key]['status'] = 'failed'

    async def create(key):
        return await page.evaluate("({ sessionId, key }) => window.__ptyCreate(sessionId, key)",
                                   {'sessionId': parent, 'key': key})

    async def read(key):
        data = await page.evaluate('(key) => window.__ptyRead(key)', key)
        for frame in data.get('frames', []):
            if frame.get('type') == 'snapshot':
                screens[key] = frame.get('screen') or ''
            elif frame.get('type') == 'output':
                screens[key] = screens.get(key, '') + (frame.get('data') or '')
        return data

    async def wait_text(key, text, timeout=12.0):
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            await read(key)
            if text in screens.get(key, ''):
                return True
            await page.wait_for_timeout(250)
        return False

    async def send(key, text):
        await page.evaluate("({ key, text }) => window.__ptySend(key, text)",
                            {'key': key, 'text': text + '\r'})

    async def wait_ready(key, timeout=10.0):
        deadline = asyncio.get_running_loop().time() + timeout
        while asyncio.get_running_loop().time() < deadline:
            data = await read(key)
            if data.get('phase') == 'connected' and data.get('writable') is True:
                return True
            await page.wait_for_timeout(250)
        return False

    async def close(key):
        try:
            await page.evaluate('async (key) => window.__ptyClose(key)', key)
        except Exception:
            pass

    try:
        helpers = await page.evaluate(PTY_HELPERS_JS)
        if helpers.get('available') is not True:
            for key in result['items']:
                result['items'][key]['blockedReason'] = 'webTerminals service unavailable'
            return
        await create('pty-main')
        ready = await wait_ready('pty-main')
        check('PT-1', 'the host allocates a real PTY and it becomes writable', ready, await read('pty-main'))

        # PT-1: command output and exit code
        await send('pty-main', 'set TOKEN=PTY1_OK')
        await send('pty-main', 'cmd /c "echo %TOKEN% & exit /b 0"')
        output_ok = await wait_text('pty-main', 'PTY1_OK')
        await send('pty-main', 'echo EXIT=%errorlevel%')
        exit_ok = await wait_text('pty-main', 'EXIT=0')
        check('PT-1', 'a command produces its output', output_ok, {'screenTail': screens.get('pty-main', '')[-1600:]})
        check('PT-1', 'the command exit code is observable', exit_ok, {'screenTail': screens.get('pty-main', '')[-1600:]})

        # PT-2: interactive stdin
        await send('pty-main', 'set /p NAME=Name?')
        await page.wait_for_timeout(500)
        await send('pty-main', 'alice')
        await page.wait_for_timeout(500)
        await send('pty-main', 'echo HELLO %NAME%')
        stdin_ok = await wait_text('pty-main', 'HELLO alice')
        check('PT-2', 'stdin reaches an interactive prompt', stdin_ok, {'screenTail': screens.get('pty-main', '')[-1600:]})

        # PT-3: Ctrl-C and no orphan ping
        await send('pty-main', 'ping -t 127.0.0.1 > %TEMP%\\pty-ping.txt')
        await page.wait_for_timeout(1000)
        await send('pty-main', '\x03')
        await page.wait_for_timeout(700)
        await send('pty-main', 'echo PTY3_AFTER_CANCEL')
        cancel_ok = await wait_text('pty-main', 'PTY3_AFTER_CANCEL')
        await send('pty-main', 'tasklist /FI "IMAGENAME eq PING.EXE" | find /i "PING.EXE"')
        await page.wait_for_timeout(700)
        await read('pty-main')
        orphan = 'PING.EXE' in screens.get('pty-main', '').upper()
        check('PT-3', 'Ctrl-C returns control to the shell', cancel_ok, {'screenTail': screens.get('pty-main', '')[-1800:]})
        check('PT-3', 'Ctrl-C leaves no ping process', not orphan, {'orphanPing': orphan})

        # PT-4: two terminals are independent
        await create('pty-two')
        await wait_ready('pty-two')
        await send('pty-two', 'echo PTY4_TWO')
        two_ok = await wait_text('pty-two', 'PTY4_TWO')
        await close('pty-two')
        await send('pty-main', 'echo PTY4_ONE')
        one_ok = await wait_text('pty-main', 'PTY4_ONE')
        check('PT-4', 'the second terminal produces its own output', two_ok)
        check('PT-4', 'closing the second terminal leaves the first usable', one_ok,
              {'mainPhase': await read('pty-main')})

        # PT-5: resize and long output
        await page.evaluate("() => window.__ptyResize('pty-main', 100, 40)")
        await page.wait_for_timeout(400)
        await send('pty-main', 'for /l %i in (1,1,150) do @echo PTY5_LINE_%i')
        long_ok = await wait_text('pty-main', 'PTY5_LINE_150', timeout=15)
        await page.evaluate("() => window.__ptyResize('pty-main', 80, 24)")
        await page.wait_for_timeout(400)
        await send('pty-main', 'echo PTY5_AFTER_RESIZE')
        resize_ok = await wait_text('pty-main', 'PTY5_AFTER_RESIZE')
        resize_info = (await read('pty-main')).get('info')
        result['items']['PT-5']['resizeInfo'] = resize_info
        result['items']['PT-5']['limitations'] = [
            'view.resize(100,40) then (80,24) was requested; the host info still reported 80x24, so actual reflow is not proven, only continued usability',
        ]
        check('PT-5', 'long output reaches the last line', long_ok, {'screenTail': screens.get('pty-main', '')[-1800:]})
        check('PT-5', 'the terminal remains usable after resize', resize_ok,
              {'info': resize_info})
        await page.screenshot(path=str(output / 'pty-command.png'), full_page=True)

        result['items']['PT-6'] = await run_pt6(page, config, output)
    except Exception as error:
        result['errors'].append({'step': 'unhandled', 'error': str(error), 'traceback': traceback.format_exc()})
    finally:
        result['finishedAt'] = now()
        result['consoleErrors'] = errors
        result['knownDiagnostics'] = [message for message in errors
                                      if 'WebSocket is closed before the connection is established' in message
                                      or 'Session reference' in message]
        result['screens'] = {key: value[-4000:] for key, value in screens.items()}
        pt6 = result['items']['PT-6']
        result['mode'] = pt6.get('mode')
        result['scope'] = pt6.get('scope')
        result['productionAcceptance'] = pt6.get('productionAcceptance')
        statuses = [item['status'] for item in result['items'].values()]
        result['status'] = 'failed' if 'failed' in statuses or result['errors'] else (
            'blocked' if 'blocked' in statuses else ('known-diagnostic' if result['knownDiagnostics'] else 'passed'))
        (output / 'pty-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
        print(json.dumps({'status': result['status'], 'items': {key: value['status'] for key, value in result['items'].items()},
                          'errors': result['errors'], 'consoleErrors': len(errors)}, ensure_ascii=False))


async def run_soak_probe(page, output):
    page.set_default_timeout(180000)
    result = await page.evaluate("async () => (await fetch('./li-runtime/soak-probe')).json()")
    result = {'scenario': 'soak-probe', 'provider': result.get('provider'), 'model': result.get('model'),
              'startedAt': now(), 'finishedAt': now(), **result}
    (output / 'soak-probe-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': result.get('status'), 'provider': result.get('provider'),
                      'model': result.get('model'), 'eventTypes': result.get('eventTypes')}, ensure_ascii=False))


async def run_soak(page, output):
    """Real-model soak: start the host-side scene, then poll only its small state."""
    page.set_default_timeout(180000)
    started = await page.evaluate("async () => (await fetch('./li-runtime/soak?start=1')).json()")
    state = started
    deadline = asyncio.get_running_loop().time() + 1900
    while state.get('status') == 'running' and asyncio.get_running_loop().time() < deadline:
        await page.wait_for_timeout(2000)
        state = await page.evaluate("async () => (await fetch('./li-runtime/soak')).json()")
    if state.get('status') == 'running':
        state = {**state, 'status': 'failed', 'error': 'soak poll deadline exceeded'}
    (output / 'soak-result.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': state.get('status'), 'provider': state.get('provider'),
                      'model': state.get('model'), 'elapsedMs': state.get('elapsedMs'),
                      'goalRounds': state.get('goalRounds'),
                      'guides': state.get('guides')}, ensure_ascii=False))


async def run_cold_update(page, config, output):
    parent = config['parent']
    await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
    state = await page.evaluate("""async (id) => {
      const response = await fetch('./guide/api/state', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: id }),
      })
      return await response.json()
    }""", parent)
    await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
    await page.wait_for_timeout(700)
    await page.evaluate("(id) => window.__liFixture.ctx.sidebarRight.openTab('guide-panel')", parent)
    await page.wait_for_timeout(800)
    tabs = await page.evaluate('(id) => window.__liFixture.ctx.sidebarRight.tabsIn(id).map(tab => ({ id: tab.id, kind: tab.kind, title: tab.title }))', parent)
    title = next((tab['title'] for tab in tabs if tab['kind'] == 'guide-panel'), None)
    result = {'scenario': 'cold-update', 'parent': parent, 'title': title, 'tabs': tabs,
              'state': state.get('value') if isinstance(state, dict) else state,
              'startedAt': now(), 'finishedAt': now()}
    (output / 'cold-update-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'status': 'completed', 'title': title,
                      'panelCompat': (state.get('value') or {}).get('panelCompat') if isinstance(state, dict) else None}, ensure_ascii=False))


async def main():
    config = json.loads(sys.stdin.buffer.read().decode('utf-8'))
    output = Path(config['output'])
    output.mkdir(parents=True, exist_ok=True)
    errors = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel='msedge', headless=True, timeout=15000)
        if config.get('scenario') == 'r5-extended':
            context = await browser.new_context(viewport={'width': 1440, 'height': 1000})
            page = await context.new_page()
        else:
            page = await browser.new_page(viewport={'width': 1440, 'height': 1000})
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: errors.append(message.text) if message.type in ['error', 'warning'] else None)
        try:
            await page.goto(config['entryUrl'], wait_until='domcontentloaded')
            await page.wait_for_function('window.__liFixture !== undefined', timeout=25000)
            await page.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter') && window.__liFixture.ctx.get('guideSidebarAdapter').getState().mode !== 'loading'", timeout=15000)
            state = await page.evaluate("""() => ({
              adapter: window.__liFixture.ctx.get('guideSidebarAdapter').getState(),
              modules: window.__liFixture.ctx.modules.entries.state.getSnapshot(),
              sessions: Object.keys(window.__liFixture.ctx.sessions.list.getSnapshot().byId),
            })""")
            assert not state['modules']['failures'], state['modules']
            assert state['adapter']['mode'] == 'active', state['adapter']
            if config.get('scenario') == 'probe':
                await run_probe(page, config, output, errors)
                return
            if config.get('scenario') == 'multi-pane':
                await run_multi_pane(page, config, output, errors)
                return
            if config.get('scenario') == 'residual':
                await run_residual(page, config, output)
                return
            if config.get('scenario') == 'r5-extended':
                await run_r5_extended(page, config, output)
                return
            if config.get('scenario') == 'git-file-edit':
                await run_git_file_edit(page, output)
                return
            if config.get('scenario') == 'gf-ui-probe':
                await run_gf_ui_probe(page, config, output)
                return
            if config.get('scenario') == 'git-file-edit-ui':
                await run_git_file_edit_ui(page, config, output, errors)
                return
            if config.get('scenario') == 'pty-probe':
                await run_pty_probe(page, config, output)
                return
            if config.get('scenario') == 'pty':
                await run_pty(page, config, output, errors)
                return
            if config.get('scenario') == 'pt6':
                result = await run_pt6(page, config, output)
                print(json.dumps({'status': result['status'], 'scenario': 'pt6'}, ensure_ascii=False))
                return
            if config.get('scenario') == 'soak-probe':
                await run_soak_probe(page, output)
                return
            if config.get('scenario') == 'soak':
                await run_soak(page, output)
                return
            if config.get('scenario') == 'cold-update':
                await run_cold_update(page, config, output)
                return
            parent = config['parent']
            await page.wait_for_function('(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]', arg=parent)
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', parent)
            await page.wait_for_timeout(500)
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'subagent',title:'Tasks'}, {sessionId:id})", parent)
            await page.locator('[data-guide-tasks-adapter]').wait_for(timeout=10000)
            await page.locator('[data-task-section="guide:threads"]').wait_for(timeout=10000)
            welcome = page.get_by_role('button', name='继续', exact=True)
            try:
                await welcome.wait_for(state='visible', timeout=2500)
                await welcome.click()
            except PlaywrightTimeout:
                pass
            section = page.locator('[data-task-section="guide:threads"]')
            assert await section.locator('button').count() > 0
            raw = await page.evaluate("""(id) => {
              const ctx = window.__liFixture.ctx;
              const list = ctx.sessions.list.getSnapshot();
              const children = list.projectionsBySession[id]?.values.subagentCatalog ?? [];
              const entry = [...ctx.get('loader').entries()].find(e => e.options.name === 'dsh-better-sidebar');
              const scoped = entry.fiber.ctx;
              return {children, globalIds:Object.keys(list.byId),
                taskIds:Object.keys(scoped.sessions.list.getSnapshot().byId),
                directLookup:children.map(c => !!scoped.sessions.list.getSnapshot().byId[c.id])};
            }""", parent)
            guides = [row['id'] for row in raw['children'] if row.get('label', '').startswith('指导: ')]
            workers = [row['id'] for row in raw['children'] if not row.get('label', '').startswith('指导: ')]
            assert guides and workers, raw
            assert all(value in raw['globalIds'] for value in guides), raw
            assert all(value not in raw['taskIds'] for value in guides), raw
            assert all(value in raw['taskIds'] for value in workers), raw
            assert all(raw['directLookup']), raw
            main = page.locator('[data-guide-tasks-adapter] > div').first
            await page.wait_for_timeout(400)
            counts = await main.locator('[class*="subagentCount"]').all_text_contents()
            assert any('1' in label for label in counts), counts
            assert 'LI guide' not in await main.inner_text()
            assert await main.locator('svg').count() > 0, 'Original task graph did not render'
            await main.get_by_role('button', name='切换为树状图', exact=True).click()
            await main.get_by_role('button', name='切换为工作流图', exact=True).wait_for()
            assert 'LI guide' not in await main.inner_text()
            await main.get_by_role('button', name='切换为工作流图', exact=True).click()
            new_guide = await page.evaluate("async () => (await fetch('./li-runtime/add-guide', {method:'POST'})).json()")
            await page.wait_for_function("(id) => !!window.__liFixture.ctx.sessions.list.getSnapshot().byId[id]", arg=new_guide['childId'])
            await page.wait_for_function("() => window.__liFixture.ctx.get('guideSidebarAdapter').getTaskSections().length === 1")
            await page.wait_for_timeout(150)
            assert await section.get_by_role('button', name='打开', exact=True).count() == 2
            await page.evaluate("(id) => window.__liFixture.ctx.uiWorkspace.archiveSession(id, {stopActivity:true})", guides[0])
            await section.get_by_text('休眠中', exact=True).wait_for()
            await page.evaluate("(id) => window.__liFixture.ctx.uiWorkspace.unarchiveSession(id)", guides[0])
            await page.wait_for_timeout(150)
            # O12: seed a real native layout with the historical stored title/address.
            legacy = await page.evaluate("""(id) => {
              const right=window.__liFixture.ctx.sidebarRight;
              right.openTabIn(id,'guide-panel');
              for(const tab of right.tabsIn(id)) if(tab.kind==='guide') right.closeIn(id,tab.id);
              const before=right.tabsIn(id).map(tab=>tab.id);
              right.adopted.get(id).store.actions.openContent(id,{kind:'guide',contentId:'sidebar://guide',title:'指导'},()=>{});
              const old=right.tabsIn(id).find(tab=>tab.kind==='guide'&&tab.title==='指导');
              right.openTabIn(id,'guide-panel');
              return {before,old:old?.id};
            }""",parent)
            assert legacy['old'], legacy
            await page.locator('[data-guide-legacy-layout]').wait_for(timeout=7000)
            await page.get_by_role('button',name='清理旧指导页签',exact=True).click()
            await page.locator('[data-guide-legacy-layout]').wait_for(state='detached')
            current=await page.evaluate('(id)=>window.__liFixture.ctx.sidebarRight.tabsIn(id).map(tab=>tab.id)',parent)
            assert legacy['old'] not in current and all(id in current for id in legacy['before'])
            # O21: a missing essential service method becomes explicit read-only state.
            await page.evaluate("async()=>fetch('./li-runtime/compat-disable',{method:'POST'})")
            refusal=await page.evaluate("""async(id)=>{
              const state=await fetch('./guide/api/state',{method:'POST',body:JSON.stringify({sessionId:id}),headers:{'content-type':'application/json'}}).then(r=>r.json());
              const response=await fetch('./guide/api/start',{method:'POST',body:JSON.stringify({sessionId:id,question:'must not execute'}),headers:{'content-type':'application/json'}});
              return{mode:state.value.panelCompat.mode,status:response.status};
            }""",parent)
            await page.evaluate("async()=>fetch('./li-runtime/compat-restore',{method:'POST'})")
            assert refusal=={'mode':'unsupported','status':503},refusal
            await page.evaluate("(id)=>{const r=window.__liFixture.ctx.sidebarRight;for(const t of r.tabsIn(id))if(t.kind==='guide-panel')r.closeIn(id,t.id);r.openTabIn(id,'guide');}",parent)
            await page.screenshot(path=str(output / 'tasks.png'), full_page=True)
            # Observe the real stock auto-open path, not an imitation of its helper.
            await page.evaluate('(id) => window.__liFixture.ctx.uiWorkspace.openSession(id)', config['autoParent'])
            await page.wait_for_timeout(300)
            await page.evaluate("""(id) => {
              const side=window.__liFixture.ctx.get('betterSidebar');
              side.openTab({type:'editor',title:'Files'}, {sessionId:id});
              window.__liAuto=[]; window.__liOriginalOpen=side.openTab;
              side.openTab=function(...args) { if(args[0]?.type==='subagent') window.__liAuto.push(args[0]); return window.__liOriginalOpen.apply(this,args); };
            }""", config['autoParent'])
            await page.evaluate("async () => (await fetch('./li-runtime/auto-guide', {method:'POST'})).json()")
            await page.wait_for_timeout(700)
            assert await page.evaluate('window.__liAuto.length') == 0, 'Guidance triggered automatic Tasks opening'
            await page.evaluate("async () => (await fetch('./li-runtime/auto-work', {method:'POST'})).json()")
            await page.wait_for_function('window.__liAuto.length > 0', timeout=5000)
            await page.evaluate("() => {const side=window.__liFixture.ctx.get('betterSidebar'); side.openTab=window.__liOriginalOpen;}")
            # Exercise non-task consumers against the same scoped sessions service.
            await page.evaluate("""(id) => {
              const side=window.__liFixture.ctx.get('betterSidebar');
              window.__liOtherComponents=Object.fromEntries(['editor','git','sidechat','terminal-bottom'].map(id=>[id,side.getTab(id).component.toString()]));
              side.openTab({type:'editor',title:'Files'}, {sessionId:id});
            }""", config['autoParent'])
            await page.wait_for_timeout(400)
            if await welcome.is_visible():
                await welcome.click()
            await page.get_by_text('文件', exact=True).first.click()
            await page.get_by_text('README.md', exact=True).first.wait_for(timeout=7000)
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'git'}, {sessionId:id})", config['autoParent'])
            await page.get_by_role('tablist').filter(has=page.get_by_role('tab', name='Git', exact=True)).wait_for(timeout=7000)
            await page.evaluate("(id) => window.__liFixture.ctx.get('betterSidebar').openTab({type:'sidechat'}, {sessionId:id})", config['autoParent'])
            await page.locator('textarea[class*="sidechatComposerInput"]').wait_for(timeout=7000)
            # Unload and reactivate the adapter through the actual client Loader.
            await page.evaluate("""async () => {
              const entry=[...window.__liFixture.ctx.get('loader').entries()].find(e=>e.options.name==='@local/dsh-guide-sidebar-adapter');
              await entry.update({disabled:true}); await entry.fiber?.await();
            }""")
            await page.wait_for_function("!window.__liFixture.ctx.get('guideSidebarAdapter')")
            assert await page.locator('[data-guide-tasks-adapter]').count() == 0
            await page.evaluate("""async () => {
              const entry=[...window.__liFixture.ctx.get('loader').entries()].find(e=>e.options.name==='@local/dsh-guide-sidebar-adapter');
              await entry.update({disabled:false}); await entry.fiber?.await();
            }""")
            await page.wait_for_function("window.__liFixture.ctx.get('guideSidebarAdapter')?.getState().mode==='active'")
            assert await page.evaluate("""() => ['editor','git','sidechat','terminal-bottom'].every(id =>
              window.__liFixture.ctx.get('betterSidebar').getTab(id).component.toString()===window.__liOtherComponents[id])""")
            await page.reload(wait_until='domcontentloaded')
            await page.wait_for_function("window.__liFixture?.ctx.get('guideSidebarAdapter')?.getState().mode==='active'")
            result = {'status': 'passed', 'adapter': state['adapter'], 'raw': raw,
                      'assertions': ['stock browser modules mounted', 'same tasks page includes guidance section',
                                     'task enumeration filters guidance and retains work', 'global and direct session lookups preserved',
                                     'original graph/tree switch and filtered counts', 'multiple guidance conversations',
                                     'archive/unarchive updates the guidance section', 'actual guidance auto-open suppressed; ordinary work auto-open retained',
                                     'original file explorer, changes and sidechat views render; non-task component implementations survive reload unchanged',
                                     'adapter unload restores original sidebar and reactivation succeeds', 'full page reload succeeds'],
                      'consoleErrors': errors, 'additionalAssertions':['O12 real persisted legacy layout cleanup preserves other tabs','O21 actual missing method is unsupported and start returns 503']}
            (output / 'browser-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
            print(json.dumps({'status': 'passed', 'assertions': len(result['assertions']), 'consoleErrors': len(errors)}))
        except Exception as error:
            diagnostic = await page.evaluate("""() => window.__liFixture ? {
              adapter: window.__liFixture.ctx.get('guideSidebarAdapter')?.getState(),
              modules: window.__liFixture.ctx.modules.entries.state.getSnapshot(),
              sidebar: !!window.__liFixture.ctx.get('betterSidebar'),
            } : {fixture:false}""")
            diagnostic['host'] = await page.evaluate("async () => (await fetch(new URL('./guide-sidebar/api/state', document.baseURI))).json()")
            diagnostic['exception'] = str(error)
            (output / 'browser-diagnostic.json').write_text(json.dumps(diagnostic, ensure_ascii=False, indent=2), encoding='utf-8')
            (output / 'browser-errors.json').write_text(json.dumps(errors, ensure_ascii=False, indent=2), encoding='utf-8')
            (output / 'browser-body.txt').write_text(await page.locator('body').inner_text(), encoding='utf-8')
            await page.screenshot(path=str(output / 'failure.png'), full_page=True)
            raise
        finally:
            await browser.close()


asyncio.run(main())

window.__ModuleLoader__.load({
  id: '@local/dsh-guide-panel',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'guidePanel'

    const LABEL_PREFIX = '指导: '
    const STORE_KEY = 'dsh-guide-panel.threads.v1'
    // The panel is its OWN tab type. `guide` is the right sidebar's built-in
    // start page (the card grid that opens files, terminal, browser, ...);
    // registering a type with that kind shadows it — every pane's default page
    // becomes this panel and the start page's other entries disappear. The id
    // is also the body-seat key, so it must stay stable and plugin-specific.
    const PANEL_TAB_ID = 'guide-panel'
    const PANEL_KIND = 'guide-panel'
    const EMPTY_LIST = { byId: {}, projectionsBySession: {} }
    const EMPTY_IDS = []
    const EMPTY_ENTRIES = []

    // Mirrors the host defaults; the host's /guide/api/state replaces this
    // document once it answers.
    const DEFAULT_LIMITS = {
      archive: { lowDelayMs: 600_000, midDelayMs: 180_000, highDelayMs: 30_000, holdMs: 120_000 },
    }
    const ARCHIVE_TICK_MS = 15_000

    const zh = {
      title: '指导',
      description: '在侧栏开一个继承当前上下文的指导对话，判断下一步该用什么技能',
      intro: '指导对话是当前会话的子会话，用「指导模式」preset 运行：它继承已完成轮次的历史，可以提供建议，也可以按你的要求执行修改。开在右侧栏，和主对话并排看。',
      goalNative: 'goal 兼容层当前使用原等待行为，运行中的指导仍可能推迟 goal 续轮。',
      goalAbsent: 'goal 兼容层尚未启用，运行中的指导可能推迟 goal 续轮。',
      shieldPartial: '结算防护只部分生效：部分父会话的方法无法包装，指导结算可能仍进入主对话。',
      shieldOff: '结算防护已关闭：指导冷恢复后的结算会进入主对话。',
      modelUnsupported: '模型目录过滤未生效：当前宿主未通过工具定义/来源核验，list_agents 仍可能返回指导。',
      modelPartial: '模型目录过滤只部分生效：部分工具定义未识别，相关调用仍可能返回或控制指导。',
      modelPending: '模型目录过滤正在初始化。',
      modelOff: '模型目录过滤已关闭：list_agents 仍可能返回指导。',
      sidebarNative: '任务页兼容层未生效；仍可使用本指导面板打开对话。',
      questionLabel: '想问指导什么',
      placeholder: '例：用 guide 判断一下，我现在该先做哪一步？',
      start: '在侧栏开始指导对话',
      starting: '正在继承上下文…',
      threads: '本会话的指导对话',
      empty: '还没有指导对话。写下问题，点上面的按钮开始。',
      open: '打开',
      reopen: '重新打开',
      archive: '归档',
      archiving: '归档中…',
      unarchiving: '恢复中…',
      unarchive: '取消归档',
      archivedTag: '已归档',
      sleepTag: '休眠中',
      runningTag: '生成中',
      copyId: '复制 ID',
      copied: '已复制',
      showArchived: '显示已归档',
      hideArchived: '隐藏已归档',
      noArchived: '没有已归档的指导对话',
      archivedDone: '已休眠',
      closeHint: '关闭对话页签只会暂时收起页面；会话仍在，点「打开」即可回来。闲置的指导对话会在子代理名额紧张时自动休眠，「重新打开」即唤醒（首条消息要冷启动几秒）。',
      unavailable: '工作区服务不可用',
      noThreadsSurface: '当前部署打不开侧栏对话页，已改为在主界面打开',
      legacy: '改用独立会话（不继承上下文）',
      failed: '创建失败',
      needQuestion: '先写下你想让指导对话判断什么',
      hostStale: '宿主端还没加载指导路由：重载插件或重启 DSH 后再试',
      hostStaleBanner: '宿主端仍是旧版本（/guide/api 未注册，请求会得到 405）：重启 DSH，或在插件页把「指导」关掉再打开，然后硬刷新。',
      capNote: '名额服务暂不可用，请稍后重试或重启宿主。',
      taskSectionTitle: '指导对话',
      taskSectionEmpty: '本会话还没有指导对话。',
      taskSectionOpenPanel: '打开指导面板',
      taskSectionOpening: '打开中…',
    }

    const en = {
      title: 'Guidance',
      description: 'Open a guidance conversation beside this one, inheriting its context',
      intro: 'A guidance conversation inherits completed turns and uses the Guidance preset. It can advise or make changes when you request them. It opens beside the main conversation.',
      goalNative: 'Goal compatibility is using the original wait behavior. Running guidance may delay goal continuation.',
      goalAbsent: 'Goal compatibility is not enabled. Running guidance may delay goal continuation.',
      shieldPartial: 'Settlement shielding is only partial: some parent methods could not be wrapped, so a guidance settlement may still enter the main conversation.',
      shieldOff: 'Settlement shielding is off: a cold-resumed guidance settlement will enter the main conversation.',
      modelUnsupported: 'Model-facing task filtering is unavailable: the host did not verify the tool definitions/source, so list_agents may still return guidance.',
      modelPartial: 'Model-facing task filtering is only partial: some tool definitions are unrecognized, so related calls may still expose or control guidance.',
      modelPending: 'Model-facing task filtering is initializing.',
      modelOff: 'Model-facing task filtering is off: list_agents may still return guidance.',
      sidebarNative: 'Tasks-page compatibility is unavailable. Guidance conversations remain accessible from this panel.',
      questionLabel: 'What should the guidance look at?',
      placeholder: 'e.g. Use guide to judge where I am and what to do next.',
      start: 'Start guidance beside this chat',
      starting: 'Inheriting context…',
      threads: 'Guidance conversations here',
      empty: 'No guidance conversation yet. Write a question and start one above.',
      open: 'Open',
      reopen: 'Reopen',
      archive: 'Archive',
      archiving: 'Archiving…',
      unarchiving: 'Restoring…',
      unarchive: 'Unarchive',
      archivedTag: 'Archived',
      sleepTag: 'Sleeping',
      runningTag: 'Running',
      copyId: 'Copy ID',
      copied: 'Copied',
      showArchived: 'Show archived',
      hideArchived: 'Hide archived',
      noArchived: 'No archived guidance conversation',
      archivedDone: 'Sleeping',
      closeHint: 'Closing the chat tab only hides the page; the session stays and “Reopen” brings it back. Idle guidance threads fall asleep when subagent slots get tight; reopening wakes one (the first message cold-starts in a few seconds).',
      unavailable: 'Workspace service unavailable',
      noThreadsSurface: 'This deployment cannot host the sidebar chat; opened in the main view instead',
      legacy: 'Use a standalone session (no inherited context)',
      failed: 'Creation failed',
      needQuestion: 'Write what the guidance conversation should judge first',
      hostStale: 'The host half has not loaded the guidance route yet: reload the plugin or restart DSH',
      hostStaleBanner: 'The host half is still the old build (/guide/api is not registered, requests get 405): restart DSH, or toggle the plugin off and on, then hard-refresh.',
      capNote: 'Capacity admission is unavailable. Retry later or restart the Host.',
      taskSectionTitle: 'Guidance threads',
      taskSectionEmpty: 'No guidance conversation in this chat yet.',
      taskSectionOpenPanel: 'Open the guidance panel',
      taskSectionOpening: 'Opening…',
    }

    // ── styles ────────────────────────────────────────────────────────────
    const box = {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '14px 12px',
      color: 'var(--dsw-alias-label-primary)',
      fontFamily: 'inherit',
    }
    const heading = { fontSize: 14, fontWeight: 600, lineHeight: 1.4 }
    const intro = {
      margin: 0,
      fontSize: 12,
      lineHeight: 1.6,
      color: 'var(--dsw-alias-label-secondary)',
    }
    const fieldLabel = {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.5,
      color: 'var(--dsw-alias-label-tertiary)',
    }
    const textarea = {
      width: '100%',
      boxSizing: 'border-box',
      minHeight: 64,
      resize: 'vertical',
      border: '1px solid var(--dsw-alias-hairline, rgba(127,127,127,0.35))',
      borderRadius: 8,
      padding: '8px 10px',
      font: 'inherit',
      fontSize: 12,
      lineHeight: 1.6,
      color: 'var(--dsw-alias-label-primary)',
      background: 'transparent',
      outline: 'none',
    }
    const primary = {
      width: '100%',
      border: 'none',
      borderRadius: 8,
      padding: '8px 10px',
      font: 'inherit',
      fontSize: 13,
      cursor: 'pointer',
      color: '#fff',
      background: 'var(--dsw-alias-brand-primary, #4D6BFE)',
    }
    const secondary = {
      border: '1px solid var(--dsw-alias-hairline)',
      borderRadius: 7,
      padding: '4px 8px',
      font: 'inherit',
      fontSize: 11,
      cursor: 'pointer',
      color: 'var(--dsw-alias-label-primary)',
      background: 'transparent',
      whiteSpace: 'nowrap',
    }
    const linkButton = {
      border: 'none',
      background: 'transparent',
      padding: 0,
      font: 'inherit',
      fontSize: 11,
      cursor: 'pointer',
      color: 'var(--dsw-alias-label-tertiary)',
      textDecoration: 'underline',
      textAlign: 'left',
    }
    const sectionRow = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
      marginTop: 4,
    }
    const sectionTitle = { fontSize: 12, fontWeight: 600, lineHeight: 1.4 }
    const count = { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }
    const empty = {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.6,
      color: 'var(--dsw-alias-label-tertiary)',
    }
    const row = {
      display: 'flex',
      flexDirection: 'column',
      gap: 6,
      padding: '8px 8px',
      border: '1px solid var(--dsw-alias-hairline)',
      borderRadius: 8,
    }
    const rowHead = { display: 'flex', alignItems: 'flex-start', gap: 6 }
    const dot = (running) => ({
      width: 6,
      height: 6,
      marginTop: 5,
      borderRadius: 999,
      flex: '0 0 auto',
      background: running ? 'var(--dsw-alias-success, #2ea043)' : 'var(--dsw-alias-label-tertiary)',
      opacity: running ? 1 : 0.5,
    })
    const rowTitle = {
      flex: '1 1 auto',
      minWidth: 0,
      fontSize: 12,
      lineHeight: 1.5,
      wordBreak: 'break-word',
    }
    const rowMeta = {
      display: 'flex',
      gap: 8,
      fontSize: 10,
      color: 'var(--dsw-alias-label-tertiary)',
    }
    const rowActions = { display: 'flex', flexWrap: 'wrap', gap: 6 }
    const hint = {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.6,
      color: 'var(--dsw-alias-label-tertiary)',
    }
    const warn = {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.6,
      padding: '6px 8px',
      borderRadius: 8,
      color: 'var(--dsw-alias-state-warning-primary, #8a5a00)',
      background: 'var(--dsw-alias-state-warning-bg, rgba(138,90,0,0.08))',
      border: '1px solid var(--dsw-alias-state-warning-hairline, rgba(138,90,0,0.28))',
    }
    const status = {
      margin: 0,
      fontSize: 11,
      lineHeight: 1.6,
      color: 'var(--dsw-alias-label-secondary)',
      wordBreak: 'break-word',
    }
    // Tasks-page section: compact, because it shares the page with the graph.
    const taskBox = { display: 'flex', flexDirection: 'column', gap: 4, padding: '0 8px 8px' }
    const taskList = { display: 'flex', flexDirection: 'column', gap: 4 }
    const taskRow = {
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '4px 6px',
      border: '1px solid var(--dsw-alias-hairline)',
      borderRadius: 6,
    }
    const taskTitle = {
      flex: '1 1 auto',
      minWidth: 0,
      fontSize: 12,
      lineHeight: 1.5,
      wordBreak: 'break-word',
    }
    const taskMeta = { flex: 'none', fontSize: 10, color: 'var(--dsw-alias-label-tertiary)' }

    // ── durable local records ────────────────────────────────────────────
    // The child session is the source of truth; this map only remembers the
    // threads this panel minted, so an archived (or catalog-dropped) thread
    // still has a row to unarchive from.
    function loadRecords() {
      try {
        const raw = window.localStorage.getItem(STORE_KEY)
        if (!raw) return {}
        const parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    function saveRecords(records) {
      try {
        window.localStorage.setItem(STORE_KEY, JSON.stringify(records))
      } catch {
        // A full or disabled localStorage only costs the archived row.
      }
    }

    // ── draft persistence ────────────────────────────────────────────────
    // The composer is deliberately UNCONTROLLED: the banner question is
    // read from the element on submit, never mirrored through React state.
    // A sidebar pane may remount its body (tab switch, host refresh), and a
    // controlled value would then come back empty in the middle of typing;
    // the draft key keeps the text either way.
    function draftKeyOf(sessionId) {
      return `dsh-guide-panel.draft.v1.${sessionId ?? ''}`
    }

    function loadDraft(sessionId) {
      try {
        return window.localStorage.getItem(draftKeyOf(sessionId)) ?? ''
      } catch {
        return ''
      }
    }

    function saveDraft(sessionId, value) {
      try {
        window.localStorage.setItem(draftKeyOf(sessionId), value)
      } catch {
        // A full or disabled localStorage only costs the draft.
      }
    }

    // ── service access ───────────────────────────────────────────────────
    function serviceOf(ctx, name) {
      try {
        return ctx.get(name)
      } catch {
        return undefined
      }
    }

    /** Ordinal of one pressure band; `none` is the floor. */
    const BAND_RANK = { none: 0, low: 1, mid: 2, high: 3 }

    /**
     * Pressure band from native used / Host capacity (B1). Parked idle
     * activations still count until native release. Boundaries are half-open, so 25%
     * is already `low` and 75% is `high`.
     */
    function bandOf(running, capacity) {
      const ratio = running / Math.max(1, capacity)
      if (ratio < 0.25) return 'none'
      if (ratio < 0.5) return 'low'
      if (ratio < 0.75) return 'mid'
      return 'high'
    }

    /** Delay for one band; `null` means "do not archive at this pressure". */
    function delayForBand(band, archive) {
      const limits = archive ?? DEFAULT_LIMITS.archive
      if (band === 'low') return limits.lowDelayMs ?? DEFAULT_LIMITS.archive.lowDelayMs
      if (band === 'mid') return limits.midDelayMs ?? DEFAULT_LIMITS.archive.midDelayMs
      if (band === 'high') return limits.highDelayMs ?? DEFAULT_LIMITS.archive.highDelayMs
      return null
    }

    /**
     * C3 peak hold: a dropped band stays in force for `holdMs`, so a quick
     * 3→2 guide drop does not immediately turn a 30s high band into a 3min
     * mid band. `none` never holds (no pressure means no archive); the caller
     * keeps the accumulated idle time across the drop.
     * @returns `{ band, until }`; `until` is 0 when no hold is active.
     */
    function nextHold(current, held, until, now, holdMs) {
      if (current === 'none') return { band: 'none', until: 0 }
      if (held === 'none' || BAND_RANK[current] >= BAND_RANK[held]) return { band: current, until: 0 }
      const deadline = until === 0 ? now + holdMs : until
      if (now >= deadline) return { band: current, until: 0 }
      return { band: held, until: deadline }
    }

    /** `hold` while pressure is `none`; `wait` until the delay elapses; then `archive`. */
    function archiveVerdict(now, since, delay) {
      if (delay === null) return 'hold'
      return now - since < delay ? 'wait' : 'archive'
    }

    /** One-line settlement-shield status for the panel; `active` is silent. */
    function shieldNoteFor(shield, t) {
      if (shield?.mode === 'partial') return t('shieldPartial')
      if (shield?.mode === 'off') return t('shieldOff')
      return ''
    }

    /** One-line model projection status; `active` and `idle` are silent. */
    function modelNoteFor(model, t) {
      if (model?.mode === 'pending') return t('modelPending')
      if (model?.mode === 'partial') return t('modelPartial')
      if (model?.mode === 'unsupported') return t('modelUnsupported')
      if (model?.mode === 'off') return t('modelOff')
      return ''
    }

    /** How long an idle guide thread may stay resident at the current pressure. */
    function archiveDelay(running, capacity, archive) {
      return delayForBand(bandOf(running, capacity), archive)
    }

    /** Whether one thread currently has a chat tab open in its seat. */
    function threadOpen(right, seatSessionId, childSessionId) {
      try {
        const tabs = typeof right?.tabsIn === 'function' ? right.tabsIn(seatSessionId) : []
        if (!Array.isArray(tabs)) return false
        return tabs.some((tab) => {
          const address = typeof tab?.contentId === 'string' ? tab.contentId : ''
          return address.includes(childSessionId) || address.includes(encodeURIComponent(childSessionId))
        })
      } catch {
        return false
      }
    }

    function apiUrl(ctx, method) {
      const sidebar = serviceOf(ctx, 'betterSidebar')
      if (typeof sidebar?.hostRouteUrl === 'function') {
        try {
          return sidebar.hostRouteUrl(`guide/api/${method}`)
        } catch {
          // Fall through to the document-relative URL.
        }
      }
      return new URL(`./guide/api/${method}`, window.document.baseURI).toString()
    }

    async function callHost(ctx, method, payload, t) {
      const response = await fetch(apiUrl(ctx, method), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        ...(method === 'state' ? { signal: AbortSignal.timeout(8000) } : {}),
      })
      if (response.status === 404 || response.status === 405) throw new Error(t('hostStale'))
      const text = await response.text()
      let body = null
      try {
        body = text === '' ? {} : JSON.parse(text)
      } catch {
        body = null
      }
      if (!response.ok || body === null || body.ok !== true) {
        const message = body?.error?.message
        throw new Error(typeof message === 'string' && message !== '' ? message : `HTTP ${response.status}`)
      }
      return body.value
    }

    function chatAddress(parentSessionId, childSessionId) {
      const query = new URLSearchParams({ parent: parentSessionId, mode: 'continuable' })
      return `dsh-resource://subagentchat/session/${encodeURIComponent(childSessionId)}?${query.toString()}`
    }

    /**
     * Show one guidance conversation beside the caller.
     * Prefers DSH's native right-sidebar chat tab (live composer, stop, token
     * usage, 2-pane cap) and degrades to the main view on hosts without it.
     * @returns whether the sidebar took the tab.
     */
    async function openThread(ctx, parentSessionId, childSessionId) {
      // A finished thread may have been auto-archived; the archived-session
      // gate would refuse its first prompt, so wake it before opening.
      const workspaceService = serviceOf(ctx, 'uiWorkspace')
      try {
        const archived = serviceOf(ctx, 'workspaces')?.list?.getSnapshot?.()?.archivedSessionIds
        if (Array.isArray(archived) && archived.includes(childSessionId)
          && typeof workspaceService?.unarchiveSession === 'function') {
          await workspaceService.unarchiveSession(childSessionId)
        }
      } catch {
        // A failed unarchive surfaces on the first prompt; opening still works.
      }
      const right = serviceOf(ctx, 'sidebarRight')
      const tabs = serviceOf(ctx, 'sidebarRightTabs')
      const supported = tabs === undefined
        ? typeof right?.openResource === 'function'
        : typeof tabs?.get === 'function' && tabs.get('subagentchat') !== undefined
      if (supported && typeof right?.openResource === 'function') {
        try {
          right.openResource(chatAddress(parentSessionId, childSessionId), {
            kind: 'subagentchat',
            preferNewPane: true,
          })
          return true
        } catch {
          // Fall through to the main-view jump.
        }
      }
      const workspace = serviceOf(ctx, 'uiWorkspace')
      if (typeof workspace?.openSession === 'function') {
        workspace.openSession({
          parentSessionId,
          childSessionId,
          mode: 'continuable',
        })
        return false
      }
      throw new Error('无法打开指导对话：当前部署既没有侧栏对话页，也没有主界面会话导航')
    }

    /**
     * Best-effort close of the native chat tab bound to one thread. Archiving
     * stops and hides the session; leaving its tab behind would show a dead
     * page, so we drop the tab when the controller can enumerate it.
     */
    function closeThreadTab(ctx, seatSessionId, childSessionId) {
      const right = serviceOf(ctx, 'sidebarRight')
      if (typeof right?.tabsIn !== 'function' || typeof right?.close !== 'function') return
      try {
        const tabs = right.tabsIn(seatSessionId)
        if (!Array.isArray(tabs)) return
        for (const tab of tabs) {
          const address = typeof tab?.contentId === 'string' ? tab.contentId : ''
          if (!address.includes(childSessionId) && !address.includes(encodeURIComponent(childSessionId))) continue
          right.close(tab.id)
          return
        }
      } catch {
        // A tab that cannot be enumerated simply stays until the user closes it.
      }
    }

    // ── hooks ────────────────────────────────────────────────────────────
    function useSessionList(ctx) {
      const service = serviceOf(ctx, 'sessions')
      const subscribe = React.useCallback((onChange) => {
        try {
          return service?.list?.subscribe?.(onChange) ?? (() => {})
        } catch {
          return () => {}
        }
      }, [service])
      const getSnapshot = React.useCallback(() => {
        try {
          return service?.list?.getSnapshot?.() ?? EMPTY_LIST
        } catch {
          return EMPTY_LIST
        }
      }, [service])
      return React.useSyncExternalStore(subscribe, getSnapshot)
    }

    function useArchivedSessionIds(ctx) {
      const service = serviceOf(ctx, 'workspaces')
      const subscribe = React.useCallback((onChange) => {
        try {
          return service?.list?.subscribe?.(onChange) ?? (() => {})
        } catch {
          return () => {}
        }
      }, [service])
      const getSnapshot = React.useCallback(() => {
        try {
          return service?.list?.getSnapshot?.()?.archivedSessionIds ?? EMPTY_IDS
        } catch {
          return EMPTY_IDS
        }
      }, [service])
      return React.useSyncExternalStore(subscribe, getSnapshot)
    }

    function formatTime(timestamp) {
      if (!Number.isFinite(timestamp) || timestamp <= 0) return ''
      try {
        return new Intl.DateTimeFormat(undefined, {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date(timestamp))
      } catch {
        return ''
      }
    }

    function threadTitle(label, displayTitle, id) {
      if (typeof label === 'string' && label.startsWith(LABEL_PREFIX)) {
        const rest = label.slice(LABEL_PREFIX.length).trim()
        if (rest !== '') return rest
      }
      if (typeof displayTitle === 'string' && displayTitle !== '') return displayTitle
      return id.slice(0, 8)
    }

    /** This session's guide threads: local records + catalog + summary fallback. */
    function threadsOf(records, list, sessionId) {
      const byId = new Map()
      for (const [id, record] of Object.entries(records)) {
        if (record === null || typeof record !== 'object') continue
        if (record.parentSessionId !== sessionId) continue
        byId.set(id, {
          id,
          label: typeof record.label === 'string' ? record.label : '',
          createdAt: Number(record.createdAt) || 0,
        })
      }
      const raw = list?.projectionsBySession?.[sessionId]?.values?.subagentCatalog
      const entries = Array.isArray(raw) ? raw : EMPTY_ENTRIES
      for (const entry of entries) {
        if (entry === null || typeof entry !== 'object') continue
        const label = typeof entry.label === 'string' ? entry.label : ''
        if (!label.startsWith(LABEL_PREFIX)) continue
        const previous = byId.get(entry.id)
        byId.set(entry.id, {
          id: entry.id,
          label,
          createdAt: Number(entry.createdAt) || previous?.createdAt || 0,
        })
      }
      // Fallback for hosts that do not publish the parent catalog: the child
      // is still a durable subagent row of this session, and the host pinned
      // its title to the same label.
      for (const summary of Object.values(list?.byId ?? {})) {
        if (summary === null || typeof summary !== 'object') continue
        if (summary.origin !== 'subagent' || summary.parentId !== sessionId) continue
        if (typeof summary.displayTitle !== 'string' || !summary.displayTitle.startsWith(LABEL_PREFIX)) continue
        if (byId.has(summary.id)) continue
        byId.set(summary.id, { id: summary.id, label: summary.displayTitle, createdAt: 0 })
      }
      return [...byId.values()].sort((left, right) => right.createdAt - left.createdAt)
    }

    // ── panel ────────────────────────────────────────────────────────────
    function GuidePanel({ ctx, sessionId: seatSessionId, scope }) {
      const t = ctx.locale.bind(NS)
      // Native right-sidebar tab bodies receive the seat session as a standard
      // prop; `scope` stays supported for the old better-sidebar mount.
      const sessionId = seatSessionId ?? (scope && scope.sessionId)
      const list = useSessionList(ctx)
      const archivedIds = useArchivedSessionIds(ctx)
      const inputRef = React.useRef(null)
      const draftRef = React.useRef('')
      const debugRef = React.useRef(null)
      const [busy, setBusy] = React.useState(null)
      const [note, setNote] = React.useState('')
      const [hostReady, setHostReady] = React.useState(null)
      const [capNote, setCapNote] = React.useState('')
      const [goalNote, setGoalNote] = React.useState('')
      const [shieldNote, setShieldNote] = React.useState('')
      const [modelNote, setModelNote] = React.useState('')
      const [sidebarNote, setSidebarNote] = React.useState('')
      const [records, setRecords] = React.useState(loadRecords)

      // Probe the host half once per mount. A stale bundle answers the SPA
      // fallback (405 for any non-GET), so the banner names the real fix
      // instead of letting the user discover it on the first question.
      React.useEffect(() => {
        let cancelled = false
        callHost(ctx, 'ping', {}, t)
          .then(() => {
            if (!cancelled) setHostReady(true)
          })
          .catch(() => {
            if (!cancelled) setHostReady(false)
          })
        return () => {
          cancelled = true
        }
      }, [])

      React.useEffect(() => {
        let cancelled = false
        const off = ctx.inject(['guideSidebarAdapter'], host => {
          const service = host.get('guideSidebarAdapter')
          const update = () => { if (!cancelled) setSidebarNote(service?.getState?.().mode === 'native' ? t('sidebarNative') : '') }
          update()
          return service?.subscribe?.(update)
        })
        return () => { cancelled = true; if (typeof off === 'function') off() }
      }, [])

      // Display compatibility; the service owns the live per-pool budget.
      React.useEffect(() => {
        let cancelled = false
        callHost(ctx, 'state', { sessionId }, t)
          .then((value) => {
            if (cancelled || value === null || typeof value !== 'object') return
            setGoalNote(value.goalAdapter?.mode === 'native' ? t('goalNative')
              : value.goalAdapter?.mode === 'absent' ? t('goalAbsent') : '')
            setShieldNote(shieldNoteFor(value.settlementShield, t))
            setModelNote(modelNoteFor(value.modelProjection, t))
            const admission = value.admission
            setCapNote(!admission || ['unsupported', 'off', 'reconciling'].includes(admission.mode)
              ? t('capNote') : '')
          })
          .catch(() => {
            setCapNote(t('capNote'))
          })
        return () => {
          cancelled = true
        }
      }, [sessionId])

      // Restore the draft of the session this seat shows, and put it into the
      // (uncontrolled) field. A seat keeps its body mounted across tab
      // switches, so this runs again only when the session changes.
      React.useEffect(() => {
        const draft = loadDraft(sessionId)
        draftRef.current = draft
        if (inputRef.current !== null) inputRef.current.value = draft
      }, [sessionId])

      React.useEffect(() => {
        saveRecords(records)
      }, [records])

      // Optional field diagnostics: `window.__guideDebug = true` in the
      // console makes the panel print the native events the field actually
      // receives (focus is best-effort above, so this is the only way to
      // tell "no event reached the field" from "state never updated").
      React.useEffect(() => {
        const input = inputRef.current
        if (input === null) return undefined
        const print = (text) => {
          const line = debugRef.current
          if (line === null) return
          if (window.__guideDebug !== true) {
            line.style.display = 'none'
            return
          }
          line.style.display = 'block'
          line.textContent = text
        }
        const report = (type) => (event) => {
          print(`${type}${typeof event.key === 'string' ? ` key=${event.key}` : ''} active=${document.activeElement === input} value=${JSON.stringify(input.value)}`)
        }
        const handlers = {
          focus: report('focus'),
          blur: report('blur'),
          pointerdown: report('pointerdown'),
          keydown: report('keydown'),
          beforeinput: report('beforeinput'),
          input: report('input'),
          compositionstart: report('compositionstart'),
          compositionend: report('compositionend'),
        }
        for (const [type, handler] of Object.entries(handlers)) input.addEventListener(type, handler, true)
        return () => {
          for (const [type, handler] of Object.entries(handlers)) input.removeEventListener(type, handler, true)
        }
      }, [])

      const archived = React.useMemo(() => new Set(archivedIds), [archivedIds])

      const threads = React.useMemo(() => threadsOf(records, list, sessionId), [records, list, sessionId])

      // Auto-archived threads are the normal resting state now, so the list
      // always shows them; sleeping rows carry their own tag and "唤醒" action.
      const visibleThreads = threads

      const flash = (text) => {
        setNote(text)
        window.setTimeout(() => setNote((current) => (current === text ? '' : current)), 2200)
      }

      const start = async () => {
        const text = inputRef.current !== null ? inputRef.current.value.trim() : draftRef.current.trim()
        if (busy !== null) return
        if (text === '') {
          setNote(t('needQuestion'))
          try {
            inputRef.current?.focus()
          } catch {
            // A field that cannot be focused still shows the note above.
          }
          return
        }
        setBusy('start')
        setNote('')
        try {
          const value = await callHost(ctx, 'start', { sessionId, question: text }, t)
          const childId = value && value.childId
          if (typeof childId !== 'string' || childId === '') throw new Error(t('failed'))
          setRecords((current) => ({
            ...current,
            [childId]: {
              label: typeof value.label === 'string' ? value.label : `${LABEL_PREFIX}${text}`,
              createdAt: Date.now(),
              parentSessionId: sessionId,
            },
          }))
          draftRef.current = ''
          saveDraft(sessionId, '')
          if (inputRef.current !== null) inputRef.current.value = ''
          const inSidebar = await openThread(ctx, sessionId, childId)
          if (!inSidebar) setNote(t('noThreadsSurface'))
        } catch (error) {
          setNote(String(error && error.message ? error.message : error))
        } finally {
          setBusy(null)
        }
      }

      const archive = async (thread) => {
        if (busy !== null) return
        const workspace = serviceOf(ctx, 'uiWorkspace')
        if (typeof workspace?.archiveSession !== 'function') {
          setNote(t('unavailable'))
          return
        }
        setBusy(`archive:${thread.id}`)
        setNote('')
        try {
          await workspace.archiveSession(thread.id, { stopActivity: true })
          closeThreadTab(ctx, sessionId, thread.id)
          flash(t('archivedDone'))
        } catch (error) {
          setNote(String(error && error.message ? error.message : error))
        } finally {
          setBusy(null)
        }
      }

      const unarchive = async (thread) => {
        if (busy !== null) return
        const workspace = serviceOf(ctx, 'uiWorkspace')
        if (typeof workspace?.unarchiveSession !== 'function') {
          setNote(t('unavailable'))
          return
        }
        setBusy(`archive:${thread.id}`)
        setNote('')
        try {
          await workspace.unarchiveSession(thread.id)
        } catch (error) {
          setNote(String(error && error.message ? error.message : error))
        } finally {
          setBusy(null)
        }
      }

      const copy = (thread) => {
        if (!navigator.clipboard) return
        navigator.clipboard.writeText(thread.id)
          .then(() => flash(t('copied')))
          .catch(() => setNote(thread.id))
      }

      const open = async (thread) => {
        if (busy !== null) return
        setBusy(`open:${thread.id}`)
        try {
          await openThread(ctx, sessionId, thread.id)
        } catch (error) {
          setNote(String(error && error.message ? error.message : error))
        } finally {
          setBusy(null)
        }
      }

      const legacy = () => {
        const workspace = serviceOf(ctx, 'uiWorkspace')
        if (typeof workspace?.startSession !== 'function') {
          setNote(t('unavailable'))
          return
        }
        try {
          workspace.startSession(undefined, { agentPreset: 'guide' })
        } catch (error) {
          setNote(String(error && error.message ? error.message : error))
        }
      }

      const rows = visibleThreads.map((thread) => {
        const summary = list?.byId?.[thread.id]
        const running = summary?.running === true
        const isArchived = archived.has(thread.id)
        const archiving = busy === `archive:${thread.id}`
        return h(
          'div',
          { key: thread.id, style: row },
          h(
            'div',
            { style: rowHead },
            h('span', { style: dot(running), 'aria-hidden': true }),
            h('div', { style: rowTitle }, threadTitle(thread.label, summary?.displayTitle, thread.id)),
          ),
          h(
            'div',
            { style: rowMeta },
            running ? h('span', null, t('runningTag')) : null,
            isArchived ? h('span', null, t('sleepTag')) : null,
            h('span', null, formatTime(thread.createdAt)),
          ),
          h(
            'div',
            { style: rowActions },
            h(
              'button',
              {
                type: 'button',
                style: secondary,
                onClick: () => void open(thread),
              },
              isArchived ? t('reopen') : t('open'),
            ),
            isArchived
              ? h(
                'button',
                { type: 'button', style: secondary, onClick: () => void unarchive(thread), disabled: busy !== null },
                archiving ? t('unarchiving') : t('unarchive'),
              )
              : h(
                'button',
                { type: 'button', style: secondary, onClick: () => void archive(thread), disabled: busy !== null },
                archiving ? t('archiving') : t('archive'),
              ),
            h('button', { type: 'button', style: secondary, onClick: () => copy(thread) }, t('copyId')),
          ),
        )
      })

      return h(
        'div',
        { style: box },
        h('div', { style: heading }, t('title')),
        h('p', { style: intro }, t('intro')),
        hostReady === false ? h('p', { style: warn }, t('hostStaleBanner')) : null,
        capNote !== '' ? h('p', { style: warn }, capNote) : null,
        h('p', { style: fieldLabel }, t('questionLabel')),
        h('textarea', {
          ref: inputRef,
          style: textarea,
          defaultValue: '',
          placeholder: t('placeholder'),
          spellCheck: false,
          // Explicit focus on pointerdown: a pane-level drag/focus handler
          // that calls preventDefault() would otherwise keep the caret off
          // the field while clicks on buttons still work.
          onPointerDown: (event) => {
            try {
              event.currentTarget.focus()
            } catch {
              // Focus is best-effort; typing probes the field either way.
            }
          },
          onChange: (event) => {
            draftRef.current = event.target.value
            saveDraft(sessionId, event.target.value)
          },
          onKeyDown: (event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault()
              void start()
            }
          },
        }),
        h(
          'button',
          {
            type: 'button',
            style: busy === 'start' ? { ...primary, opacity: 0.6, cursor: 'default' } : primary,
            onClick: () => void start(),
            disabled: busy !== null,
          },
          busy === 'start' ? t('starting') : t('start'),
        ),
        h(
          'div',
          { style: sectionRow },
          h('div', { style: sectionTitle }, t('threads')),
          h('span', { style: count }, String(threads.length)),
        ),
        threads.length === 0 ? h('p', { style: empty }, t('empty')) : null,
        rows,
        goalNote ? h('p', { style: hint }, goalNote) : null,
        shieldNote ? h('p', { style: hint }, shieldNote) : null,
        modelNote ? h('p', { style: hint }, modelNote) : null,
        sidebarNote ? h('p', { style: hint }, sidebarNote) : null,
        note ? h('p', { style: status }, note) : null,
        h('p', { ref: debugRef, style: { ...status, display: 'none', fontFamily: 'monospace' } }, ''),
        h('p', { style: hint }, t('closeHint')),
        h('button', { type: 'button', style: linkButton, onClick: legacy }, t('legacy')),
      )
    }

    /**
     * The Tasks-page section: this session's guide threads, with the same
     * open/wake actions as the panel. The host renders the heading and the
     * scrolling band; the section owns only the rows.
     */
    function GuideTaskSection({ ctx, scope }) {
      const t = ctx.locale.bind(NS)
      const sessionId = scope && scope.sessionId
      const list = useSessionList(ctx)
      const archivedIds = useArchivedSessionIds(ctx)
      const records = React.useMemo(loadRecords, [])
      const archived = React.useMemo(() => new Set(archivedIds), [archivedIds])
      const threads = React.useMemo(() => threadsOf(records, list, sessionId), [records, list, sessionId])
      const [busy, setBusy] = React.useState(null)
      const [note, setNote] = React.useState('')

      const open = async (thread) => {
        if (busy !== null) return
        setBusy(thread.id)
        setNote('')
        try {
          await openThread(ctx, sessionId, thread.id)
        } catch (error) {
          setNote(String(error && error.message ? error.message : error))
        } finally {
          setBusy(null)
        }
      }

      const openPanel = () => {
        const right = serviceOf(ctx, 'sidebarRight')
        if (typeof right?.openTab !== 'function') return
        try {
          right.openTab(PANEL_KIND)
        } catch {
          // The panel is still reachable through the right Sidebar's + menu.
        }
      }

      const rows = threads.map((thread) => {
        const summary = list?.byId?.[thread.id]
        const running = summary?.running === true
        const sleeping = archived.has(thread.id)
        return h(
          'div',
          { key: thread.id, style: taskRow },
          h('span', { style: dot(running), 'aria-hidden': true }),
          h('span', { style: taskTitle }, threadTitle(thread.label, summary?.displayTitle, thread.id)),
          running ? h('span', { style: taskMeta }, t('runningTag')) : null,
          sleeping ? h('span', { style: taskMeta }, t('sleepTag')) : null,
          h(
            'button',
            {
              type: 'button',
              style: secondary,
              disabled: busy !== null,
              onClick: () => void open(thread),
            },
            busy === thread.id
              ? t('taskSectionOpening')
              : sleeping ? t('reopen') : t('open'),
          ),
        )
      })

      return h(
        'div',
        { style: taskBox },
        threads.length === 0 ? h('p', { style: hint }, t('taskSectionEmpty')) : h('div', { style: taskList }, rows),
        h(
          'button',
          { type: 'button', style: linkButton, onClick: openPanel },
          t('taskSectionOpenPanel'),
        ),
        note ? h('p', { style: status }, note) : null,
      )
    }

    function Icon({ size = 16 }) {
      return h(
        'svg',
        { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', 'aria-hidden': true },
        h('circle', { cx: 12, cy: 12, r: 9, stroke: 'currentColor', strokeWidth: 1.8 }),
        h('path', { d: 'M15.8 8.2 13.9 13.9 8.2 15.8 10.1 10.1Z', fill: 'currentColor' }),
      )
    }

    return {
      inject: ['uiWorkspace', 'sessions', 'sidebarRight', 'locale'],
      apply(ctx) {
        const offZh = ctx.locale.register(NS, 'zh', zh)
        const offEn = ctx.locale.register(NS, 'en', en)
        // Native right-sidebar registration: the panel is its OWN tab type
        // (kind `guide-panel`), so it coexists with the host's start page and
        // with better-sidebar's own kinds. See PANEL_KIND above: reusing the
        // built-in `guide` kind would shadow the start page.
        const offNative = ctx.inject(['sidebarRightTabs', 'slots'], (host) => {
          const cleanups = []
          try {
            cleanups.push(host.sidebarRightTabs.register({
              id: PANEL_TAB_ID,
              kind: PANEL_KIND,
              title: () => host.locale.bind(NS)('title'),
              guide: [{
                id: PANEL_TAB_ID,
                order: 40,
                title: () => host.locale.bind(NS)('title'),
                description: () => host.locale.bind(NS)('description'),
              }],
            }))
            cleanups.push(host.slots.inject('sidebar.right.pane.tab', () => host.slots.register(
              { name: 'sidebar.right.pane.tab', key: PANEL_TAB_ID, locale: NS },
              (props) => h(GuidePanel, { ...props, ctx: host }),
            )))
          } catch (error) {
            // A partial registration is worse than none: report and unwind.
            for (const cleanup of cleanups.splice(0).reverse()) {
              try { cleanup() } catch {}
            }
            if (typeof console !== 'undefined') console.error('[guide-panel] native sidebar registration failed', error)
            return
          }
          return () => {
            for (const cleanup of cleanups.splice(0).reverse()) {
              try { cleanup() } catch {}
            }
          }
        })
        // Prefer the independent adapter once active; keep the old seam only
        // as a migration fallback. Exactly one face owns our contributions.
        let adapterFace, legacyFace, attachedFace, offAdapterState
        let taskCleanups = [], refreshingTasks = false
        const refreshTasks = () => {
          if (refreshingTasks) return
          const preferred = adapterFace?.getState?.().mode === 'active' ? adapterFace : legacyFace
          const sidebar = typeof preferred?.registerTaskFilter === 'function'
            && typeof preferred?.registerTaskSection === 'function' ? preferred : undefined
          if (sidebar === attachedFace) return
          refreshingTasks = true
          for (const cleanup of taskCleanups.splice(0).reverse()) { try { cleanup() } catch {} }
          attachedFace = sidebar
          if (!sidebar) { refreshingTasks = false; return }
          try {
            taskCleanups.push(sidebar.registerTaskFilter((entry, summary) => {
              const label = entry?.label ?? summary?.displayTitle ?? ''
              return typeof label === 'string' && label.startsWith(LABEL_PREFIX)
            }))
            taskCleanups.push(sidebar.registerTaskSection({
              id: 'guide:threads',
              title: () => ctx.locale.bind(NS)('taskSectionTitle'),
              order: 10,
              component: (props) => h(GuideTaskSection, { ...props, ctx }),
            }))
          } catch (error) {
            for (const cleanup of taskCleanups.splice(0).reverse()) {
              try { cleanup() } catch {}
            }
            if (typeof console !== 'undefined') console.warn('[guide-panel] task page integration unavailable', error)
            attachedFace = undefined
          }
          refreshingTasks = false
        }
        const offTask = ctx.inject(['betterSidebar'], host => {
          legacyFace = host.get('betterSidebar'); refreshTasks()
          return () => { legacyFace = undefined; refreshTasks() }
        })
        const offTaskAdapter = ctx.inject(['guideSidebarAdapter'], host => {
          adapterFace = host.get('guideSidebarAdapter')
          if (typeof adapterFace?.subscribe !== 'function') return
          offAdapterState = adapterFace.subscribe(refreshTasks)
          refreshTasks()
          return () => {
            offAdapterState?.(); adapterFace = undefined; refreshTasks()
          }
        })
        ctx.effect(() => () => {
          if (typeof offNative === 'function') {
            try { offNative() } catch {}
          }
          if (typeof offTask === 'function') {
            try { offTask() } catch {}
          }
          if (typeof offTaskAdapter === 'function') { try { offTaskAdapter() } catch {} }
          for (const cleanup of taskCleanups.splice(0).reverse()) { try { cleanup() } catch {} }
          offZh()
          offEn()
        })

        // Pressure comes from the same Host snapshot as admission. No summary fallback.
        const limitsRef = { current: DEFAULT_LIMITS }
        ctx.effect(() => {
          const sessions = serviceOf(ctx, 'sessions')
          const workspaces = serviceOf(ctx, 'workspaces')
          const right = serviceOf(ctx, 'sidebarRight')
          const workspace = serviceOf(ctx, 'uiWorkspace')
          if (typeof sessions?.list?.getSnapshot !== 'function'
            || typeof workspace?.archiveSession !== 'function') return
          let stopped = false
          const idleSince = new Map()
          const inflight = new Set()
          // Peak-hold state (C3): the band last in force and the deadline of
          // its hold. Reset when pressure returns to that band or drops to none.
          const holds = new Map()
          let scanning = false
          const scan = async () => {
            if (stopped || scanning) return
            scanning = true
            try {
            const now = Date.now()
            const list = sessions.list.getSnapshot() ?? EMPTY_LIST
            const archiveIds = workspaces?.list?.getSnapshot?.()?.archivedSessionIds
            const archived = new Set(Array.isArray(archiveIds) ? archiveIds : EMPTY_IDS)
            const threads = new Map()
            for (const [seatId, projection] of Object.entries(list.projectionsBySession ?? {})) {
              const catalog = projection && projection.values && projection.values.subagentCatalog
              if (!Array.isArray(catalog)) continue
              for (const entry of catalog) {
                const label = entry && entry.label
                if (typeof label !== 'string' || !label.startsWith(LABEL_PREFIX)) continue
                if (typeof entry.id !== 'string' || entry.id === '') continue
                threads.set(entry.id, { seatId })
              }
            }
            if (!threads.size) { holds.clear(); return }
            const state = await callHost(ctx, 'state', { sessionIds: [...new Set([...threads.values()].map(thread => thread.seatId))] }, ctx.locale.bind(NS))
            if (stopped) return
            const snapshot = state?.admission
            if (!snapshot || snapshot.enforcement !== 'native-materialize' || snapshot.unknown !== 0
              || !Number.isFinite(snapshot.sampledAt) || Date.now() - snapshot.sampledAt > 10_000) { holds.clear(); return }
            limitsRef.current = { ...DEFAULT_LIMITS, archive: { ...DEFAULT_LIMITS.archive, ...state.archive } }
            const busy = new Set(snapshot.busyIds ?? [])
            const seenPools = new Set(), delays = new Map()
            for (const pool of Object.values(snapshot.poolsBySession ?? {})) {
              if (!pool.poolId || pool.unknown !== 0 || !Number.isSafeInteger(pool.capacity) || pool.capacity <= 0 || !Number.isSafeInteger(pool.used)) continue
              seenPools.add(pool.poolId)
              if (delays.has(pool.poolId)) continue
              const previous = holds.get(pool.poolId) ?? { band: 'none', until: 0 }
              const peak = nextHold(bandOf(pool.used, pool.capacity), previous.band, previous.until, now, limitsRef.current.archive.holdMs)
              holds.set(pool.poolId, peak)
              delays.set(pool.poolId, delayForBand(peak.band, limitsRef.current.archive))
            }
            for (const key of holds.keys()) if (!seenPools.has(key)) holds.delete(key)
            for (const [childId, thread] of threads) {
              const pool = snapshot.poolsBySession?.[thread.seatId]
              if (!pool || !delays.has(pool.poolId) || busy.has(childId)) { idleSince.delete(childId); continue }
              const delay = delays.get(pool.poolId)
              const summary = sessions.list.getSnapshot()?.byId?.[childId]
              // Unknown state (no summary) is never archived: a background
              // run whose row is not loaded must not be stopped by a guess.
              if (!summary || archived.has(childId) || summary.running === true
                || threadOpen(right, thread.seatId, childId) || inflight.has(childId)) {
                idleSince.delete(childId)
                continue
              }
              // C3: keep the accumulated idle time when pressure is `none` or
              // drops to a lower band; only an active/archived/open thread
              // resets it. A long-idle thread therefore sleeps as soon as the
              // effective band is high enough again.
              const since = idleSince.get(childId) ?? now
              idleSince.set(childId, since)
              if (archiveVerdict(now, since, delay) !== 'archive') continue
              inflight.add(childId)
              workspace.archiveSession(childId, { stopActivity: true })
                .catch(() => {})
                .finally(() => {
                  idleSince.delete(childId)
                  inflight.delete(childId)
                })
            }
            for (const childId of [...idleSince.keys()]) {
              if (!threads.has(childId)) idleSince.delete(childId)
            }
            } catch { holds.clear() } finally { scanning = false }
          }
          let offSessions = () => {}
          let offWorkspaces = () => {}
          try {
            offSessions = sessions.list.subscribe?.(scan) ?? (() => {})
          } catch {}
          try {
            offWorkspaces = workspaces?.list?.subscribe?.(scan) ?? (() => {})
          } catch {}
          const interval = typeof window !== 'undefined' && typeof window.setInterval === 'function'
            ? window.setInterval(scan, ARCHIVE_TICK_MS)
            : 0
          scan()
          return () => {
            stopped = true
            try { offSessions() } catch {}
            try { offWorkspaces() } catch {}
            if (interval !== 0 && typeof window.clearInterval === 'function') {
              try { window.clearInterval(interval) } catch {}
            }
          }
        }, 'guide-panel: idle archive')
      },
      // Pure scheduling policy, exposed for tests only (no host access).
      __internals: { bandOf, delayForBand, nextHold, archiveVerdict, archiveDelay, shieldNoteFor, modelNoteFor },
    }
  },
})

window.__ModuleLoader__.load({
  id: '@local/dsh-guide-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'guideManager'

    const zh = {
      tab: '指导',
      title: '指导模式',
      subtitle: '六个组件的状态、依赖关系、兼容检查与安全开关/冷切换',
      refresh: '刷新',
      loading: '正在读取 Host 状态…',
      hostStale: '管理服务未加载：请确认 guide-manager 已在 Host 启动，或重启 DSH。',
      retry: '重试',
      readOnly: 'panel / sidebar 热切换；admission / shield / goal 先准备，重启 helper 后生效',
      updated: '更新时间',
      manager: '管理器',
      managerReady: '就绪',
      managerFallback: '降级读取',
      managerUnsupported: '不可用',
      managerLocked: '管理器自身受保护，不提供开关',
      release: '产品版本',
      host: '宿主',
      dsh: 'DSH',
      cordis: 'Cordis',
      betterSidebar: 'better-sidebar',
      build: '构建',
      verified: '已验证',
      unverified: '未验证',
      components: '组件',
      edges: '依赖与互斥',
      skills: '技能',
      warnings: '警告',
      version: '版本',
      contract: '契约',
      enabled: '启用',
      disabled: '禁用',
      fiber: '阶段',
      service: '服务',
      reason: '原因',
      open: '打开插件页',
      enable: '启用',
      disable: '停用',
      confirmEnable: '确认启用',
      confirmDisable: '确认停用',
      prepareEnable: '准备启用',
      prepareDisable: '准备停用',
      confirmPrepareEnable: '确认准备启用',
      confirmPrepareDisable: '确认准备停用',
      cancel: '取消',
      actionBusy: '处理中…',
      actionApplied: '已应用',
      actionRestart: '已保存，需要重启 DSH 生效',
      actionOverridden: '已保存，但被更高层配置覆盖',
      actionFailed: '操作失败',
      actionUnknown: '操作结果未知',
      restartRequired: '需要重启 DSH 后生效',
      pairedRestart: '需要与原 goal driver 成对切换',
      pendingRestart: '已准备，重启后生效',
      pendingCleared: '已取消准备',
      pendingBanner: '有已准备的冷切换。运行下面的 helper 后 DSH 会重启并应用：',
      pendingHint: '已准备',
      cancelPending: '取消准备',
      helper: 'helper',
      locked: '受保护，不提供开关',
      dependencyConflict: '依赖组件未就绪',
      gateBlocked: '兼容门禁未通过',
      gateWarning: '兼容警告',
      artifacts: '构建产物',
      notChecked: '未检查',
      updates: '更新与回滚',
      sourceUpdatePending: '源码已更新，重启加载后生效',
      noSourceChanges: '未检测到本地源码变更',
      reloadHelper: '双击 reload helper 重启加载；只停止 DeepSeek Harness',
      packageManagerUpdate: 'registry/tarball 包请在官方插件页更新',
      rollbackAvailable: '可回滚上次冷切换',
      rollbackHelper: '双击 rollback helper 恢复最近的 patch 备份并重启',
      noBackups: '暂无冷切换备份',
      blockedBy: '依赖',
      none: '—',
      optional: '可选',
      ready: '就绪',
      readyUnverified: '就绪（未验证组合）',
      degraded: '降级',
      unsupported: '不支持',
      failed: '失败',
      incompatible: '不兼容',
      missing: '未安装',
      unknown: '未知',
      inactive: '未启用',
      conflict: '冲突',
      native: '原生回退',
      blocked: '阻塞',
      optionalAbsent: '可选未装',
      componentPanel: '指导面板',
      componentAdmission: '准入控制',
      componentShield: '结算防护',
      componentPreset: '指导预设',
      componentSidebar: '任务页适配',
      componentGoal: 'goal 适配',
      skillMissing: 'guide skill 未安装',
      skillDisabled: '已被技能管理器禁用',
      dataMissing: '缺少 skills-guide 路由数据',
      manageSkills: '到「设置 → 技能」中安装或管理 guide skill。',
      hash: '哈希',
      data: '路由数据',
      dataSource: '数据来源',
      profile: 'profile',
      fallbackNote: '官方 pluginManager 不可用，当前使用 profile 清单降级读取；启用/阶段可能不完整。',
      noWarnings: '无',
    }

    const en = {
      tab: 'Guide',
      title: 'Guidance Mode',
      subtitle: 'Component status, compatibility checks, hot switches and staged cold changes',
      refresh: 'Refresh',
      loading: 'Reading Host state…',
      hostStale: 'Manager service is not loaded: confirm guide-manager started on the Host, or restart DSH.',
      retry: 'Retry',
      readOnly: 'panel/sidebar switch hot; admission/shield/goal stage a change for the restart helper',
      updated: 'Updated',
      manager: 'Manager',
      managerReady: 'Ready',
      managerFallback: 'Fallback',
      managerUnsupported: 'Unavailable',
      managerLocked: 'The manager itself is protected and has no switch',
      release: 'Product version',
      host: 'Host',
      dsh: 'DSH',
      cordis: 'Cordis',
      betterSidebar: 'better-sidebar',
      build: 'Build',
      verified: 'Verified',
      unverified: 'Unverified',
      components: 'Components',
      edges: 'Dependencies and exclusions',
      skills: 'Skills',
      warnings: 'Warnings',
      version: 'Version',
      contract: 'Contract',
      enabled: 'Enabled',
      disabled: 'Disabled',
      fiber: 'Fiber',
      service: 'Service',
      reason: 'Reason',
      open: 'Open plugin page',
      enable: 'Enable',
      disable: 'Disable',
      confirmEnable: 'Confirm enable',
      confirmDisable: 'Confirm disable',
      prepareEnable: 'Prepare enable',
      prepareDisable: 'Prepare disable',
      confirmPrepareEnable: 'Confirm prepare enable',
      confirmPrepareDisable: 'Confirm prepare disable',
      cancel: 'Cancel',
      actionBusy: 'Working…',
      actionApplied: 'Applied',
      actionRestart: 'Saved; restart DSH to apply',
      actionOverridden: 'Saved but overridden by a higher layer',
      actionFailed: 'Action failed',
      actionUnknown: 'Unknown action result',
      restartRequired: 'Restart DSH to apply',
      pairedRestart: 'Requires a paired goal-driver switch',
      pendingRestart: 'Prepared; applies after restart',
      pendingCleared: 'Preparation cancelled',
      pendingBanner: 'A cold change is staged. Run the helper below; it restarts DSH and applies it:',
      pendingHint: 'Prepared',
      cancelPending: 'Cancel preparation',
      helper: 'helper',
      locked: 'Protected; no switch',
      dependencyConflict: 'A required component is not ready',
      gateBlocked: 'Compatibility gate blocked',
      gateWarning: 'Compatibility warning',
      artifacts: 'Build artifacts',
      notChecked: 'Not checked',
      updates: 'Updates and rollback',
      sourceUpdatePending: 'Source changed; reload to apply',
      noSourceChanges: 'No local source changes detected',
      reloadHelper: 'Double-click the reload helper; it stops only DeepSeek Harness',
      packageManagerUpdate: 'Update registry/tarball packages on the official Plugins page',
      rollbackAvailable: 'Last cold switch can be rolled back',
      rollbackHelper: 'Double-click the rollback helper to restore the newest patch backup',
      noBackups: 'No cold-switch backup yet',
      blockedBy: 'Requirements',
      none: '—',
      optional: 'optional',
      ready: 'Ready',
      readyUnverified: 'Ready (unverified set)',
      degraded: 'Degraded',
      unsupported: 'Unsupported',
      failed: 'Failed',
      incompatible: 'Incompatible',
      missing: 'Missing',
      unknown: 'Unknown',
      inactive: 'Inactive',
      conflict: 'Conflict',
      native: 'Native fallback',
      blocked: 'Blocked',
      optionalAbsent: 'Optional, absent',
      componentPanel: 'Guide panel',
      componentAdmission: 'Admission',
      componentShield: 'Settlement shield',
      componentPreset: 'Guide preset',
      componentSidebar: 'Tasks page adapter',
      componentGoal: 'Goal adapter',
      skillMissing: 'guide skill is not installed',
      skillDisabled: 'Disabled by the skills manager',
      dataMissing: 'skills-guide routing data is missing',
      manageSkills: 'Install or manage the guide skill in Settings → Skills.',
      hash: 'Hash',
      data: 'Routing data',
      dataSource: 'Data source',
      profile: 'profile',
      fallbackNote: 'The official pluginManager is unavailable; this view falls back to the profile manifest, so enablement/fiber data may be incomplete.',
      noWarnings: 'None',
    }

    const STATUS_KEY = {
      ready: 'ready',
      'ready-unverified': 'readyUnverified',
      degraded: 'degraded',
      unsupported: 'unsupported',
      failed: 'failed',
      incompatible: 'incompatible',
      disabled: 'disabled',
      missing: 'missing',
      unknown: 'unknown',
      inactive: 'inactive',
      conflict: 'conflict',
      native: 'native',
      blocked: 'blocked',
      'optional-absent': 'optionalAbsent',
    }

    const STATUS_STYLE = {
      ready: { background: '#e6f4ea', color: '#1e6b3a' },
      'ready-unverified': { background: '#fff7e0', color: '#8a5a00' },
      degraded: { background: '#fff0e0', color: '#9a4a00' },
      unsupported: { background: '#fdecec', color: '#a61b1b' },
      failed: { background: '#fdecec', color: '#a61b1b' },
      incompatible: { background: '#fdecec', color: '#a61b1b' },
      disabled: { background: '#f2f3f5', color: '#5f6368' },
      missing: { background: '#f2f3f5', color: '#5f6368' },
      unknown: { background: '#f2f3f5', color: '#5f6368' },
      inactive: { background: '#f2f3f5', color: '#5f6368' },
      conflict: { background: '#fdecec', color: '#a61b1b' },
      native: { background: '#fff7e0', color: '#8a5a00' },
      blocked: { background: '#fdecec', color: '#a61b1b' },
      'optional-absent': { background: '#f2f3f5', color: '#5f6368' },
    }

    const COMPONENT_LABEL = {
      panel: 'componentPanel',
      admission: 'componentAdmission',
      shield: 'componentShield',
      preset: 'componentPreset',
      sidebar: 'componentSidebar',
      goal: 'componentGoal',
    }

    const S = {
      page: { display: 'flex', flexDirection: 'column', gap: 16, padding: '16px 18px 28px', color: 'var(--dsw-alias-label-primary, #1f2328)' },
      header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
      title: { margin: 0, fontSize: 18, lineHeight: '24px', fontWeight: 650 },
      subtitle: { margin: '4px 0 0', fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-secondary, #5f6368)' },
      button: { border: '1px solid var(--dsw-alias-hairline, #d0d7de)', background: 'var(--dsw-alias-bg-elevated, #fff)', color: 'var(--dsw-alias-label-primary, #1f2328)', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' },
      banner: { border: '1px solid #f0c36d', background: '#fff8e1', color: '#6d4c00', borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: '18px' },
      section: { display: 'flex', flexDirection: 'column', gap: 8 },
      sectionTitle: { margin: 0, fontSize: 13, lineHeight: '20px', fontWeight: 650 },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 10 },
      card: { border: '1px solid var(--dsw-alias-hairline, #d8dee4)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--dsw-alias-bg-elevated, #fff)' },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
      mono: { fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 10, lineHeight: '15px', color: 'var(--dsw-alias-label-secondary, #5f6368)', wordBreak: 'break-all' },
      kv: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, lineHeight: '18px' },
      key: { color: 'var(--dsw-alias-label-secondary, #5f6368)' },
      reason: { fontSize: 11, lineHeight: '16px', color: '#8a5a00', wordBreak: 'break-word' },
      linkButton: { alignSelf: 'flex-start', border: 0, background: 'transparent', color: '#0969da', padding: 0, fontSize: 12, cursor: 'pointer' },
      actionRow: { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
      actionButton: { border: '1px solid var(--dsw-alias-hairline, #d0d7de)', background: 'var(--dsw-alias-bg-elevated, #fff)', color: 'var(--dsw-alias-label-primary, #1f2328)', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer' },
      dangerButton: { border: '1px solid #d1242f', background: '#fff', color: '#b42318', borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer' },
      notice: { border: '1px solid #b7e1c1', background: '#eaf7ee', color: '#1e6b3a', borderRadius: 6, padding: '8px 10px', fontSize: 12, lineHeight: '18px' },
      noticeError: { border: '1px solid #f0b4b4', background: '#fff0f0', color: '#a61b1b' },
      edges: { display: 'flex', flexDirection: 'column', gap: 6 },
      edgeRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12, lineHeight: '18px' },
      warningList: { margin: 0, paddingLeft: 18, fontSize: 12, lineHeight: '18px', color: '#8a5a00' },
      footer: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary, #5f6368)' },
      skills: { border: '1px solid var(--dsw-alias-hairline, #d8dee4)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--dsw-alias-bg-elevated, #fff)' },
      note: { fontSize: 11, lineHeight: '16px', color: 'var(--dsw-alias-label-secondary, #5f6368)' },
    }

    const badgeBase = { display: 'inline-block', borderRadius: 999, padding: '1px 8px', fontSize: 11, lineHeight: '18px', fontWeight: 600, whiteSpace: 'nowrap' }

    function apiUrl() {
      return new URL('./guide-manager/api/state', window.document.baseURI).toString()
    }

    async function fetchState() {
      const options = { method: 'GET', headers: { accept: 'application/json' } }
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(8000)
      const response = await fetch(apiUrl(), options)
      const text = await response.text()
      let body = null
      try {
        body = text === '' ? null : JSON.parse(text)
      } catch {
        body = null
      }
      if (!response.ok || body === null || body.ok !== true) {
        if (response.status === 404 || response.status === 405) throw new Error('host-stale')
        const message = body?.error?.message
        throw new Error(typeof message === 'string' && message !== '' ? message : `HTTP ${response.status}`)
      }
      return body.value
    }

    async function postAction(component, enabled) {
      const options = {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'set-component-enabled', component, enabled, confirm: true }),
      }
      if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') options.signal = AbortSignal.timeout(15000)
      const response = await fetch(new URL('./guide-manager/api/action', window.document.baseURI).toString(), options)
      const text = await response.text()
      let body = null
      try {
        body = text === '' ? null : JSON.parse(text)
      } catch {
        body = null
      }
      if (!response.ok || body === null || body.ok !== true) {
        if (response.status === 404 || response.status === 405) throw new Error('host-stale')
        const error = body?.error
        const failure = new Error(typeof error?.message === 'string' && error.message !== '' ? error.message : `HTTP ${response.status}`)
        failure.code = error?.code ?? null
        failure.blockers = Array.isArray(error?.blockers) ? error.blockers : []
        throw failure
      }
      return body.value
    }

    function actionNotice(result, t) {
      const application = result?.application
      if (application === 'applied') return t('actionApplied')
      if (application === 'restart-required') return `${t('actionRestart')}${result?.restartReason ? ` (${result.restartReason})` : ''}`
      if (application === 'overridden') return t('actionOverridden')
      if (application === 'pending-restart') return `${t('pendingRestart')}${result?.helperPath ? ` · ${result.helperPath}` : ''}`
      if (application === 'pending-cleared') return t('pendingCleared')
      if (application === 'failed' || application === 'cancelled') {
        const detail = result?.error?.message ?? result?.error?.code ?? ''
        return detail === '' ? t('actionFailed') : `${t('actionFailed')}: ${detail}`
      }
      return t('actionUnknown')
    }

    function Badge({ status, t }) {
      const key = STATUS_KEY[status] ?? 'unknown'
      const style = STATUS_STYLE[status] ?? STATUS_STYLE.unknown
      return h('span', { style: { ...badgeBase, ...style } }, t(key))
    }

    function serviceLabel(state, t) {
      if (!state) return t('none')
      if (typeof state.mode === 'string') return state.mode
      if (state.supported === true) return t('ready')
      if (state.supported === false) return t('unsupported')
      return t('unknown')
    }

    function componentLabel(component, t) {
      const key = COMPONENT_LABEL[component.key]
      return key === undefined ? component.key : t(key)
    }

    function actionLockText(action, t) {
      if (action.reason === 'dependency-conflict') return t('dependencyConflict')
      if (action.reason === 'unsupported-sidebar-host') return t('unsupported')
      if (action.reason === 'not-installed') return t('missing')
      if (action.policy === 'restart-required') return t('restartRequired')
      if (action.policy === 'paired-restart') return t('pairedRestart')
      return t('locked')
    }

    function ComponentCard({ component, t, openPackage, confirming, busy, onAsk, onConfirm, onCancel }) {
      const serviceState = component.service?.state ?? null
      const phase = component.rows?.length
        ? [...new Set(component.rows.map((row) => row.fiberPhase ?? '—'))].join(', ')
        : t('none')
      const versionText = `${component.version ?? t('none')} / ${component.expectedVersion ?? t('none')}`
      const contractText = `${component.contract ?? t('none')} / ${component.expectedContract ?? t('none')}`
      const action = component.action ?? { policy: 'locked', reason: null, canToggle: false, kind: 'locked', blockers: [] }
      const enabled = typeof component.enabled === 'boolean' ? component.enabled : component.bundleEnabled === true
      const hotKind = action.kind === 'hot'
      const coldKind = action.kind === 'cold'
      const switchable = (hotKind || coldKind) && action.canToggle === true
      const actionText = hotKind
        ? enabled ? t('disable') : t('enable')
        : coldKind ? enabled ? t('prepareDisable') : t('prepareEnable')
          : actionLockText(action, t)
      const confirmText = hotKind
        ? enabled ? t('confirmDisable') : t('confirmEnable')
        : enabled ? t('confirmPrepareDisable') : t('confirmPrepareEnable')
      const pending = component.pending ?? null
      const gate = enabled ? action.gate?.disable : action.gate?.enable
      const blockers = Array.isArray(gate?.blockers) ? gate.blockers : Array.isArray(action.blockers) ? action.blockers : []
      const warnings = Array.isArray(gate?.warnings) ? gate.warnings : Array.isArray(action.warnings) ? action.warnings : []
      const blockerText = (item) => item.code === 'dependency'
        ? `${item.key} (${item.status})`
        : item.code === 'artifact-mismatch' ? `artifact:${item.name}` : item.code ?? 'blocked'
      const warningText = (item) => item.code === 'artifact-unknown' ? `artifact:${item.name}` : item.code ?? 'warning'
      return h('div', { style: S.card },
        h('div', { style: S.cardHead },
          h('strong', { style: { fontSize: 13 } }, componentLabel(component, t)),
          h(Badge, { status: component.status, t }),
        ),
        h('div', { style: S.mono }, component.package),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('version')), h('span', null, versionText)),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('contract')), h('span', null, contractText)),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('enabled')), h('span', null, enabled ? t('enabled') : t('disabled'))),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('fiber')), h('span', null, phase)),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('service')), h('span', null, serviceLabel(serviceState, t))),
        component.bundleError ? h('div', { style: S.reason }, `${t('reason')}: ${component.bundleError.code ?? component.bundleError.reason ?? 'bundle-error'}`) : null,
        component.reason ? h('div', { style: S.reason }, `${t('reason')}: ${component.reason}`) : null,
        component.update?.sourceChanged === true
          ? h('div', { style: S.reason }, t('sourceUpdatePending'))
          : null,
        pending
          ? h('div', { style: S.reason }, `${t('pendingHint')}: ${pending.enabled ? t('enable') : t('disable')} · ${t('pendingRestart')}`)
          : null,
        switchable
          ? (confirming
            ? h('div', { style: S.actionRow },
              h('button', {
                style: S.dangerButton,
                disabled: busy,
                onClick: () => onConfirm(component, !enabled),
              }, busy ? t('actionBusy') : confirmText),
              h('button', { style: S.actionButton, disabled: busy, onClick: onCancel }, t('cancel')),
            )
            : h('div', { style: S.actionRow },
              h('button', {
                style: S.actionButton,
                disabled: busy,
                onClick: () => onAsk(component),
              }, busy ? t('actionBusy') : actionText),
            ))
          : h('div', { style: S.note }, hotKind || coldKind
            ? `${t('gateBlocked')}${blockers.length > 0 ? `: ${blockers.map(blockerText).join(', ')}` : ''}`
            : `${actionText}${action.reason ? `: ${action.reason}` : ''}`),
        pending
          ? h('div', { style: S.actionRow },
            h('button', {
              style: S.actionButton,
              disabled: busy,
              onClick: () => onConfirm(component, enabled),
            }, t('cancelPending')),
          )
          : null,
        blockers.length > 0 && switchable
          ? h('div', { style: S.reason }, `${t('gateBlocked')}: ${blockers.map(blockerText).join(', ')}`)
          : null,
        warnings.length > 0
          ? h('div', { style: S.reason }, `${t('gateWarning')}: ${warnings.map(warningText).join(', ')}`)
          : null,
        typeof openPackage === 'function'
          ? h('button', {
            style: S.linkButton,
            'aria-label': `${t('open')} ${componentLabel(component, t)}`,
            onClick: () => openPackage(component.package),
          }, t('open'))
          : null,
      )
    }

    function EdgeRow({ edge, t }) {
      const target = typeof edge.to === 'string' && edge.to.startsWith('@') ? edge.to : componentLabel({ key: edge.to }, t)
      return h('div', { style: S.edgeRow },
        h('span', null, `${componentLabel({ key: edge.from }, t)} → ${target}`),
        edge.optional ? h('span', { style: S.note }, `(${t('optional')})`) : null,
        h(Badge, { status: edge.status, t }),
        edge.reason ? h('span', { style: S.reason }, edge.reason) : null,
      )
    }

    function SkillsCard({ skills, t }) {
      if (!skills) return null
      const data = skills.data
      return h('div', { style: S.skills },
        h('div', { style: S.cardHead },
          h('strong', { style: { fontSize: 13 } }, 'guide skill'),
          h(Badge, { status: skills.status, t }),
        ),
        h('div', { style: S.mono }, skills.path ?? t('none')),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('version')), h('span', null, skills.version ?? t('none'))),
        h('div', { style: S.kv }, h('span', { style: S.key }, t('data')), h('span', null,
          data?.present ? `${data.files} files / ${Math.round((data.bytes ?? 0) / 1024)} KB` : t('dataMissing'))),
        skills.hash ? h('div', { style: S.kv }, h('span', { style: S.key }, t('hash')), h('span', { style: S.mono }, skills.hash.slice(0, 16))) : null,
        skills.disabled === true ? h('div', { style: S.reason }, t('skillDisabled')) : null,
        skills.status === 'missing' ? h('div', { style: S.reason }, t('skillMissing')) : null,
        h('div', { style: S.note }, t('manageSkills')),
      )
    }

    function ManagerTab({ t, openPackage }) {
      const [state, setState] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [loading, setLoading] = React.useState(true)
      const [nonce, setNonce] = React.useState(0)
      const [confirming, setConfirming] = React.useState(null)
      const [busyKey, setBusyKey] = React.useState(null)
      const [notice, setNotice] = React.useState(null)
      const [noticeError, setNoticeError] = React.useState(false)

      React.useEffect(() => {
        let stopped = false
        let timer = 0
        async function run() {
          try {
            const value = await fetchState()
            if (stopped) return
            setState(value)
            setError(null)
          } catch (failure) {
            if (stopped) return
            setError(String(failure?.message ?? failure) === 'host-stale' ? t('hostStale') : String(failure?.message ?? failure))
          } finally {
            if (!stopped) setLoading(false)
          }
        }
        run()
        timer = window.setInterval(run, 10_000)
        return () => {
          stopped = true
          if (timer !== 0) window.clearInterval(timer)
        }
      }, [nonce, t])

      const refresh = () => {
        setLoading(true)
        setNonce((value) => value + 1)
      }

      const ask = (component) => {
        setConfirming(component.key)
        setNotice(null)
      }

      const cancel = () => {
        setConfirming(null)
      }

      const act = async (component, enabled) => {
        setBusyKey(component.key)
        setNotice(null)
        try {
          const result = await postAction(component.key, enabled)
          const failed = result?.application === 'failed' || result?.application === 'cancelled'
          setNotice(actionNotice(result, t))
          setNoticeError(failed)
          setConfirming(null)
          window.setTimeout(refresh, 600)
        } catch (failure) {
          const message = String(failure?.message ?? failure) === 'host-stale'
            ? t('hostStale')
            : `${t('actionFailed')}: ${failure?.message ?? failure}`
          setNotice(message)
          setNoticeError(true)
        } finally {
          setBusyKey(null)
        }
      }

      if (state === null && loading) {
        return h('div', { style: S.page }, h('div', { style: S.subtitle }, t('loading')))
      }
      if (state === null) {
        return h('div', { style: S.page },
          h('h2', { style: S.title }, t('title')),
          h('div', { style: S.banner }, error ?? t('hostStale')),
          h('div', null, h('button', { style: S.button, onClick: refresh }, t('retry'))),
        )
      }

      const manager = state.manager ?? {}
      const host = state.host ?? {}
      const managerKey = manager.mode === 'ready' ? 'managerReady' : manager.mode === 'fallback' ? 'managerFallback' : 'managerUnsupported'
      const hostLine = [
        `${t('dsh')} ${host.dsh?.actual ?? t('none')}`,
        `${t('cordis')} ${host.cordis?.actual ?? t('none')}`,
        `${t('betterSidebar')} ${host.betterSidebar?.actual ?? t('none')}`,
      ].join(' · ')
      const changedSources = (state.components ?? []).filter((component) => component.update?.sourceChanged === true)
      const packageUpdates = (state.components ?? []).filter((component) => component.update?.mode === 'package-manager')
      const backups = state.backups ?? { count: 0, latest: null }

      return h('div', { style: S.page },
        h('div', { style: S.header },
          h('div', null,
            h('h2', { style: S.title }, t('title')),
            h('div', { style: S.subtitle }, t('subtitle')),
          ),
          h('button', { style: S.button, onClick: refresh }, loading ? t('loading') : t('refresh')),
        ),
        error ? h('div', { style: S.banner }, error) : null,
        notice ? h('div', { style: { ...S.notice, ...(noticeError ? S.noticeError : {}) } }, notice) : null,
        state.pending?.present
          ? h('div', { style: S.notice },
            h('div', null, t('pendingBanner')),
            h('div', { style: S.mono }, state.pending.helper ?? t('none')),
          )
          : null,
        state.pending?.error ? h('div', { style: S.banner }, `pending: ${state.pending.error}`) : null,
        h('div', { style: S.card },
          h('div', { style: S.cardHead },
            h('strong', null, t('manager')),
            h('span', { style: { ...badgeBase, ...(manager.mode === 'ready' ? STATUS_STYLE.ready : manager.mode === 'fallback' ? STATUS_STYLE['ready-unverified'] : STATUS_STYLE.unsupported) } }, t(managerKey)),
          ),
          h('div', { style: S.kv }, h('span', { style: S.key }, t('release')), h('span', null, state.release ?? t('none'))),
          h('div', { style: S.kv }, h('span', { style: S.key }, t('host')), h('span', null, hostLine)),
          h('div', { style: S.kv }, h('span', { style: S.key }, t('verified')), h('span', null, host.verified === true ? t('verified') : t('unverified'))),
          h('div', { style: S.kv }, h('span', { style: S.key }, t('artifacts')), h('span', null,
            host.artifacts?.checked !== true ? t('notChecked') : host.artifacts.verified === true ? t('verified') : t('unverified'))),
          h('div', { style: S.kv }, h('span', { style: S.key }, t('dataSource')), h('span', null, state.dataSource ?? t('none'))),
          manager.reason ? h('div', { style: S.reason }, `${t('reason')}: ${manager.reason}`) : null,
          h('div', { style: S.note }, t('managerLocked')),
          state.dataSource === 'profile-fallback' ? h('div', { style: S.note }, t('fallbackNote')) : null,
        ),
        h('section', { style: S.section },
          h('h3', { style: S.sectionTitle }, t('components')),
          h('div', { style: S.grid }, (state.components ?? []).map((component) => h(ComponentCard, {
            key: component.key,
            component,
            t,
            openPackage,
            confirming: confirming === component.key,
            busy: busyKey === component.key,
            onAsk: ask,
            onConfirm: act,
            onCancel: cancel,
          }))),
        ),
        h('section', { style: S.section },
          h('h3', { style: S.sectionTitle }, t('updates')),
          h('div', { style: S.card },
            changedSources.length > 0
              ? h('div', { style: S.notice }, `${t('sourceUpdatePending')}: ${changedSources.map((component) => componentLabel(component, t)).join(', ')}`)
              : h('div', { style: S.note }, t('noSourceChanges')),
            state.helper?.reload ? h('div', { style: S.mono }, state.helper.reload) : null,
            h('div', { style: S.note }, t('reloadHelper')),
            packageUpdates.length > 0
              ? h('div', { style: S.note }, `${t('packageManagerUpdate')}: ${packageUpdates.map((component) => componentLabel(component, t)).join(', ')}`)
              : null,
            backups.count > 0
              ? h('div', { style: S.notice }, `${t('rollbackAvailable')} (${backups.count})`)
              : h('div', { style: S.note }, t('noBackups')),
            backups.count > 0 && state.helper?.rollback ? h('div', { style: S.mono }, state.helper.rollback) : null,
            backups.count > 0 ? h('div', { style: S.note }, t('rollbackHelper')) : null,
          ),
        ),
        h('section', { style: S.section },
          h('h3', { style: S.sectionTitle }, t('edges')),
          h('div', { style: S.edges }, (state.edges ?? []).map((edge) => h(EdgeRow, { key: `${edge.from}->${edge.to}`, edge, t }))),
        ),
        h('section', { style: S.section },
          h('h3', { style: S.sectionTitle }, t('skills')),
          h(SkillsCard, { skills: state.skills, t }),
        ),
        state.warnings?.length
          ? h('section', { style: S.section },
            h('h3', { style: S.sectionTitle }, t('warnings')),
            h('ul', { style: S.warningList }, state.warnings.map((warning) => h('li', { key: warning }, warning))),
          )
          : null,
        h('div', { style: S.footer }, `${t('updated')}: ${new Date(state.generatedAt).toLocaleString()} · ${t('readOnly')}`),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        const offZh = ctx.locale.register(NS, 'zh', zh)
        const offEn = ctx.locale.register(NS, 'en', en)
        const offSlot = ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab',
          id: 'guide-manager',
          order: 10,
          label: () => t('tab'),
          locale: NS,
        }, (owner = {}) => h(ManagerTab, { ...owner, t })))
        ctx.effect(() => () => {
          try {
            offSlot?.()
          } catch {}
          offZh()
          offEn()
        }, 'guide-manager: Plugins tab and locale')
      },
    }
  },
})

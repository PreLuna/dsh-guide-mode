window.__ModuleLoader__.load({
  id: '@local/dsh-guide-manager',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'guideManager'

    const zh = {
      sourceTitle: '远端发布来源', sourceMissing: '发布来源不可用，请检查管理器的仓库配置。私有来源另需本机下载凭据。',
      sourcePublic: '公开来源，无需登录或配置 token',
      installRemoteHint: '可从上方远端发布来源下载并准备安装。本地区域也支持维护者提供的发布目录。',
      sourceCheck: '检查更新', sourceInstall: '安装缺失组件', sourceUpgrade: '升级已装组件', sourceManager: '升级管理器',
      sourcePrepare: '下载并准备', sourceCancel: '取消下载任务', sourceRetry: '重试任务', sourcePlan: '预览已准备计划', sourceConfirm: '确认准备执行',
      sourceChecking: '正在检查发布版本…', sourceDownloading: '正在下载并校验', sourceReady: '包已准备，尚未安装。请预览计划并确认。',
      sourceStaged: '已准备执行。保存工作后运行助手；重启后核对运行状态。', sourceEmpty: '该仓库暂无稳定的指导模式发布。',
      sourceHandedOff: '包操作已提交，请查看下方安装或维护结果。',
      sourceCompatible: '所选版本没有匹配当前宿主的兼容组合，请调整目标版本。', sourcePrevious: '发布清单缺少当前已装版本，无法准备可恢复的升级。',
      sourceHostUnverified: '宿主版本或产物尚未完整核实',
      sourceCancelled: '任务已取消，可重新准备。', sourceInterrupted: '上次任务已中断，请重试。', sourceFailed: '任务未完成，请检查来源配置或稍后重试。',
      sourceAuth: '仓库访问未获授权，请检查本机只读下载凭据及仓库权限。', sourceNotFound: '仓库或发布不存在，或当前凭据无权访问。',
      sourceRate: 'GitHub 请求额度已用尽，请稍后重试。', sourceNetwork: '网络连接失败或超时，请重试。', sourceIntegrity: '包完整性校验失败，未进入安装。',
      sourceStale: '配置或安装状态已变化，请重新准备并预览。', sourceBusy: '已有任务或包操作待处理，请先完成或取消。',
      sourceHint: '下载不会自动安装。确认后使用下方助手执行；开发 link 保持原状。', sourceBlocked: '当前计划无法执行', sourceLink: '当前来源为开发 link 或尚未固定到包缓存，需要先迁移来源。',
      tab: '指导',
      title: '指导模式',
      subtitle: '安装组件、检查兼容性与管理指导模式',
      installTitle: '安装组件',
      maintenanceTitle: '卸载、修复与管理器升级',
      maintenanceHint: '修复重新安装缓存中的原版本并保留配置；卸载检查依赖并保留会话数据。preset 受保护，卸载 goal 会恢复原生驱动。',
      maintenanceRepair: '预览原版本修复',
      maintenanceUninstall: '预览卸载',
      maintenanceManager: '预览管理器升级',
      maintenanceConfirm: '确认准备维护',
      maintenanceCancel: '取消维护准备',
      maintenancePending: '维护已准备，保存工作后运行以下外部助手：',
      maintenanceExternal: '外部依赖单独管理：guide skill → 技能管理器；技能管理器和 better-sidebar → 官方插件页。组件卸载不会删除它们。',
      maintenanceManagerHint: '管理器使用可信本地发布目录；开发 link 请继续使用重载。升级前会保存独立恢复入口，恢复时原包来源固定到本 profile 的缓存。',
      maintenanceRecovery: '面板不可用时，在 PowerShell 运行此恢复命令：',
      maintenanceRepairExternal: '组件损坏导致插件页无法启动时，可从 PowerShell 修复（把 panel 换为目标组件）：',
      maintenanceVerified: '维护后运行就绪',
      maintenanceAwaiting: '维护完成，等待重启核对',
      maintenanceFailed: '维护失败，操作前版本和配置已恢复',
      maintenanceWorking: '维护执行中',
      maintenanceInterrupted: '维护中断或依赖恢复失败，请检查回执和备份',
      installHint: '先预览所需组件，再准备安装。运行安装助手后会关闭并重启目标 DSH 实例。已有组件的升级请使用下方升级区。',
      installHistory: '首次安装记录；后续版本变更见升级与恢复区',
      packageTitle: '组件升级与包版本恢复',
      packageHint: '按兼容组合预览联动升级，保存旧包和配置后冷更新。只支持无数据迁移的本地发布包；开发 link 保持不变。',
      packageCatalogMissing: '升级发布目录不可用；已有事务仍可从备份恢复。',
      packageUpgrade: '升级',
      packageRestore: '恢复',
      packagePreview: '预览组件升级',
      packageConfirm: '确认准备升级',
      packageRestorePreview: '预览包版本恢复',
      packageRestoreConfirm: '确认准备恢复',
      packageCancel: '取消版本操作准备',
      packagePending: '版本操作已准备，保存工作后运行：',
      packageAwaiting: '包版本已更新，等待重启核对',
      packageVerified: '版本操作后运行就绪',
      packageFailed: '操作失败，原版本和配置已恢复',
      packageRecovery: '版本恢复需要人工处理，请查看回执和备份',
      packageNoTransactions: '暂无可恢复的升级事务',
      installCatalogMissing: '尚未配置可安装的发布包，请先配置本地发布目录。',
      installRecommended: '预览推荐组合',
      installSelected: '预览所选组件',
      installConfirm: '确认准备安装',
      installRetain: '保留现有版本',
      installAdd: '安装',
      installPending: '安装已准备。保存当前工作后，运行下面的安装助手：',
      installCancel: '取消安装准备',
      installResult: '上次安装',
      installRunning: '正在安装',
      installAwaiting: '安装完成，等待重启核对',
      installVerified: '重启后组件已就绪',
      installHealthFailed: '重启后检查未通过，请查看组件状态',
      installRestored: '安装失败，已恢复原依赖与配置，可重新预览后重试',
      installRecovery: '依赖恢复未完成，请按回执中的备份路径修复',
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
      packageManagerUpdate: '不在升级发布目录中的包，请在官方插件页更新',
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
      skillsManager: '技能管理器',
      openSkills: '打开设置 → 技能',
      skillManagerMissing: '未安装技能管理器；可将 guide 目录放入 $DSH_HOME/skills/guide，或安装 @michengai/dsh-skills-manager。',
      skillsManagerHint: '打开技能管理器，或到设置 → 技能。',
      skillNotReady: 'guide skill 未就绪',
      hash: '哈希',
      data: '路由数据',
      dataSource: '数据来源',
      profile: 'profile',
      fallbackNote: '官方 pluginManager 不可用，当前使用 profile 清单降级读取；启用/阶段可能不完整。',
      noWarnings: '无',
    }

    const en = {
      sourceTitle: 'Remote release source', sourceMissing: 'Release source unavailable. Check manager repository settings. Private sources also require local credentials.',
      sourcePublic: 'Public source; no sign-in or token required',
      installRemoteHint: 'Download and prepare from the remote source above. This area also supports maintainer-provided local catalogs.',
      sourceCheck: 'Check for updates', sourceInstall: 'Install missing components', sourceUpgrade: 'Upgrade installed components', sourceManager: 'Upgrade manager',
      sourcePrepare: 'Download and prepare', sourceCancel: 'Cancel download task', sourceRetry: 'Retry task', sourcePlan: 'Preview prepared plan', sourceConfirm: 'Confirm execution preparation',
      sourceChecking: 'Checking releases…', sourceDownloading: 'Downloading and verifying', sourceReady: 'Packages prepared, not installed. Preview and confirm the plan.',
      sourceStaged: 'Execution prepared. Save your work and run the helper; verify after restart.', sourceEmpty: 'No stable guidance-mode release is available in this repository.',
      sourceHandedOff: 'Package operation submitted. See the installation or maintenance result below.',
      sourceCompatible: 'No compatible combination matches the selected versions and current host. Adjust target versions.', sourcePrevious: 'The release catalog lacks an installed version required for recoverable upgrades.',
      sourceHostUnverified: 'Host versions or artifacts are not fully verified',
      sourceCancelled: 'Task cancelled. You can prepare again.', sourceInterrupted: 'The previous task was interrupted. Retry it.', sourceFailed: 'Task did not complete. Check source settings or retry later.',
      sourceAuth: 'Repository access was not authorized. Check local read-only credentials and repository permissions.', sourceNotFound: 'Repository or release is missing, or credentials cannot access it.',
      sourceRate: 'GitHub request limit reached. Retry later.', sourceNetwork: 'Network failure or timeout. Please retry.', sourceIntegrity: 'Package integrity verification failed; installation was not started.',
      sourceStale: 'Configuration or installation changed. Prepare and preview again.', sourceBusy: 'Another task or package operation needs attention first.',
      sourceHint: 'Downloading does not install packages. Confirm the plan, then run the helper below. Development links remain unchanged.', sourceBlocked: 'This plan cannot execute', sourceLink: 'The current source is a development link or is not pinned to the package cache. Source migration is required.',
      tab: 'Guide',
      title: 'Guidance Mode',
      subtitle: 'Install components, check compatibility and manage guidance mode',
      installTitle: 'Install components',
      maintenanceTitle: 'Uninstall, repair and manager updates',
      maintenanceHint: 'Repair reinstalls the cached original version and preserves configuration. Uninstall checks dependents and preserves sessions. The preset is protected; removing goal restores the native driver.',
      maintenanceRepair: 'Preview original-version repair',
      maintenanceUninstall: 'Preview uninstall',
      maintenanceManager: 'Preview manager update',
      maintenanceConfirm: 'Confirm maintenance preparation',
      maintenanceCancel: 'Cancel maintenance preparation',
      maintenancePending: 'Maintenance prepared. Save your work and run this external helper:',
      maintenanceExternal: 'External dependencies: manage the guide skill in Skills; manage Skills Manager and better-sidebar in official Plugins. Component uninstall preserves them.',
      maintenanceManagerHint: 'Manager updates use a trusted local catalog. Development links use reload. An independent recovery entry is saved before updating; recovery pins the old package to this profile cache.',
      maintenanceRecovery: 'If the panel cannot open, run this recovery command in PowerShell:',
      maintenanceRepairExternal: 'If a damaged component prevents the Plugins page from opening, repair from PowerShell (replace panel with the target component):',
      maintenanceVerified: 'Running after maintenance',
      maintenanceAwaiting: 'Maintenance completed; restart verification pending',
      maintenanceFailed: 'Maintenance failed; prior packages and configuration restored',
      maintenanceWorking: 'Maintenance in progress',
      maintenanceInterrupted: 'Maintenance interrupted or dependency recovery failed; inspect receipt and backup',
      installHint: 'Preview dependencies, then prepare installation. The helper restarts the target DSH instance. Use the section below for existing component upgrades.',
      installHistory: 'Initial installation history; see package operations for subsequent versions',
      packageTitle: 'Component upgrades and package recovery',
      packageHint: 'Preview the compatible version combination, then cold-update with old packages and configuration backed up. Local releases without data migrations only; development links are retained.',
      packageCatalogMissing: 'Upgrade catalog unavailable; existing transactions can still be restored.',
      packageUpgrade: 'Upgrade',
      packageRestore: 'Restore',
      packagePreview: 'Preview component upgrade',
      packageConfirm: 'Confirm upgrade preparation',
      packageRestorePreview: 'Preview package recovery',
      packageRestoreConfirm: 'Confirm recovery preparation',
      packageCancel: 'Cancel package preparation',
      packagePending: 'Package operation prepared. Save your work, then run:',
      packageAwaiting: 'Package files updated; awaiting restart verification',
      packageVerified: 'Package operation verified after restart',
      packageFailed: 'Operation failed; previous versions and configuration restored',
      packageRecovery: 'Package recovery needs attention; inspect the receipt and backup',
      packageNoTransactions: 'No restorable upgrade transactions',
      installCatalogMissing: 'No installable release is configured. Configure a local release catalog first.',
      installRecommended: 'Preview recommended set',
      installSelected: 'Preview selection',
      installConfirm: 'Confirm preparation',
      installRetain: 'Retain existing version',
      installAdd: 'Install',
      installPending: 'Installation is prepared. Save your work, then run this helper:',
      installCancel: 'Cancel preparation',
      installResult: 'Last installation',
      installRunning: 'Installing',
      installAwaiting: 'Installed; awaiting restart verification',
      installVerified: 'Components are ready after restart',
      installHealthFailed: 'Restart verification failed; inspect component status',
      installRestored: 'Installation failed; original dependencies and configuration restored. Preview again to retry.',
      installRecovery: 'Dependency recovery needs attention; see the receipt and backup path.',
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
      packageManagerUpdate: 'Use the official Plugins page for packages outside the upgrade catalog',
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
      skillsManager: 'Skills manager',
      openSkills: 'Open Settings → Skills',
      skillManagerMissing: 'Skills manager is not installed; place guide in $DSH_HOME/skills/guide or install @michengai/dsh-skills-manager.',
      skillsManagerHint: 'Open the skills manager, or go to Settings → Skills.',
      skillNotReady: 'guide skill is not ready',
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

    async function installRequest(action, payload, group = 'install') {
      const response = await fetch(new URL(`./guide-manager/api/${group}/${action}`, window.document.baseURI).toString(), {
        method: 'POST',
        headers: { accept: 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok || body?.ok !== true) throw new Error(body?.error?.message ?? `HTTP ${response.status}`)
      return body.value
    }

    function sourceError(code, t) {
      if (/http-401|http-403/.test(code ?? '')) return t('sourceAuth')
      if (/http-404|public-release-unavailable/.test(code ?? '')) return t('sourceNotFound')
      if (/rate-limited/.test(code ?? '')) return t('sourceRate')
      if (/network|timeout|download-interrupted/.test(code ?? '')) return t('sourceNetwork')
      if (/integrity|cache-invalid|package-mismatch/.test(code ?? '')) return t('sourceIntegrity')
      if (/no-compatible-target/.test(code ?? '')) return t('sourceCompatible')
      if (/previous-version-unavailable/.test(code ?? '')) return t('sourcePrevious')
      if (/stale|changed/.test(code ?? '')) return t('sourceStale')
      if (/busy|conflict|operation-refused/.test(code ?? '')) return t('sourceBusy')
      return t('sourceFailed')
    }

    function SourceCard({ distribution, state, t, onChanged }) {
      const [kind, setKind] = React.useState('install')
      const [selected, setSelected] = React.useState(['preset', 'shield', 'admission', 'panel', 'sidebar', 'goal'])
      const [targets, setTargets] = React.useState({})
      const [managerVersion, setManagerVersion] = React.useState('')
      const [plan, setPlan] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      const task = distribution?.task, catalog = distribution?.catalog
      React.useEffect(() => {
        if (task?.kind !== 'prepare' || !task.payload) return
        const payload = task.payload
        setKind(payload.kind)
        if (Array.isArray(payload.components)) setSelected(payload.components)
        if (Array.isArray(payload.targets)) setTargets(Object.fromEntries(payload.targets.map(({ key, version }) => [key, version])))
        if (typeof payload.version === 'string') setManagerVersion(payload.version)
        setPlan(null)
      }, [task?.id])
      if (!distribution) return null
      const running = task?.status === 'running'
      const pending = state.installation?.pending || state.packageManagement?.pending || state.maintenance?.pending || state.pending?.present
      const locked = busy || running || !!pending
      const available = (state.components ?? []).filter((item) => kind === 'install' ? !item.installed : item.installed)
      const versions = (key) => [...new Set((catalog?.versions ?? []).filter((item) => item.key === key).map((item) => item.version))]
      const selectedTargets = available.filter((item) => targets[item.key] && targets[item.key] !== item.version).map((item) => ({ key: item.key, version: targets[item.key] }))
      const payload = { kind, snapshotId: catalog?.snapshotId,
        ...(kind === 'install' ? { components: available.filter((item) => selected.includes(item.key)).map((item) => item.key) }
          : kind === 'upgrade' ? { targets: selectedTargets } : { version: managerVersion }) }
      const empty = kind === 'install' ? !payload.components.length : kind === 'upgrade' ? !selectedTargets.length : !managerVersion || managerVersion === state.manager?.version
      const request = async (action, body) => {
        setBusy(true); setError(null)
        try {
          const value = await installRequest(action, body, 'source')
          setPlan(action === 'plan' ? { ...value, taskId: task.id } : null)
          if (action !== 'plan') onChanged()
        } catch (failure) { setError(sourceError(String(failure.message ?? failure), t)) }
        finally { setBusy(false) }
      }
      const helper = state.maintenance?.pending ? state.maintenance.helperCommand : state.packageManagement?.pending ? state.packageManagement.helperCommand : state.installation?.pending ? state.installation.helperCommand : null
      return h('section', { style: S.section, 'data-guide-source': true },
        h('h3', { style: S.sectionTitle }, t('sourceTitle')),
        h('div', { style: S.card },
          !distribution.configured ? h('div', { style: S.note }, t('sourceMissing')) : h('div', null,
            h('div', { style: S.kv }, `${distribution.repository.owner}/${distribution.repository.repo}`),
            distribution.access === 'public' ? h('div', { style: S.note }, t('sourcePublic')) : null,
            h('div', { style: S.note }, t('sourceHint')),
            h('button', { style: S.actionButton, disabled: locked, onClick: () => request('check', {}) }, t('sourceCheck')),
            catalog ? h('div', null,
              h('div', { style: S.note }, `${catalog.release.tag}${catalog.release.commit ? ` · ${catalog.release.commit.slice(0, 12)}` : ''}`),
              h('select', { 'aria-label': 'source-operation', value: kind, disabled: locked, onChange: (e) => { setKind(e.target.value); setPlan(null) } },
                ['install', 'upgrade', 'manager-upgrade'].map((value) => h('option', { key: value, value }, t(value === 'install' ? 'sourceInstall' : value === 'upgrade' ? 'sourceUpgrade' : 'sourceManager')))),
              kind === 'install' ? available.map((item) => h('label', { key: item.key, style: { ...S.kv, justifyContent: 'flex-start', gap: 8 } },
                h('input', { type: 'checkbox', 'data-guide-source-key': item.key, checked: selected.includes(item.key), disabled: locked, onChange: (e) => { setSelected(e.target.checked ? [...selected, item.key] : selected.filter((key) => key !== item.key)); setPlan(null) } }), componentLabel(item, t)))
                : kind === 'upgrade' ? available.map((item) => h('label', { key: item.key, style: S.kv }, componentLabel(item, t),
                  h('select', { 'aria-label': `source-target-${item.key}`, value: targets[item.key] ?? item.version, disabled: locked, onChange: (e) => { setTargets({ ...targets, [item.key]: e.target.value }); setPlan(null) } },
                    [...new Set([item.version, ...versions(item.key)])].map((v) => h('option', { key: v, value: v }, v)))))
                  : h('select', { 'aria-label': 'source-manager-version', value: managerVersion, disabled: locked, onChange: (e) => { setManagerVersion(e.target.value); setPlan(null) } },
                    h('option', { value: '' }, '—'), versions('manager').map((v) => h('option', { key: v, value: v }, v))),
              h('button', { style: S.actionButton, disabled: locked || empty, onClick: () => request('prepare', payload) }, t('sourcePrepare')),
            ) : null,
            task ? h('div', { 'data-guide-source-task': true },
              running ? h('div', { role: 'status', style: S.note }, t(task.kind === 'check' ? 'sourceChecking' : 'sourceDownloading'),
                ` ${task.progress?.completed ?? 0}/${task.progress?.total ?? 0}`, task.progress?.bytes ? ` · ${Math.ceil(task.progress.bytes / 1024)} KB` : '') : null,
              running ? h('button', { style: S.actionButton, disabled: busy, onClick: () => request('cancel', { taskId: task.id }) }, t('sourceCancel')) : null,
              task.status === 'ready' && task.kind === 'check' && task.result?.available === false ? h('div', { style: S.note }, t('sourceEmpty')) : null,
              task.status === 'ready' && task.kind === 'prepare' && !pending ? h('div', null,
                h('div', { style: S.notice }, t('sourceReady')),
                h('button', { style: S.actionButton, disabled: busy, onClick: () => request('plan', { taskId: task.id }) }, t('sourcePlan'))) : null,
              ['failed', 'cancelled', 'interrupted'].includes(task.status) ? h('div', null,
                h('div', { role: task.status === 'failed' ? 'alert' : 'status', style: S.reason }, task.status === 'failed' ? sourceError(task.error, t) : t(task.status === 'cancelled' ? 'sourceCancelled' : 'sourceInterrupted')),
                h('button', { style: S.actionButton, disabled: locked, onClick: () => request(task.kind === 'check' ? 'check' : 'prepare', task.kind === 'check' ? {} : task.payload) }, t('sourceRetry'))) : null,
              task.status === 'staged' || pending ? h('div', { style: S.notice }, t(pending ? 'sourceStaged' : 'sourceHandedOff')) : null,
            ) : null,
            plan && plan.taskId === task?.id && !pending ? h('div', null,
              h('ul', null, plan.entries.map((entry) => h('li', { key: entry.key }, `${entry.package}: ${entry.previous?.version ? `${entry.previous.version} → ` : ''}${entry.version}`))),
              plan.warnings?.length ? h('div', { style: S.note }, `${t('gateWarning')}: ${plan.warnings.map((warning) => warning === 'guide-skill-not-ready' ? t('skillNotReady') : warning === 'host-not-fully-verified' ? t('sourceHostUnverified') : warning).join(', ')}`) : null,
              plan.blockers?.length ? h('div', { style: S.reason, role: 'alert' }, t('sourceBlocked'), ': ', plan.blockers.some((b) => /link|source-not-pinned|managed-tarball/.test(b)) ? t('sourceLink') : plan.blockers.join(', ')) : null,
              h('button', { style: S.actionButton, disabled: locked || plan.blockers?.length > 0, onClick: () => request('stage', { taskId: plan.taskId, planId: plan.id, confirm: true }) }, t('sourceConfirm'))) : null,
            helper ? h('div', { style: S.mono }, helper) : null,
            state.maintenance?.pending?.kind === 'manager-upgrade' && state.maintenance.recoveryCommand ? h('div', null, h('div', { style: S.note }, t('maintenanceRecovery')), h('div', { style: S.mono }, state.maintenance.recoveryCommand)) : null,
          ),
          error ? h('div', { style: S.reason, role: 'alert' }, error) : null,
        ),
      )
    }

    function InstallationCard({ installation, components, remoteAvailable, t, onChanged }) {
      const [selected, setSelected] = React.useState(['preset', 'shield', 'admission', 'panel', 'sidebar', 'goal'])
      const [plan, setPlan] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      if (!installation) return null
      const pending = installation.pending
      const result = installation.result
      const request = async (action, payload) => {
        setBusy(true)
        setError(null)
        try {
          const value = await installRequest(action, payload)
          if (action === 'plan') setPlan(value)
          else { setPlan(null); onChanged() }
        } catch (failure) { setError(String(failure.message ?? failure)) }
        finally { setBusy(false) }
      }
      const outcome = installation.verification === 'superseded' ? 'installHistory'
        : installation.verification === 'interrupted' ? 'installRecovery'
        : installation.verification === 'verified-running' ? 'installVerified'
        : installation.verification === 'restart-health-check-failed' ? 'installHealthFailed'
          : result?.status === 'installed-awaiting-restart' ? 'installAwaiting'
            : result?.status === 'installing' ? 'installRunning'
              : result?.status === 'failed-restored' ? 'installRestored' : 'installRecovery'
      return h('section', { style: S.section, 'data-guide-installation': true },
        h('h3', { style: S.sectionTitle }, t('installTitle')),
        h('div', { style: S.card },
          h('div', { style: S.note }, t('installHint')),
          !installation.catalog?.available ? h('div', { style: S.reason }, t(remoteAvailable ? 'installRemoteHint' : 'installCatalogMissing')) : null,
          installation.catalog?.available && !pending ? h('div', null,
            h('div', { style: S.actionRow }, components.map((component) => h('label', { key: component.key, style: S.note },
              h('input', { type: 'checkbox', checked: selected.includes(component.key), disabled: busy,
                onChange: (event) => { setSelected(event.target.checked ? [...selected, component.key] : selected.filter((key) => key !== component.key)); setPlan(null) } }),
              componentLabel(component, t),
            ))),
            h('div', { style: S.actionRow },
              h('button', { style: S.actionButton, disabled: busy || selected.length === 0, onClick: () => request('plan', { components: selected }) }, t('installSelected')),
              h('button', { style: S.actionButton, disabled: busy, onClick: () => request('plan', { components: ['preset', 'shield', 'admission', 'panel', 'sidebar', 'goal'] }) }, t('installRecommended')),
            ),
          ) : null,
          plan && !pending ? h('div', null,
            h('ul', { style: S.warningList }, plan.entries.map((entry) => h('li', { key: entry.key }, `${entry.package}@${entry.version} · ${t(entry.action === 'install' ? 'installAdd' : 'installRetain')}`))),
            plan.blockers?.length ? h('div', { style: S.reason }, `${t('gateBlocked')}: ${plan.blockers.join(', ')}`) : null,
            plan.warnings?.length ? h('div', { style: S.reason }, `${t('gateWarning')}: ${plan.warnings.join(', ')}`) : null,
            h('button', { style: S.actionButton, disabled: busy || plan.blockers?.length > 0 || !plan.entries.some((entry) => entry.action === 'install'),
              onClick: () => request('stage', { components: plan.requested, planId: plan.id, confirm: true }) }, t('installConfirm')),
          ) : null,
          pending ? h('div', null,
            h('div', { style: S.notice }, t('installPending')),
            h('ul', { style: S.warningList }, (pending.entries ?? []).map((entry) => h('li', { key: entry.key }, `${entry.package}@${entry.version} · ${t(entry.action === 'install' ? 'installAdd' : 'installRetain')}`))),
            h('div', { style: S.mono }, installation.helperCommand ?? installation.helper),
            h('button', { style: S.actionButton, disabled: busy || result?.status === 'installing', onClick: () => request('cancel', { planId: pending.id, confirm: true }) }, t('installCancel')),
          ) : null,
          result ? h('div', { style: S.note }, `${t('installResult')}: ${t(outcome)}`) : null,
          result?.error ? h('div', { style: S.reason }, result.error) : null,
          result?.recoveryError ? h('div', { style: S.reason }, `${result.recoveryError} · ${result.backup}`) : null,
          error ? h('div', { style: S.reason, role: 'alert' }, error) : null,
        ),
      )
    }

    function MaintenanceCard({ maintenance, components, t, onChanged, onOpenSkills }) {
      const [selected, setSelected] = React.useState([])
      const [version, setVersion] = React.useState('')
      const [plan, setPlan] = React.useState(null)
      const [error, setError] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      if (!maintenance) return null
      const pending = maintenance.pending
      const request = async (action, payload) => {
        setBusy(true); setError(null)
        try {
          const value = await installRequest(action, payload, 'maintenance')
          if (action === 'plan') setPlan(value)
          else { setPlan(null); onChanged() }
        } catch (failure) { setError(String(failure.message ?? failure)) }
        finally { setBusy(false) }
      }
      return h('section', { style: S.section, 'data-guide-maintenance': true },
        h('h3', { style: S.sectionTitle }, t('maintenanceTitle')),
        h('div', { style: S.card },
          h('div', { style: S.note }, t('maintenanceHint')),
          !pending ? h('div', null,
            ...components.filter((item) => item.installed).map((item) => h('label', { key: item.key, style: { ...S.kv, justifyContent: 'flex-start', gap: 8 } },
              h('input', { type: 'checkbox', 'data-guide-maintenance-key': item.key, checked: selected.includes(item.key), disabled: busy,
                onChange: () => { setSelected(selected.includes(item.key) ? selected.filter((key) => key !== item.key) : [...selected, item.key]); setPlan(null) } }),
              `${componentLabel(item, t)} · ${item.version ?? '?'}`)),
            h('button', { style: S.actionButton, disabled: busy || !selected.length, onClick: () => request('plan', { kind: 'repair', components: selected }) }, t('maintenanceRepair')),
            h('button', { style: S.actionButton, disabled: busy || !selected.length, onClick: () => request('plan', { kind: 'uninstall', components: selected }) }, t('maintenanceUninstall')),
            h('div', { style: S.note }, t('maintenanceManagerHint')),
            h('select', { 'aria-label': 'manager-target-version', value: version, onChange: (event) => { setVersion(event.target.value); setPlan(null) } },
              h('option', { value: '' }, '—'), ...(maintenance.catalog?.versions ?? []).map((value) => h('option', { key: value, value }, value))),
            h('button', { style: S.actionButton, disabled: busy || !version, onClick: () => request('plan', { kind: 'manager-upgrade', version }) }, t('maintenanceManager')),
            plan ? h('div', null,
              h('div', { style: S.notice }, `${t(plan.kind === 'uninstall' ? 'maintenanceUninstall' : plan.kind === 'repair' ? 'maintenanceRepair' : 'maintenanceManager')}${plan.target ? ` → ${plan.target.version}` : ''}`),
              h('ul', { style: S.warningList }, plan.entries.map((entry) => h('li', { key: entry.key }, `${entry.package}@${entry.version}`))),
              plan.blockers.length ? h('div', { style: S.reason, role: 'alert' }, plan.blockers.join(', ')) : null,
              h('button', { style: S.actionButton, disabled: busy || plan.blockers.length > 0, onClick: () => request('stage', { kind: plan.kind, components: plan.components, version: plan.target?.version, planId: plan.id, confirm: true }) }, t('maintenanceConfirm')),
            ) : null,
          ) : h('div', null,
            h('div', { style: S.notice }, t('maintenancePending')),
            h('div', { style: S.mono }, maintenance.helperCommand),
            h('button', { style: S.actionButton, disabled: busy || ['applying', 'recovery-required', 'invalid'].includes(maintenance.result?.status), onClick: () => request('cancel', { planId: pending.id, confirm: true }) }, t('maintenanceCancel')),
          ),
          maintenance.result ? h('div', { style: S.note, 'data-guide-maintenance-result': true }, t(maintenance.verification === 'verified-running' ? 'maintenanceVerified'
            : maintenance.verification === 'restart-health-check-failed' ? 'installHealthFailed'
              : maintenance.verification === 'interrupted' || ['invalid', 'recovery-required'].includes(maintenance.result.status) ? 'maintenanceInterrupted'
                : maintenance.result.status === 'failed-restored' ? 'maintenanceFailed' : maintenance.result.status === 'applying' ? 'maintenanceWorking' : 'maintenanceAwaiting')) : null,
          maintenance.result?.error ? h('div', { style: S.reason }, maintenance.result.error, maintenance.result.recoveryError) : null,
          maintenance.recoveryCommand ? h('div', null, h('div', { style: S.note }, t('maintenanceRecovery')), h('div', { style: S.mono }, maintenance.recoveryCommand)) : null,
          maintenance.externalRepairCommand ? h('details', null, h('summary', { style: S.note }, t('maintenanceRepairExternal')), h('div', { style: S.mono }, maintenance.externalRepairCommand)) : null,
          h('div', { style: S.note }, t('maintenanceExternal')),
          ...(maintenance.external ?? []).map((item) => h('div', { key: item.key, style: S.kv }, `${item.key} · ${item.installed ? '✓' : '—'} ${item.version ?? ''}`)),
          h('button', { style: S.actionButton, onClick: onOpenSkills }, t('openSkills')),
          error ? h('div', { style: S.reason, role: 'alert' }, error) : null,
        ),
      )
    }

    function PackageCard({ management, components, t, onChanged }) {
      const [targets, setTargets] = React.useState({})
      const [plan, setPlan] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState(null)
      if (!management) return null
      const pending = management.pending
      const result = management.result
      const installed = components.filter((item) => item.installed)
      const request = async (action, payload) => {
        setBusy(true)
        setError(null)
        try {
          const value = await installRequest(action, payload, 'packages')
          if (action === 'plan' || action === 'restore-plan') setPlan(value)
          else { setPlan(null); setTargets({}); onChanged() }
        } catch (failure) { setError(String(failure.message ?? failure)) }
        finally { setBusy(false) }
      }
      const selected = installed.filter((item) => targets[item.key] && targets[item.key] !== item.version).map((item) => ({ key: item.key, version: targets[item.key] }))
      const status = management.verification === 'verified-running' ? 'packageVerified'
        : management.verification === 'restart-health-check-failed' ? 'installHealthFailed'
          : management.verification === 'interrupted' || result?.status === 'recovery-required' || result?.status === 'invalid' ? 'packageRecovery'
            : result?.status === 'failed-restored' ? 'packageFailed' : 'packageAwaiting'
      return h('section', { style: S.section, 'data-guide-packages': true },
        h('h3', { style: S.sectionTitle }, t('packageTitle')),
        h('div', { style: S.card },
          h('div', { style: S.note }, t('packageHint')),
          !management.catalog?.available ? h('div', { style: S.note }, t('packageCatalogMissing')) : null,
          management.catalog?.available && !pending ? h('div', null,
            ...installed.map((item) => {
              const versions = management.catalog.components.find((entry) => entry.key === item.key)?.versions ?? []
              const choices = [...new Set([item.version, ...versions])]
              return h('label', { key: item.key, style: S.kv },
                h('span', null, `${componentLabel(item, t)} · ${item.version}`),
                h('select', { 'aria-label': `target-version-${item.key}`, 'data-guide-package-key': item.key, value: targets[item.key] ?? item.version, disabled: busy,
                  onChange: (event) => { setTargets({ ...targets, [item.key]: event.target.value }); setPlan(null) } },
                choices.map((version) => h('option', { key: version, value: version }, version))),
              )
            }),
            h('button', { style: S.actionButton, disabled: busy || !selected.length, onClick: () => request('plan', { targets: selected }) }, t('packagePreview')),
          ) : null,
          plan && !pending ? h('div', null,
            h('div', { style: S.note }, plan.combination ?? plan.transactionId),
            h('ul', { style: S.warningList }, plan.entries.map((entry) => h('li', { key: entry.key }, `${entry.package}: ${entry.previous?.version ?? ''}${entry.previous ? ' → ' : ''}${entry.version} · ${t(entry.action === 'retain' ? 'installRetain' : entry.action === 'restore' ? 'packageRestore' : 'packageUpgrade')}`))),
            plan.blockers?.length ? h('div', { style: S.reason }, `${t('gateBlocked')}: ${plan.blockers.join(', ')}`) : null,
            h('button', { style: S.actionButton, disabled: busy || plan.blockers?.length > 0, onClick: () => request('stage', { kind: plan.kind, targets: plan.targets, transactionId: plan.transactionId, planId: plan.id, confirm: true }) }, t(plan.kind === 'package-restore' ? 'packageRestoreConfirm' : 'packageConfirm')),
          ) : null,
          pending ? h('div', null,
            h('div', { style: S.notice }, t('packagePending')),
            h('ul', { style: S.warningList }, pending.entries.map((entry) => h('li', { key: entry.key }, `${entry.package}@${entry.version}`))),
            h('div', { style: S.mono }, management.helperCommand),
            h('button', { style: S.actionButton, disabled: busy || ['upgrading', 'restoring'].includes(result?.status), onClick: () => request('cancel', { planId: pending.id, confirm: true }) }, t('packageCancel')),
          ) : null,
          !pending ? (management.transactions?.length
            ? management.transactions.map((transaction) => h('button', { key: transaction.id, style: S.actionButton, disabled: busy, onClick: () => request('restore-plan', { transactionId: transaction.id }) }, `${t('packageRestorePreview')} · ${transaction.id}`))
            : h('div', { style: S.note }, t('packageNoTransactions'))) : null,
          result ? h('div', { style: S.note }, t(status)) : null,
          result?.error ? h('div', { style: S.reason }, result.error) : null,
          result?.recoveryError ? h('div', { style: S.reason }, result.recoveryError) : null,
          error ? h('div', { style: S.reason, role: 'alert' }, error) : null,
        ),
      )
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
      const warningText = (item) => item.code === 'artifact-unknown'
        ? `artifact:${item.name}`
        : item.code === 'skill-not-ready' ? `${t('skillNotReady')} (${item.status})` : item.code ?? 'warning'
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

    function SkillsCard({ skills, t, onOpenSkills }) {
      if (!skills) return null
      const data = skills.data
      const manager = skills.manager ?? null
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
        h('div', { style: S.kv }, h('span', { style: S.key }, t('skillsManager')), h('span', null,
          manager?.installed === true ? `${manager.version ?? t('none')}` : t('missing'))),
        skills.disabled === true ? h('div', { style: S.reason }, t('skillDisabled')) : null,
        skills.status === 'missing' ? h('div', { style: S.reason }, t('skillMissing')) : null,
        manager?.installed === true && typeof onOpenSkills === 'function'
          ? h('button', { style: S.actionButton, onClick: onOpenSkills }, t('openSkills'))
          : null,
        h('div', { style: S.note }, manager?.installed === true ? t('skillsManagerHint') : t('skillManagerMissing')),
      )
    }

    function ManagerTab({ t, openPackage, onOpenSkills }) {
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
        let interval = 10_000
        let reading = false
        async function run() {
          if (reading) return
          reading = true
          try {
            const value = await fetchState()
            if (stopped) return
            setState(value)
            setError(null)
            const nextInterval = value.distribution?.task?.status === 'running' ? 1_000 : 10_000
            if (nextInterval !== interval) { interval = nextInterval; window.clearInterval(timer); timer = window.setInterval(run, interval) }
          } catch (failure) {
            if (stopped) return
            setError(String(failure?.message ?? failure) === 'host-stale' ? t('hostStale') : String(failure?.message ?? failure))
          } finally {
            reading = false
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
        h(SourceCard, { distribution: state.distribution, state, t, onChanged: refresh }),
        h(InstallationCard, { installation: state.installation, components: state.components ?? [], remoteAvailable: state.distribution?.configured, t, onChanged: refresh }),
        h(PackageCard, { management: state.packageManagement, components: state.components ?? [], t, onChanged: refresh }),
        h(MaintenanceCard, { maintenance: state.maintenance, components: state.components ?? [], t, onChanged: refresh, onOpenSkills }),
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
          h(SkillsCard, { skills: state.skills, t, onOpenSkills }),
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
        const openSkills = async () => {
          const label = t('skills')
          const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
          const findNav = () => [...document.querySelectorAll('[role="dialog"] button')]
            .find((element) => (element.textContent ?? '').trim() === label)
          const waitForNav = async () => {
            for (let attempt = 0; attempt < 20; attempt += 1) {
              const nav = findNav()
              if (nav !== undefined) return nav
              await sleep(100)
            }
            return undefined
          }
          const existing = findNav()
          if (existing !== undefined) {
            existing.click()
            return true
          }
          const account = document.querySelector('button[aria-label="账号菜单"], button[aria-label="Account menu"], button[aria-label*="账号"], button[aria-label*="Account"]')
          if (account === null) return false
          account.click()
          await sleep(200)
          const settingsItem = [...document.querySelectorAll('[role="menuitem"]')]
            .find((element) => /设置|Settings/.test(element.textContent ?? ''))
          if (settingsItem === undefined) return false
          settingsItem.click()
          const nav = await waitForNav()
          if (nav === undefined) return false
          nav.click()
          return true
        }
        const offZh = ctx.locale.register(NS, 'zh', zh)
        const offEn = ctx.locale.register(NS, 'en', en)
        const offSlot = ctx.slots.inject('plugins.tab', () => ctx.slots.register({
          name: 'plugins.tab',
          id: 'guide-manager',
          order: 10,
          label: () => t('tab'),
          locale: NS,
        }, (owner = {}) => h(ManagerTab, { ...owner, t, onOpenSkills: openSkills })))
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

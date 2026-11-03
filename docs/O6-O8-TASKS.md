# O6/O8 可执行任务清单

初稿：2026-11-02；收尾更新：2026-11-03（Asia/Shanghai）。状态：**BP-1～BP-3 已修复；T4.1/T4.3 在支持基线内扩展验收完成**。真实 Runtime 34 组、Host 86 项、浏览器 11 项通过，见 [整改报告](../evidence/B-prime-fixes-2026-11-02/report.md)。后续 O2/R6 已完成独立 Host shield 及生命周期矩阵，见 [验收](../evidence/O2-R6-2026-11-02/report.md)；实际 desktop 新 bundle 已于 2026-11-03 安装并启动确认，见 [迁移报告](../evidence/O2-R6-desktop-migration-2026-11-03/report.md)。下文 T1/T4.1a 的旧接线完成记录保留作历史，最新所有权见设计 §5.7。设计依据 [O6/O8 设计](O6-O8-DESIGN.md)；5 项取舍在设计 §8 和 [PROJECT-STATUS](../PROJECT-STATUS.md) 的 D21–D25 记录。长期待办仍以 [OPEN-ITEMS](../OPEN-ITEMS.md) 为准。

## 0. 执行约定

- **范围**：只改 `guide-panel` 的 host 半、对应测试、配置和文档；`guide-goal-adapter` / `guide-sidebar-adapter` 只在 T4 的隔离 Host fixture 中加探针，不改生产逻辑。
- **当前模块边界**：`guide-shield/core.js` 持有 Host 生命周期，`guide-shield/identity.js` / `shield.js` 为身份与包装核心；panel 的同名入口只保留兼容导出，`model-projection.js` 与产品接线仍在 panel。下文 T0/T1 保留当时文件路径；当前实现与收尾见设计 §5 和 [关闭结论](O2-R6-CLOSEOUT.md)。`host-hooks.js` 已在 T4.1 删除，不再使用 post/pre hook。
- **不变量**：
  - 不改全局 `subagents` / `sessions` 服务，不按 label 做调度/名额判据；
  - 不新增轮询；所有缓存有界；所有 hook 有 disposer；
  - 关闭配置时必须回到 O6/O8 之前的行为；
  - 普通子代理、用户消息、系统消息、兄弟结算原样。
- **每个代码任务必须**：先加/改测试，再改实现；测试命令写进任务；完成后在任务表把状态改成 `done` 并记录证据路径。
- **测试基线**：现有 `guide-panel` host-route / panel-render / scheduler 和 sidebar core 测试保持通过；Electron 真实 Host 测试只在 T4 跑。

## 1. 依赖图

```text
T0.1 identity ─┬─ T1.1 shield(followup/steer) ─ T1.2 inject ─ T1.3 identity 接线 ─ T1.4 O8 状态
               └─ T2.1 list(children) ─ T2.2 descendants ─ T2.3 O6 状态
T0.2 preflight/state ─┘
T0.3 global waterfall ─┘
T2.1 ─ T3.1 send 拦截 ─ T3.2 interrupt 拦截
T1.4 + T2.3 + T3.2 ─ T4.1 真实 Host ─ T4.2 文档/证据 ─ T4.3 回滚/兼容
```

建议串行 T0 → T1 → T2 → T3 → T4；`shield.js` 和 `model-projection.js` 文件独立，T2 可在 T1 的测试通过后与 T1.4 并行，但接线 `index.js` 时需先合并 T1.3。

| ID | 任务 | 依赖 | 规模 | 状态 |
|---|---|---|---|---|
| T0.1 | identity helper | — | S | done |
| T0.2 | 预检与 state 占位 | T0.1 | S | done |
| T0.3 | 全局 waterfall helper（历史，T4.1 删除） | T0.2 | S | superseded |
| T1.1 | shield 模块化（followup/steer） | T0.1、T0.2 | M | done |
| T1.2 | 加 `inject` 包装 | T1.1 | S | done |
| T1.3 | 身份接线与生命周期 | T1.2 | M | done |
| T1.4 | O8 状态与面板提示 | T1.3 | S | done |
| T2.1 | O6 `children` 过滤 | T0.1、T0.3 | M | done |
| T2.2 | `descendants` 子树 | T2.1 | S | done |
| T2.3 | O6 状态与面板提示 | T2.2 | S | done |
| T3.1 | `send_message` 拦截 | T2.1、T0.3 | M | done |
| T3.2 | `interrupt_agent` 拦截 | T3.1 | S | done |
| T4.1a | O8 真实 Host 小验证 | T1.4 | S/M | done |
| T4.1 | 真实 Host 集成 + B′ 注册前装饰 | T4.1a、T2.3、T3.2 | M/L | done：86 项 Host + 34 组 Runtime，见整改报告 |
| T4.2 | 文档与证据 | T4.1 | S | done |
| T4.3 | 回滚与兼容复核 | T4.2 | S | done：取消/所有权/配置切换/服务重建/重载通过 |

## 2. 任务

### T0.1 建立 identity helper

- **依赖**：无。**规模**：S。
- **文件**：
  - 新增 `guide-panel/identity.js`
  - 新增 `guide-panel/test/identity.test.mjs`
  - `guide-panel/package.json`（`files` / `exports` / `peerDependencies`）
- **步骤**：
  1. 导出 `GUIDE_PROVIDER = 'guide-fork'`、`isGuideSession(session, foldDescriptor)`、`providerFromObservation(observation, foldDescriptor)`、`createIdentity({ sessions, agents, sessionQuery, foldDescriptor, hintLimit = 128, hintTtlMs = 600_000 })`。
  2. `isGuideSession()`：`header.origin === 'subagent'`；`inheritedEventCount` 为安全整数；`snapshotEvents(cut)`；`foldSubagentDescriptor(ownEvents)`（first-wins）→ `mode === 'continuable' && provider === 'guide-fork'`；异常返回 `false`。
  3. `createIdentity()` 返回 `{ isGuideSession, isGuideIdSync, isGuideId, parentOf, remember, forget, isHint, isGuideText, clear }`：
     - `WeakMap<Session, {seq, value}>` 缓存；
     - `Map<sessionId, {value, at}>` 有界 hint（LRU + TTL）；
     - `isGuideIdSync()` 只读 `sessions.get(id)` + 缓存 + hint，返回 `true/false/undefined`，供同步 shield 使用；
     - `isGuideId()` 在 `isGuideIdSync()` 为 `undefined` 时走 `sessionQuery.observeSession(id, {signal})` + `providerFromObservation()`，供异步工具分类使用；
     - `parentOf()` 先 `sessions.get(id)?.header?.parentSession`，再 observation；
     - `isGuideText()` 只匹配 `Background subagent <known-id>`，不按任意正文猜。
  4. `package.json`：`files`/`exports` 加 `./identity`；`peerDependencies` 加 `@deepseek-ai/dsh-subagent: ">=0.2.1-rc.3"`。
- **验证**：`node guide-panel/test/identity.test.mjs`。覆盖：继承前缀含 guide descriptor → false；自身首个 descriptor 为 guide → true；后续同类型 descriptor 不改写首个；损坏/缺失；冷恢复；hint TTL/LRU；`parentOf`；`clear`。
- **完成**：测试通过；不改变任何运行行为；`index.js` 尚未接线。
- **完成记录（2026-11-02）**：新增 [identity.js](../guide-panel/identity.js) 与 [identity.test.mjs](../guide-panel/test/identity.test.mjs)；`node guide-panel/test/identity.test.mjs` 通过。既有 host-route / panel-render / scheduler 及 sidebar core 4/4 回归通过。`package.json` 已加 `./identity`、`identity.js` files 和 `@deepseek-ai/dsh-subagent` peer；`index.js` 未接线，运行行为不变。

### T0.2 预检与 state 占位

- **依赖**：T0.1。**规模**：S。
- **文件**：`guide-panel/index.js`、`guide-panel/test/host-route.test.mjs`。
- **步骤**：
  1. 在 `apply()` 建立 `compat = { modelProjection: { mode: 'off', reason: 'not-implemented' }, settlementShield: { mode: 'off', reason: 'not-implemented' } }`。
  2. `/guide/api/state` 返回这两个字段；现有 capacity/archive/goalAdapter 字段不变。
  3. 加 `hostCompatibility(ctx)` helper：检查 `tools`、`sessions`、`agents`、`sessionQuery` 是否存在（只记录，不改行为）。
- **验证**：`node guide-panel/test/host-route.test.mjs`；新增断言 state 含两个字段；缺服务时 `hostCompatibility` 返回 false。
- **完成**：无行为变化；状态字段可被客户端读取。
- **完成记录（2026-11-02）**：`/guide/api/state` 返回 `modelProjection` / `settlementShield`，均为 `off` + `not-implemented`；新增 `hostCompatibility()`（只读探测 tools/sessions/agents/sessionQuery/subagents）。`node guide-panel/test/host-route.test.mjs` 通过，覆盖完整/缺失服务两种形状。未注册任何 hook。

### T0.3 全局 waterfall 注册 helper（历史，T4.1 已删除）

- **依赖**：T0.2。**规模**：S。
- **文件**：新增 `guide-panel/host-hooks.js`、新增 `guide-panel/test/host-hooks.test.mjs`、`guide-panel/package.json`（`files` 加 `host-hooks.js`）。
- **步骤**：
  1. `registerGlobalWaterfall(ctx, name, listener)`：优先 `ctx.on(name, listener, { global: true })`；若抛错/不支持，退回 `ctx.root.on(name, listener)` 并用 `ctx.effect` 返回清理。
  2. 导出 `registerGlobalWaterfall`，不注册任何实际 hook。
- **验证**：`node guide-panel/test/host-hooks.test.mjs`；fake ctx 检查 `global: true`、disposer 调用、fallback 路径。
- **完成**：helper 可用；真实 Host 的 `{global:true}` 行为在 T4.1 复核；若不可用，T4.1 改用 root 注册并记录。
- **完成记录（2026-11-02，历史）**：T0.3 当时新增 `host-hooks.js`/`host-hooks.test.mjs` 并验证 `{global:true}`。T4.1 改为 B′ 注册前装饰后，这两份文件已删除；本记录只保留实施轨迹。

### T1.1 Shield 模块化（followup / steer）

- **依赖**：T0.1、T0.2。**规模**：M。
- **文件**：新增 `guide-panel/shield.js`；`guide-panel/index.js`；`guide-panel/test/shield.test.mjs`；`guide-panel/test/host-route.test.mjs`；`guide-panel/package.json`（`files` 加 `shield.js`）。
- **步骤**：
  1. 新建 `shield.js`，导出 `createShield({ isSettlement, logger })`；T1.1 的 `isSettlement` 仍是现有 `isGuidanceSettlement`，T1.3 再换成 identity 版本，避免同一步同时改包装和身份。
  2. `shieldParent(agent)` 只包 `followup` / `steer`：保存原方法、`Symbol.for('dsh-guide-panel.shield')` 标记 wrapper、`WeakMap<agent, {restore}>`、`restore` 只在当前方法仍是自己的 wrapper 时还原；`restoreAll()` 遍历本次 activation 持有的 restore。
  3. `index.js` 删除旧 `shieldParent` / `shieldedParents`，改调 shield 模块；**保留** `isGuidanceSettlement` / `guidanceChildIds` / `isGuidanceChildAgent` 的旧身份路径直到 T1.3。
  4. 把 shield 实例穿过 `startThread` / `trackGuidanceAgent` / `dispatch`；`apply` 的 effect 清理调用 `shield.restoreAll()`。
- **验证**：`node guide-panel/test/shield.test.mjs` + `node guide-panel/test/host-route.test.mjs`。覆盖：followup/steer 拦指导、普通消息转发、unwrap、重复 shield 不叠加、冻结 agent 不抛。
- **完成**：行为与当前 followup/steer 主路径一致；新增 unwrap；尚未包 `inject`。
- **完成记录（2026-11-02）**：新增 [shield.js](../guide-panel/shield.js) 与 [shield.test.mjs](../guide-panel/test/shield.test.mjs)；`index.js` 已移除旧 `shieldParent`/`shieldedParents`，保留旧识别函数。`node guide-panel/test/shield.test.mjs`、`node guide-panel/test/host-route.test.mjs` 通过。`package.json` files 已加 `shield.js`。

### T1.2 加 `inject` 包装

- **依赖**：T1.1。**规模**：S。
- **文件**：`guide-panel/shield.js`、`guide-panel/test/shield.test.mjs`、`guide-panel/cordis.patch.yml`。
- **步骤**：
  1. `shieldParent()` 方法列表改为 `['followup', 'steer', 'inject']`。
  2. 配置 `shield.inject` 默认 `true`；`false` 时不包 `inject`。
  3. `settlementShield.state` 支持 `active` / `partial`（某个方法无法包装）/ `off`。
- **验证**：`node guide-panel/test/shield.test.mjs`。新增：父关闭 `inject` 吞指导结算；普通 `inject` 转发；`shield.inject: false` 时旧行为；partial 状态。
- **完成**：O8 的主路径完成；父关闭不再污染。
- **完成记录（2026-11-02）**：`shield.js` 方法列表加入 `inject`，`createShield({ inject, enabled })` 支持关闭；新增 `getState()` 返回 `active/partial/off`、`reason` 和 `inject`；`off` 只表示显式 `enabled:false`，不再把“尚未包装父会话”误报为关闭。`guide-panel/cordis.patch.yml` 加 `shield.inject: true` / `shield.enabled: true`。`/guide/api/state` 的 `settlementShield` 改为实时状态。`node guide-panel/test/shield.test.mjs`、`node guide-panel/test/host-route.test.mjs` 通过，覆盖 inject/普通消息/关闭配置/缺失方法 partial/frozen partial。

### T1.3 身份接线与生命周期

- **依赖**：T1.2、T0.1。**规模**：M。
- **文件**：`guide-panel/index.js`、`guide-panel/shield.js`、`guide-panel/identity.js`、`guide-panel/test/shield.test.mjs`、`guide-panel/test/lifecycle.test.mjs`、`guide-panel/test/host-route.test.mjs`。
- **步骤**：
  1. `index.js` 用 `createIdentity` 创建 reader；服务用 `ctx.get` 懒取，避免 sessions/sessionQuery 晚挂载时失效。descriptor fold 优先动态加载官方 `foldSubagentDescriptor`，standalone 测试用只读 `mode`/`provider` 最小回退；`apply` 因加载变为 async。
  2. `shield` 改用 `createSettlementPredicate({ identity })`；删除 `isGuidanceChildAgent` / `guidanceChildIds` / 旧 `isGuidanceSettlement`；`trackGuidanceAgent` 改为 `identity.isGuideSession(agent.session)`；`startThread` 成功后 `identity.remember(childId, parentId)`；`agent/created` 同步分类并 shield 父；`session/event` 的 `subagent/descriptor` 先 `invalidate`/`forget` 再重分类；`agent/disposed` 清理 hint；`agents.list()` 启动时补扫。
  3. `apply` 清理：`shield.restoreAll()` + `identity.clear()`。
  4. 补 `agent/created` 在 descriptor 尚未写入时不误判的用例（后续 `session/event` 再分类）。
- **验证**：`node guide-panel/test/shield.test.mjs` + `node guide-panel/test/lifecycle.test.mjs` + `node guide-panel/test/host-route.test.mjs`。覆盖：继承前缀不误判、冷恢复、first-wins、迟到 descriptor、disposed hint、卸载后旧包装不拦截。当时未单独模拟父重建；后续 O2/R6 已补矩阵并关闭，见 [收尾结论](O2-R6-CLOSEOUT.md)。
- **完成**：`guidanceChildIds` / 全量 snapshot 扫描从生产代码移除；身份只读自身 descriptor。
- **完成记录（2026-11-02）**：`index.js` 改为 async apply，优先动态加载官方 fold、standalone 用最小回退；shield 改用 `createSettlementPredicate`；新增 `lifecycle.test.mjs` 覆盖 agent/created、继承前缀、迟到 descriptor、agent/disposed、unload restore。`identity` / `shield` / `host-route` / `lifecycle` 测试通过。T4.1 已覆盖真实 Host 的面板禁用/重启用；当时父重建/Host 重启/runtime closing 留 O2/R6，现已由独立矩阵验收收口。

### T1.4 O8 状态与面板提示

- **依赖**：T1.3。**规模**：S。
- **文件**：`guide-panel/index.js`、`guide-panel/client.js`、`guide-panel/test/host-route.test.mjs`、`guide-panel/test/panel-render.test.mjs`。
- **步骤**：
  1. `/guide/api/state` 返回 `settlementShield`。
  2. 面板读取 state；`partial/off` 时显示 zh/en 提示；`active` 不显示。
  3. 面板 hint 文案加入现有 locale 字典（不新增文件）。
- **验证**：`node guide-panel/test/host-route.test.mjs` + `node guide-panel/test/panel-render.test.mjs`；断言 partial/off 文案渲染。
- **完成**：状态可诊断；配置关闭时有提示。
- **完成记录（2026-11-02）**：`client.js` 新增 `shieldPartial` / `shieldOff` zh/en 文案、`shieldNote` 状态和纯函数 `shieldNoteFor`；state 读取 `settlementShield`，`partial/off` 显示提示。`panel-render.test.mjs` 覆盖三态与空值；`host-route` 覆盖 `active`。全部 panel 测试通过。

T1（O8）完成摘要：shield 已包 `followup`/`steer`/`inject`，可 unwrap；identity 只读自身 descriptor，`guidanceChildIds`/全量扫描已移除；`settlementShield` 状态与面板提示已接；`apply` 因 fold 动态加载变为 async。T2.1–T2.3 与 T3.1/T3.2 已完成 O6 的 list 过滤、面板提示和 send/interrupt 控制拦截；T4.1 已按 B′ 完成真实 O6 工具探针。

### T2.1 O6 模块与 `children` 过滤（历史 hook 实现，T4.1 已替代）

- **依赖**：T0.1、T0.3。**规模**：M。
- **文件**：新增 `guide-panel/model-projection.js`；`guide-panel/index.js`；新增 `guide-panel/test/model-projection.test.mjs`；`guide-panel/package.json`（`files` 加 `model-projection.js`）。
- **步骤**：
  1. `createModelProjection({ identity, register, hideGuidance, logger })`；`start()` 通过 `registerGlobalWaterfall(ctx, 'tools/post-execute', ...)` 注册。
  2. `tools/post-execute`：`exec.name === 'list_agents'`、`decision.kind === 'accept'`、`!result.isError`；`decision.content` 已替换时跳过；取 `decision.value ?? result.value`，过滤后返回 `{...decision, value}`。
  3. `filterGuidanceEntries(entries, 'children', id => identity.isGuide(id))`：指导条目删除；未知保留。
  4. 配置 `model.hideGuidance` 默认 `true`；`false` 时不注册/返回原值；state 为 `off/disabled`。
- **验证**：`node guide-panel/test/model-projection.test.mjs`。覆盖：指导隐藏、普通/诊断保留、分类失败保留、非 list 工具不动、content 替换跳过、关闭配置不生效。
- **完成**：`list_agents` children 不含指导；服务层仍可见。
- **完成记录（2026-11-02，历史 hook 路径）**：T2.1 先以 `tools/post-execute` 实现 children 过滤。T4.1 实测发现接口契约错误（`isGuide` vs `isGuideId`）并改用 B′ 注册前装饰；当前实现见 T4.1/设计 §4.8，旧 hook 不再生产使用。

### T2.2 `descendants` 子树

- **依赖**：T2.1。**规模**：S。
- **文件**：`guide-panel/model-projection.js`、`guide-panel/test/model-projection.test.mjs`。
- **步骤**：
  1. `scope === 'descendants'` 时按 `entry.parent` 传递 `hidden`：指导条目入 `hidden`；其 child/diagnostic 一并跳过。
  2. 普通兄弟分支、非指导 diagnostic 保留。
- **验证**：`node guide-panel/test/model-projection.test.mjs`。覆盖：指导 + 其普通 child + 其 diagnostic 全隐藏；普通分支保留；诊断保留/隐藏两种。
- **完成**：descendants 不暴露指导分支。
- **完成记录（2026-11-02）**：`filterGuidanceEntries` 的 `descendants` 分支按 `entry.parent` 传递 hidden；随 T2.1 一并实现并通过单测（guide/guide child/guide diagnostic 隐藏，普通分支保留）。T4.1 的真实 `list_agents` 探针已通过。

### T2.3 O6 状态与面板提示

- **依赖**：T2.2。**规模**：S。
- **文件**：`guide-panel/index.js`、`guide-panel/client.js`、`guide-panel/test/host-route.test.mjs`、`guide-panel/test/panel-render.test.mjs`。
- **步骤**：
  1. `/guide/api/state` 返回 `modelProjection`（`off/pending/idle/active/partial/unsupported` + reason + 每工具计数 + `scanRevision`）。
  2. 面板在 `pending/partial/unsupported/off` 时显示简明提示；`active/idle` 静默。
- **验证**：同 T1.4 的两个测试；断言状态和提示。
- **完成**：O6 状态可诊断。
- **完成记录（2026-11-02）**：`client.js` 新增 `modelUnsupported` / `modelPartial` / `modelPending` / `modelOff` zh/en 文案、`modelNoteFor` 纯函数；面板在 pending/partial/unsupported/off 显示提示，active/idle 静默。`panel-render.test.mjs` 覆盖。state 的 `modelProjection` 由 T2.1/T4.1 提供。

### T3.1 控制拦截：`send_message`（历史 hook 实现，T4.1 已替代）

- **依赖**：T2.1、T0.3。**规模**：M。
- **文件**：`guide-panel/model-projection.js`、`guide-panel/index.js`、`guide-panel/test/model-projection.test.mjs`。
- **步骤**：
  1. 通过 `registerGlobalWaterfall(ctx, 'tools/pre-execute', ...)` 注册；只处理 `send_message` / `interrupt_agent`。
  2. `controlVerdict('send_message', targetId, caller)`：`parentOf(targetId) === caller.id` 且 `identity.isGuide(targetId) === true` → `deny`；否则 `allow`（父级回报/普通子级/未知都放行）。
  3. 拒绝返回 `{ kind: 'deny', reason: 'Guidance conversations are not task subagents; use the guidance panel to open or stop them.' }`。
  4. 配置 `model.blockControl` 默认 `true`；`false` 时不注册。
- **验证**：`node guide-panel/test/model-projection.test.mjs`。覆盖：主父级→直接指导拒绝；普通子级放行；指导孩子→指导放行；目标为父级放行；分类失败放行；`blockControl:false` 不拦。
- **完成**：send 路径按 D21/D23 工作。
- **完成记录（2026-11-02，历史 hook 路径）**：T3.1 先以 `tools/pre-execute` 实现 send 守卫；T4.1 改为在原 `send_message` 定义 execute 前判定，避免依赖 waterfall 返回值。当前实现见 T4.1/设计 §4.8。

### T3.2 控制拦截：`interrupt_agent`（历史 hook 实现，T4.1 已替代）

- **依赖**：T3.1。**规模**：S。
- **文件**：`guide-panel/model-projection.js`、`guide-panel/test/model-projection.test.mjs`。
- **步骤**：
  1. `controlVerdict('interrupt_agent', ...)`：从 target 向上走到 caller；路径上（含 target、不含 caller）出现指导 → `deny`；走到 caller → `allow`；走不到 caller → `allow`（交给工具自身拒绝）。
  2. 指导自己的子代理仍可被指导 interrupt；主父级不能 interrupt 指导或其工作后代。
- **验证**：`node guide-panel/test/model-projection.test.mjs`。覆盖边界表。
- **完成**：interrupt 路径按 D22 工作。
- **完成记录（2026-11-02，历史 hook 路径）**：`onPreExecute` 增加 `interrupt_agent` 分支；`isGuideBranch()` 从 target 走到 caller（含 target、不含 caller），出现指导即 deny，最多 64 层并带 visited 防环。T4.1 复用了同一判定并改为原定义 execute 前判定；单测 + 真实 Host 直接/native/PTC 已通过。

### T4.1a O8 真实 Host 小验证

- **依赖**：T1.4。**规模**：S/M。
- **文件**：`guide-goal-adapter/test/host-fixture.mjs`、`guide-goal-adapter/scripts/smoke.mjs`、`evidence/O6-O8-2026-11-02/report.md`。
- **步骤**：
  1. 在隔离 fixture 加 O8 探针：真实 parent/guide、等待 shield 安装；`parent.inject(settlement)` 断言 `inbox.hasPending === false`。
  2. 普通 `inject` 断言进入 inbox；清理。
  3. Loader 禁用 panel → 断言 unwrap 且 settlement 进入 inbox；重启用 → 断言重新拦截。
  4. smoke 断言 `/guide/api/state.settlementShield = active/inject true`，并记录 `runtime.o8`。
- **验证**：`node guide-goal-adapter/scripts/smoke.mjs --integration`。
- **完成记录（2026-11-02）**：通过。断言：async apply 后 state active；冷/首次指导 settlement 不进父历史；inject 吞指导、转普通；卸载后投递；重启用后拦截。`errors: []`。边界：runtime `notifySettlement` 的 closing 窗口未强制；`sessionQuery` 异步回退未触发；Host 重启/父重建/运行中 HMR 未覆盖。未修改生产代码。
- **证据**：[T4.1 O8 报告](../evidence/O6-O8-2026-11-02/report.md)；`evidence/LI-stage1-2026-11-02/runtime-result.json`。

### T4.1 真实 Host 集成 + B′

- **依赖**：T4.1a、T2.3、T3.2。**规模**：M/L。状态：done。
- **实际实现（B′）**：
  1. `model-projection.js` 在 `tools.register` 进入 registry 前装饰原 `list_agents` / `send_message` / `interrupt_agent` 定义；保留原对象/schema/render/symbol 和原 disposer。
  2. 来源用 `ctx.registry.get(originalModule)` 的 runtime 身份；已有定义从原模块 `runtime.fibers` + `scopeOf(fiber.ctx)` + 精确注册层 bootstrap，包装生命周期按仍存活的精确注册管理；源码哈希固定 5 个文件（详见设计 §4.7）。
  3. `list_agents` await 原 body 后过滤；控制工具在原 body 前判定，命中抛 `CONTROL_DENY_REASON`；取消优先，已 abort 不执行原控制 body。
  4. 状态 `off/pending/idle/active/partial/unsupported`，每工具覆盖计数和 `scanRevision`；`hideGuidance` 主开关、`blockControl` 子开关。
  5. 接口统一 `identity.isGuideId()` / `parentOf()`；移除 `tools/post-execute` / `tools/pre-execute` / `host-hooks.js`。
- **真实 Host 结果**：**44 项断言通过，errors=[]，`modelProjection=active`**。覆盖：
  - O8 async apply/inject/unwrap/重启用；
  - O6 直接 `tools.execute` children/descendants、控制拒绝；
  - 真实 native `tool-call` → session `tool/result`（指导隐藏、普通工作保留、拒绝无 inbox 副作用）；
  - 实际 PTC `run_code`（临时工作目录，程序只调用工具）的 list 和 control 子调用；
  - 真实 `/guide/api/start`。
- **证据**：[runtime-result.json](../evidence/LI-stage1-2026-11-02/runtime-result.json)、[T4.1 报告](../evidence/O6-O8-2026-11-02/report.md)、[注册探针](../evidence/O6-enforcement-boundary-2026-11-02/probe-registration.mjs)。
- **整改增量**：上述 44 项保留为首次基线；最新 86 项加测 standard/guide/custom 首调、O6 自身冷恢复、native/PTC interrupt、通知与 session 一致性和真实配置切换；34 组 Runtime 补取消/所有权/服务重建。见 [整改报告](../evidence/B-prime-fixes-2026-11-02/report.md)。当时留给 O2/R6 的 runtime closing/父重建/Host 重启现已验收，见 [收尾结论](O2-R6-CLOSEOUT.md)。

### T4.2 文档与证据

- 状态：done。
- 已更新 README/PROJECT-STATUS/OPEN-ITEMS/ARCHITECTURE/设计/任务/证据；记录 44 项结果、B′ 源码哈希、注册探针和回滚命令。
- 验证：文档相对链接检查；真实 Host 结果与状态一致。

### T4.3 回滚与兼容复核

- 状态：done。
- 已覆盖：真实配置 off/list-only/on；未知/冻结定义 partial；缺失 identity/精确注册层或来源错误 unsupported；面板卸载/重载；tools 服务重建；第三方 execute/register 外层所有权；在途取消优先；精确注册注销后释放记录，暂不可见不裁剪。证据见整改报告。
- 支持基线：DSH `0.2.1-rc.3`/Cordis `4.0.5`，5 个源码哈希在 `model-projection.js`；不承诺任意第三方后置 `value`/`content` 篡改。
- 回滚：关闭配置 + 重载 panel；旧 wrapper 先失活，再只还原仍属于自己的 execute/register。无定时轮询/无函数文本哈希。

## 3. 验收矩阵

| 验收项 | 主任务 |
|---|---|
| `list_agents` children 隐藏指导 | T2.1、T4.1 |
| `list_agents` descendants 隐藏指导分支 | T2.2、T4.1 |
| `send_message` 拦截指导、放行回报 | T3.1、T4.1 |
| `interrupt_agent` 拦截指导/工作后代 | T3.2、T4.1 |
| 服务层/名额/UI 仍见指导 | T4.1 |
| `followup`/`steer`/`inject` 拦指导结算 | T1.1、T1.2 |
| 普通/兄弟/用户/系统消息原样 | T1.1、T1.2 |
| 继承前缀不误判、first-wins | T0.1、T1.3 |
| 卸载/重载 restore | T1.3、T4.3 |
| 状态与面板提示 | T1.4、T2.3 |
| 关闭配置回到旧行为 | T4.3 |

## 4. 测试命令

```powershell
node guide-panel/test/identity.test.mjs
node guide-panel/test/shield.test.mjs
node guide-panel/test/model-projection.test.mjs
node guide-panel/test/contract.test.mjs
node guide-panel/test/host-route.test.mjs
node guide-panel/test/panel-render.test.mjs
node guide-panel/test/scheduler.test.mjs

# 注册观察层只读探针（T4.1）
$env:ELECTRON_RUN_AS_NODE = '1'
& '<DSH 安装目录>\DeepSeek Harness.exe' --expose-internals evidence/O6-enforcement-boundary-2026-11-02/probe-registration.mjs
& '<DSH 安装目录>\DeepSeek Harness.exe' --expose-internals guide-panel/test/projection-runtime.test.mjs

# 回归（不期望被本设计改动）
node --test guide-sidebar-adapter/test/core.test.mjs

# 真实 Host（86 项；加 --sidebar 为浏览器 11 项）
$env:DSH_SMOKE_OUTPUT = 'evidence/B-prime-fixes-2026-11-02/host'
node guide-goal-adapter/scripts/smoke.mjs --integration
```

## 5. 回滚

1. 配置诊断/回滚：panel 的 `model.hideGuidance: false`、`model.blockControl: false`；独立 guide-shield config 的 `inject:false` 只关闭 closing 路径，`enabled:false` 关闭整个 shield。完整行为回退须配套旧 panel 版本，不能只移除服务。
2. 代码回滚：移除 `tools.register` 观察层和定义包装；恢复 `model-projection.js` 的旧版本；`host-hooks.js` 已在 T4.1 删除，如需旧 hook 路径从历史快照恢复。
3. 不涉及数据迁移；旧 `guidanceChildIds` 不再写入，不需要清理持久化数据。
4. 不支持来源/注册契约的宿主：状态 `unsupported/partial`，不包装半套；面板提示，普通功能保持。

## 6. 风险与阻塞

- **`tools.register`/来源是私有边界**：T4.1 已在真实 Host 验证；支持的 5 个源码哈希和 `registry.get`/`fiber.runtime` 形状列入升级重验（O21）。
- **第三方后置替换**：B′ 只保证正常注册和定义层；无事件直接改 `execute` 或后置 `value`/`content` 显式覆盖仍可绕过，状态按最近扫描报告。
- **deprecated 同步 Session 读取**：O8 同步 shield 仍依赖受控的自身事件读取；当前未知身份会转发。升级替代和明确兼容状态归 O21，不能把尚未实现的统一预检写成当前保证。
- **身份规则差异已收口**：O2/R6 已将 goal adapter 与 panel/Runtime 统一为自身 descriptor first-wins；含双 descriptor 与创建中的 join 回归。
- **冻结/未知定义**：`modelProjection: partial`；不包并显式报告。
- **原生/PTC**：T4.1 用确定性模型和临时工作目录覆盖最小链路；真实外部模型长时/全功能回归仍由 O11 后续覆盖。

## 7. 交付定义

- T0–T4 全部完成，任务表状态更新；
- 新增测试全部通过，现有测试无回归；
- 真实 Host 证据、回滚结果、未覆盖项写入 `evidence/O6-O8-2026-11-02/report.md`；
- README/PROJECT-STATUS/OPEN-ITEMS/ARCHITECTURE 与代码状态一致；
- 关闭配置时行为与 O6/O8 之前一致；没有未解释的兼容性回退。

## 8. 审计整改验收（2026-11-02）

原缺口记录见 [B′ 审计](../evidence/B-prime-audit-2026-11-02/report.md)，正向验收见 [整改报告](../evidence/B-prime-fixes-2026-11-02/report.md)。

- [x] BP-1：可见性与注册生命周期分开，未发布/限制/共享/释放和记录数量回归通过。
- [x] BP-2：身份/父关系 await 中取消、卸载与两种交错；真实控制副作用为零，取消结果 ABORTED。
- [x] BP-3：有事件的 execute 替换 partial；不重信任、不覆盖第三方、不积累活跃记录。
- [x] standard/guide/custom、O6 冷恢复、生产 observer 失败回滚/原 disposer、native/PTC interrupt、真实配置、服务重建、重复重载。
- [x] 当前基线、正向新增测试、状态/面板映射、value/content/通知/session 一致性；T4.1/T4.3 恢复 done。
- [x] 部署确认：2026-11-03 已核对真实 desktop 当前源码、shield active/inject=true 与正常桌面组件运行；O2/R6 已关闭，O11/O21 保留独立范围。

## O2/R6 执行与收尾记录（2026-11-02～2026-11-03，已关闭）

- [x] 旧 wrapper 失活直通、第三方外层保留、两实例交叠释放与父释放清理。
- [x] observation 取消/超时/clear/forget/对象替换后的回写限制与迟到 lease 释放；异步 mode 与地址核对。
- [x] goal reader 从 last 改为自身 descriptor first-wins；事件同步分类与创建中的 join 正向回归。
- [x] 用户选择独立 Host 服务后新增 `guide-shield` bundle；panel 只连接，独立服务持有防护。
- [x] 释放后一次性结算凭据、真实 scoped closing→inject、普通 idle/closing 兄弟与非面板创建。
- [x] 真实 panel HMR apply 门控、新旧指导、父重建与旧 activation guard、两进程持久化恢复、真实 observation。
- [x] panel 8 个脚本、官方 Runtime 34 组、goal 12 项回归；prepare 122 项（O2 32）、restart 98 项（O2 8），errors=[]。
- [x] 实际 desktop 新 shield bundle 安装、旧 shield 配置核对与正常启动确认（2026-11-03；本机无旧 override，沿用 enabled/inject=true）。

最终关闭判定见 [O2/R6 收尾结论](O2-R6-CLOSEOUT.md)。证据与边界见 [O2/R6 报告](../evidence/O2-R6-2026-11-02/report.md)，迁移见 [guide-shield](../guide-shield/README.md)。不把服务自身核心 HMR、整图 graceful shutdown 顺序和硬崩溃耐久性纳入 panel HMR 连续保护承诺。

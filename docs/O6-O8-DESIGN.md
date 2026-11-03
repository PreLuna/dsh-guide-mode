# O6 / O8 实现设计：模型不可见投影与结算 shield

> 整改更新：BP-1～BP-3 已闭合；支持基线内 34 组 Runtime、86 项 Host、11 项浏览器通过。当前验收范围见 [修复报告](../evidence/B-prime-fixes-2026-11-02/report.md)，原审计保留为修复前证据。

初稿：2026-11-02；更新：2026-11-03（Asia/Shanghai）。状态：**T0–T4 在支持基线内完成；O6 B′ 审计整改后 34 组 Runtime、86 项 Host、11 项浏览器通过**。O2/R6 后续已完成独立 Host shield 与 closing/HMR/父重建/两进程恢复矩阵；实际 desktop 新 bundle 已于 2026-11-03 安装并启动确认，见 [迁移报告](../evidence/O2-R6-desktop-migration-2026-11-03/report.md)。见 [O2/R6 验收](../evidence/O2-R6-2026-11-02/report.md)，本文 §5.7 为最新所有权与生命周期实现。适用基线：DSH `0.2.1-rc.3`、Cordis `4.0.5`。关联 [OPEN-ITEMS](../OPEN-ITEMS.md) 的 O6、O8、O2/R6、O19、O21；当前架构见 [ARCHITECTURE](ARCHITECTURE.md)；任务见 [O6/O8 任务清单](O6-O8-TASKS.md)。

## 1. 结论摘要

- **O6 不改全局 subagents/sessions 服务。** 只装饰模型工具层：
  - 在 `tools.register` 进入 registry **之前**装饰原 `list_agents` / `send_message` / `interrupt_agent` 定义的 `execute`；
  - `list_agents` 执行原 body 后过滤指导及其分支；
  - 控制工具在原 body 前判定，命中指导时抛错；原 schema/render/notification 仍由原 Runtime 生成。
  - UI、名额统计、goal adapter、普通任务仍读原服务，内部名额继续看到真实运行指导。
- **O8 把 shield 从 `followup`/`steer` 扩展到 `inject`。** 父 agent 关闭期间的结算也走同一识别函数；同时补 unwrap、身份边界和有界缓存。
- **O6/O8 共用一套身份判据：** 只读子会话自身 `subagent/descriptor`（`seq >= session.inheritedEventCount`），不把继承事件、label 或全局 ID 集合当作唯一事实。
- 先在 `guide-panel` host 半落地一个可测试的 identity helper；O6/O8 都依赖它。是否抽成独立包，等第三个消费者出现再决定。

## 2. 现状与约束

### 2.1 已确认的方向

- O6：模型工具的 `children` / `descendants` 不暴露指导；UI、名额门和普通任务不受影响；冷恢复/重载仍有效。
- O8：只拦指导 settlement；普通子代理、系统消息和用户消息原样；覆盖父关闭/恢复路径。
- 不把过滤后的 sessions/catalog 服务全局提供给其他插件或模型工具（这是 sidebar 适配已经遵守的边界）。
- 不按 label 解除调度等待；label 只用于 UI/迁移显示。
- 不新增跨会话文件锁；不改变指导的写权限。

### 2.2 代码事实

| 事实 | 证据 |
|---|---|
| `list_agents` 是 `ctx.subagents.listChildren()` / `listDescendants()` 的薄适配器 | `list-agents.js`：`execute()` 直接调用两个服务方法并投影 |
| `send_message` / `interrupt_agent` 是 `ctx.subagents.sendMessage()` / `interrupt()` 的薄适配器 | `tool-subagent-control/lib/index.js` |
| 父 agent 关闭时，结算通知走 `parent.inject(message)` | `dsh-subagent` manager 的 `notifySettlement()` |
| 父 agent 空闲/忙时分别走 `followup` / `steer` | 同上，`sendWaking()` |
| 当前 shield 只包 `followup` / `steer`，没有 `inject` | `guide-panel/index.js` 的 `shieldParent()` |
| 当前身份扫描整个 `snapshotEvents`，没有用继承边界 | `guide-panel/index.js` 的 `isGuidanceChildAgent()` |
| 当前没有 unwrap；`guidanceChildIds` / `shieldedParents` 是模块级 | `guide-panel/index.js` 的 `apply()` 清理段 |
| `Session` 有 `inheritedEventCount`、`isOwnSeq()`、`snapshotEvents(fromSeq)` | `dsh-session/lib/index.js` |
| `foldSubagentDescriptor` 是 first-wins；`coldResume()` 用 `events.slice(inheritedEventCount)` 后折叠首个 | `dsh-subagent` descriptor.js / manager.js |

### 2.3 非目标

- 不隐藏指导会话本身（UI、文件/Git/sidechat 仍可按 ID 访问）。
- 不改变名额语义（运行占一个槽、结算释放、闲置不占）。
- 不实现嵌套指导；嵌套场景仍按默认 depth 和保守等待处理。
- 不把指导变成只读；写工具权限不变。
- 不处理 O12 的旧 `kind:guide` 布局清理。

## 3. 共用身份判据

### 3.1 判定规则

一个子会话是指导，当且仅当：

1. `session.header.origin === 'subagent'`；
2. `session.inheritedEventCount` 是安全整数；
3. 从 `inheritedEventCount` 开始的**自身事件**中，**第一个** `subagent/descriptor` 折出的 descriptor 满足：
   - `descriptor.mode === 'continuable'`；
   - `descriptor.provider === 'guide-fork'`。

宿主 `foldSubagentDescriptor()` 是 first-wins：建立者只追加一个 descriptor，后续同类型事件不能改写 composition；`coldResume()` 也是用 `events.slice(inheritedEventCount)` 后折叠首个。O6/O8 按这个规则实现。goal adapter 在 O2/R6 已统一为 first-wins；descriptor 事件同步折叠自身范围，保留 pending 创建中的即时分类。

继承前缀里的 descriptor 一律不参与判定。仅凭 `header.agentPreset === 'guide'` 不够：指导自己 spawn 的普通子代理也会继承 `agentPreset: 'guide'`。

### 3.2 数据来源

- **同步路径（shield 必须）**：`sessions.get(sessionId)` 返回 live/restored Session，读取 `session.snapshotEvents(session.inheritedEventCount)`，用 `foldSubagentDescriptor(ownEvents)` 折叠首个自身 descriptor。注意 `snapshotEvents()` 与 `ownEvents()` 都被宿主标记 deprecated；这里只用显式范围让继承边界可见，并把这条依赖列入 O21/升级清单。宿主自己的 `coldResume()` 也用同样的 `slice(inheritedEventCount)` + `foldSubagentDescriptor`；长期替代是 observation/投影，在宿主提供同步身份 API 前 shield 需要这个受控例外。
- **持久化回退（工具结果分类可能需要）**：`sessionQuery.observeSession(id)` 返回 `header` / `inheritedEventCount` / `events`，复用 goal adapter 的 `providerFromObservation()` 规则。
- **创建提示（仅作加速）**：`startThread()` 成功返回的 `childId`、`agent/created` 时确认的指导 ID，写入一个有界 hint 表（见 3.3）。hint 不是唯一事实；Session 不可读时才使用。

### 3.3 缓存与失效

- `WeakMap<Session, { seq, value }>`：按 Session 生命周期缓存分类；`session.seq` 变化或 `session/event` 出现 `subagent/descriptor` 时失效。
- `Map<sessionId, { value, at }>`：有界 hint 表（默认 128 条，TTL 10 分钟），只用于 Session 已不可读时的结算/工具分类；不做无限增长。
- `agent/disposed`、新同 ID 生命周期和所属实例卸载时清理 hint；`session/event` 的 descriptor 事件到达时重新确认。first-wins 下后续同类型事件不会改变首个分类，但缓存仍按 `seq` 失效以保持简单。O8 另在子释放时保留一次性、父对象绑定的结算凭据，见 §5.3。
- 不用 label 作为分类输入；label 只用于面板显示和迁移识别。

### 3.4 失败策略

- 分类抛错、`sessionQuery` 不可用、descriptor 缺失：返回 `undefined`（未知）。
- **O8**：未知结算按“普通消息”转发，避免误吞普通子代理。
- **O6 列表**：未知条目保留，避免把普通工作从模型目录删掉。
- **O6 控制**：未知目标放行，让工具自身的授权/拒绝逻辑处理；不要因为分类失败误伤普通 `send_message`。
- 只有明确分类为指导时才隐藏/拦截。

### 3.5 与 goal adapter 的关系

goal adapter 的 `createIdentityReader()` 已经使用 observation lease + 自身 descriptor，适合它的异步等待路径。O6/O8 不直接复用其模块级状态，但复用同一判定规则；两边用同一组 fixture 断言以下案例结果一致：

- 只有继承前缀含 guide descriptor；
- 自身首个 descriptor 是 guide；
- 后续同类型 descriptor 不改写首个（first-wins）；
- descriptor 损坏/缺失；
- 冷恢复后的 Session；
- 普通工作子代理；
- goal adapter 的双 descriptor 与事件路径已在 O2/R6 统一 first-wins，并以官方 fold 回归。

初稿按 D24 将 reader 放在 panel。后续用户选择 D26 独立 Host shield 后，核心实现迁到 `guide-shield/identity.js`，panel 的同名文件保留兼容导出；goal adapter 保留独立 reader、统一 first-wins 语义。没有再抽额外 identity-only 包。

## 4. O6：模型不可见投影

### 4.1 目标

- 模型调用 `list_agents({ scope: 'children' })` 时，不返回指导条目。
- 模型调用 `list_agents({ scope: 'descendants' })` 时，不返回指导，也不返回指导的后代分支。
- 模型对指导目标的 `send_message` / `interrupt_agent` 被拒绝，并得到可理解的错误。
- 普通子代理、诊断、普通分支保持原样；UI、名额、goal adapter 不受影响。
- 不支持该 hook 的宿主显示明确状态，不静默变成“看起来支持”。

### 4.2 拦截点

> **T4.1 实施更新**：实际采用 **B′ 注册前装饰**，不再使用 `tools/post-execute` / `tools/pre-execute`。下面的 4.2.1/4.2.2 是早期 hook 设计，保留作对照；当前实现见 §4.8。

#### 4.2.1 早期设计：`tools/post-execute` 过滤 `list_agents`

`dsh-tools` 在工具执行后运行 `tools/post-execute` waterfall，允许 `accept` 决策替换 `value` 或 `content`。监听器签名：

```js
ctx.on('tools/post-execute', async (exec, result, next) => {
  const decision = await next()
  // ...
  return { ...decision, value: filtered }
}, { global: true })
```

约束：

- 只在 `exec.name === 'list_agents'`、`decision.kind === 'accept'`、`!result.isError` 时处理。
- 若 `decision` 已经替换了 `content`，不要改；只处理 `decision.value ?? result.value` 的数组。
- 过滤后返回新数组；不要修改原数组或条目对象。
- 该 hook 是全局的；用 `{ global: true }` 确保 agent scope 也能收到。若该选项在目标 Cordis 版本不可用，退回 root context 注册 + 显式 disposer（见 6.1）。
- 这个 hook 不触碰 `ctx.subagents`，所以名额统计、goal adapter、UI 仍能读到指导。

#### 4.2.2 早期设计：`tools/pre-execute` 拦截控制调用

`tools/pre-execute` 是 allow/deny/ask/cancel waterfall；监听器可以在 `next()` 之后把决策改成 deny：

```js
ctx.on('tools/pre-execute', async (exec, next) => {
  const decision = await next()
  if (decision.kind === 'deny' || decision.kind === 'cancel') return decision
  if (exec.name !== 'send_message' && exec.name !== 'interrupt_agent') return decision
  const verdict = await controlVerdict(exec.name, exec.arguments?.agent_id, exec.agent)
  return verdict === 'deny'
    ? { kind: 'deny', reason: 'Guidance conversations are not task subagents; use the guidance panel to open or stop them.' }
    : decision
}, { global: true })
```

约束：

- 只在目标 id 是字符串、caller agent 存在时判定。
- 分类未知时放行（fail-open），让工具自身的 lineage 检查决定。
- `send_message` 的目标如果是“直接子级且是指导”，拒绝；如果目标是 caller 的父级（例如指导的子代理向指导回报），放行。
- `interrupt_agent` 从目标向上走到 caller；如果路径上（含目标、不含 caller）出现指导，拒绝。这样主父级不能 interrupt 指导及其工作后代，但指导自己可以 interrupt 自己的孩子。
- 拒绝文案面向模型，说明“指导不是任务子代理，去面板操作”，避免模型反复重试。

### 4.3 `list_agents` 过滤算法

```js
async function filterEntries(entries, scope) {
  const guide = new Map()
  await Promise.all(entries.map(async (entry) => {
    guide.set(entry.id, await identity.isGuideId(entry.id)) // true / false / undefined
  }))
  const hidden = new Set()
  const output = []
  for (const entry of entries) {
    const underHidden = scope === 'descendants' && entry.parent !== undefined && hidden.has(entry.parent)
    if (underHidden || guide.get(entry.id) === true) {
      hidden.add(entry.id)
      continue
    }
    output.push(entry)
  }
  return output
}
```

要点：

- `children`：只看条目自身，不处理子树；`entry.parent` 不存在。
- `descendants`：按工具的前序输出遍历；`entry.parent` 是持久化父会话 ID。指导条目入 `hidden`，其所有后代（普通 child 或 diagnostic）一并跳过。
- `diagnostic`：如果 `entry.id` 是指导，或 `entry.parent` 已在 `hidden`，同样隐藏；其余诊断保留。
- 分类失败（`undefined`）保留条目，避免误删普通工作。
- 不改变 `list_agents` 的 schema；过滤后的数组仍符合原输出契约，`(no subagents)` 由原 render 处理。

### 4.4 控制面判定

```js
async function controlVerdict(name, targetId, caller) {
  if (typeof targetId !== 'string' || targetId === '' || caller === undefined) return 'allow'

  if (name === 'send_message') {
    const parent = await parentOf(targetId)
    if (parent !== caller.id) return 'allow' // 目标是父级/非直接子级，交给工具授权
    return (await identity.isGuideId(targetId)) === true ? 'deny' : 'allow'
  }

  // interrupt_agent：目标必须在 caller 之下；路径上不能有指导
  let current = targetId
  while (current !== undefined) {
    if (current === caller.id) return 'allow'
    if ((await identity.isGuideId(current)) === true) return 'deny'
    current = await parentOf(current)
  }
  return 'allow' // caller 不是目标的祖先，交给工具自身拒绝
}
```

边界语义：

| 调用 | 结果 |
|---|---|
| 主父级 → 直接指导（send） | 拒绝 |
| 主父级 → 指导的工作后代（interrupt） | 拒绝 |
| 指导 → 自己的孩子（send/interrupt） | 放行 |
| 指导的孩子 → 指导（send，父级） | 放行（普通回报路径） |
| 主父级 → 普通直接子级（send） | 放行 |
| 主父级 → 普通分支（interrupt） | 放行 |
| 分类失败/目标无法读取 | 放行（fail-open） |

`parentOf(id)` 优先 `sessions.get(id)?.header?.parentSession`，其次 `sessionQuery.observeSession(id).header.parentSession`；结果按 Session/ID 有界缓存。

### 4.5 状态、配置、降级

配置建议（`guide-panel/cordis.patch.yml`）：

```yaml
model:
  # O6: 过滤 list_agents，并拒绝模型对指导分支的控制调用
  hideGuidance: true
  blockControl: true
```

`/guide/api/state` 增加：

```js
{
  modelProjection: {
    mode: 'off' | 'pending' | 'idle' | 'active' | 'partial' | 'unsupported',
    reason: null | string,
    blockControl: boolean,
    scanRevision: number,
    tools: {
      list_agents: { enabled, visibleScopes, visibleDefinitions, wrappedDefinitions, unsupportedDefinitions, notExposed, reason },
      send_message: { ... },
      interrupt_agent: { ... },
    },
  },
}
```

- `off`：配置显式关闭；不安装注册观察层。
- `pending`：tools/agents/来源契约尚未完成首轮扫描。
- `idle`：来源/注册边界有效，但当前没有可见且启用的目标定义。
- `active`：至少一个目标可见，当前所有可见且启用的定义均已包装。
- `partial`：存在可见但来源未知、形状不支持、冻结或包装失败的定义；`wrappedDefinitions` 可为 0。
- `unsupported`：tools/identity/registry/tools.register 或来源映射等必需契约不支持；不包装半套。
- `scanRevision` 标识最近一次扫描；状态只描述该轮覆盖率，不等于“任意第三方后置篡改不可能”。

### 4.6 测试

单元/离线：

- `node guide-panel/test/model-projection.test.mjs`：children/descendants、来源映射、active/idle/partial/off、控制拒绝、取消、注册前装饰、未知注册者、组合契约。
- `node guide-panel/test/contract.test.mjs`：真实 `createIdentity()` 与 B′ 投影组合，防止再次出现 `isGuide`/`isGuideId` 契约漂移。
- [注册观察层探针](../evidence/O6-enforcement-boundary-2026-11-02/probe-registration.mjs)：注册 caller/scope、来源 runtime、disposer、失败回滚、fiber bootstrap（2/2）。

集成：

- T4.1 真实隔离 Host：**44 项断言，errors=[]**，覆盖 O8、O6 直接工具、真实 native `tool-call` → session `tool/result`、实际 PTC `run_code` 子调用、控制拒绝无副作用、面板禁用/重启用、`/guide/api/start`。
- 证据：[runtime-result.json](../evidence/LI-stage1-2026-11-02/runtime-result.json)、[T4.1 报告](../evidence/O6-O8-2026-11-02/report.md)。

### 4.7 风险与支持边界

- **注册/来源是私有边界**：`tools.register`、精确 `layers` 注册层、`Symbol.for('cordis.original')`、`ctx.registry.get()`、`fiber.runtime` 与 `dsh-scope.scopeOf()` 均需版本预检；本实现钉住 DSH `0.2.1-rc.3` 的 5 个源码哈希（`dsh-tools`、`dsh-tool-subagent-control`、`list-agents`、`cordis`、`dsh-scope`）。
- **B′ 不是任意第三方隔离**：后置 listener 显式替换 `value`/`content`、无事件直接改 `execute`，都不在保证内；遇到未知定义/来源时状态为 `partial`，不静默当作官方定义。
- **首调窗口**：正常注册在进入 registry 前装饰；已有定义通过原模块 live fiber bootstrap。直接调用未注册函数、绕过 `ctx.tools.register` 的路径不在保证内。
- **控制拦截可能挡住用户让模型停止指导的用法**：产品上以面板/原生 UI 为准；这是 O6 的明确取舍，README 已写清。
- **HMR/所有权**：关闭时先失活，再只还原自己仍持有的指针；第三方外层包装保留，旧 wrapper 失活后直通。O8 父重建/runtime closing 已由后续 O2/R6 独立矩阵覆盖。

### 4.8 T4.1 实际实现记录

- `guide-panel/model-projection.js`：
  - `loadModelProjectionSource()` 动态导入原 control/list/scope 模块并校验源码哈希；来源不可用 → `unsupported`。
  - `tools.register` 窄观察层：在定义进入 registry 前装饰；保留 caller scope、原 disposer；注册失败只回滚本次新增装饰。
  - `list_agents` 包装：await 原 body，按 `identity.isGuideId(id, { signal })` 过滤；原 schema/render/notification 不变。
  - `send_message` / `interrupt_agent` 包装：原 body 前做身份/祖先判定；命中抛 `CONTROL_DENY_REASON`，原工具体不执行。
  - 取消优先：已 abort 的控制调用返回 schema 合法哨兵（`{messageId:''}` / `{accepted:true}`），list 返回 `[]`，交给原 `dispatchToolBody` 的 abort 分支转 `ABORTED`；不调用原控制 body。
  - 来源：`ctx.registry.get(originalModule)` 的 runtime 身份；已有定义从 `runtime.fibers` + `scopeOf(fiber.ctx)` + 精确注册层 bootstrap。来源记录保存接受的 execute 指针；有事件的未知替换不自动重信任。
  - 状态：`off/pending/idle/active/partial/unsupported`，含每工具覆盖计数、`scanRevision`、`blockControl`。
  - 所有权：`active`/token，卸载先失活；只还原当前仍属于本实例的 execute/register。可见性仅用于覆盖计数，生命周期使用 `layers.global.tools.get` / `layers.peek(scope).tools.get` 精确注册检查；最后一个注册注销后释放强记录。契约缺失为 unsupported，不裁剪仍注册的隐藏/未发布定义。
  - 取消/失活：所有 identity/parent await 后及异常分支均先检查 caller abort，再作失活委托；取消不能因卸载转为未知放行。
  - 诊断：`diagnostics.registeredDefinitions` / `wrapperRecords`；第三方同对象 execute 变更后为 partial，tool reason 为 execute-replaced。
- 接口契约：统一使用 `identity.isGuideId()` / `parentOf()`；启动预检缺失时 `unsupported`，不再静默 fail-open。
- 已移除 `tools/post-execute` / `tools/pre-execute` hook 和 `host-hooks.js`；`postHooks` 从 11 降到 10（真实 Host 观测）。
- 配置保持：`hideGuidance` 为主开关；`blockControl:false` 只装饰 `list_agents`；独立 guide-shield config 的 `inject` 仍默认开。

上述注册生命周期/取消/来源整改的最新证据为 [34 组真实 Runtime 与 86 项 Host 验收](../evidence/B-prime-fixes-2026-11-02/report.md)。本节之前的 44 项指首次基线；不把它当作完整扩展矩阵。精确注册层同属已有 dsh-tools/dsh-scope 源码哈希支持范围，升级列入 O21。实际 desktop 已于 2026-11-03 完成冷启动与正常桌面运行确认；O2/R6 收尾见 [关闭结论](O2-R6-CLOSEOUT.md)。

## 5. O8：结算 shield（O2/R6 后的当前实现）

### 5.1 目标与所有者

独立 Host bundle `@local/dsh-guide-shield` 持有父 agent 的 `followup` / `steer` / `inject` 包装。panel 只连接服务与读取状态，panel/provider/O6 fiber 的 HMR、禁用和重新启用不释放防护；服务自身卸载才释放其包装。

只拦已确认指导的 subagent-settled 通知：父空闲走 followup、父忙走 steer、真实 scoped closing 走 inject。普通工作、用户/系统消息原样。首次 delivery:caller 本来不通知，不作为 shield 生效证明。

### 5.2 包装与卸载所有权

包装实现见 [shield.js](../guide-shield/shield.js)。每服务实例用 WeakMap 按精确父对象去重，并持有可释放的 restore 记录；Symbol 标记只用于诊断，不承担跨实例所有权。

```js
const wrapper = function shielded(input) {
  if (!active) return Reflect.apply(original, this, arguments)
  try {
    if (isSettlement(input, parent)) return undefined
  } catch {}
  return Reflect.apply(original, this, arguments)
}
```

restore 先失活，再只在当前方法指针仍是自己的 wrapper 时还原。第三方外层保留的旧闭包失活后直通，保留 receiver、全部参数与返回值；不覆盖第三方。父释放时同步移除相应 restore 记录，服务卸载时 restoreAll 并清空自身身份状态。

### 5.3 身份与释放后结算

同步身份优先查 live/restored Session 的首个自身 descriptor（§3）。通知优先核对 source.kind=subagent-settled 与 senderSessionId；有明确非结算 source 时直接放行。兼容无 source/缺 sender 的旧通知时，仅检查首块 summary 的固定前缀及其提取的已知 ID，不扫描任意 closing text。

Runtime 先释放子 handle、移除 live agent/Session，再 notifySettlement。服务在 agent/disposed 时从自身 descriptor 确认指导，并保存按**精确父对象**分组的一次性结算凭据；live/hint 无法分类时消费凭据。每父最多 128 条、10 分钟惰性过期，只保存 ID/时间；同 ID 新生命周期、消费、父释放或服务卸载时清理。该上界覆盖当前 Runtime 的 teardown 后立即通知契约，不承诺任意延迟或重复通知。

异步工具身份可回退 sessionQuery observation；同步 shield 不等待 observation。两条分类均要求 continuable + guide-fork、忽略继承前缀并采用 first-wins。observation 有取消/超时、clear/forget、对象替换后的回写限制与迟到 lease 释放；parentOf 核对返回会话地址。未知身份仍转发以免误吞普通工作。

### 5.4 生命周期接线

- 创建：panel 的 startThread 返回 childId 后向服务登记 hint；非面板创建由服务的 agent/created 或 descriptor 事件发现。
- 创建事件：同步分类，不在 serial 创建回调等待 observation。descriptor 迟到时重新折叠自身范围；父晚于孩子出现时检查 live 直接孩子并补挂。
- 冷恢复：恢复的 Session 和 agent/created 同步确认身份，覆盖立即结算；释放后由一次性凭据承接通知。
- 父关闭：原 Runtime scoped teardown 真实选择 inject，复用同一身份判定。
- 父重建：旧 activation 的 parent 不是当前父对象时，Runtime 本身丢弃通知，不补偿投递；新父恢复已有指导或新建指导时按新生命周期挂载。
- panel HMR：独立服务与父 wrapper 不变；旧 panel 释放自身 O6/identity，结算防护持续。
- 服务卸载：失活并仅还原自己的指针。服务自身核心 HMR/整图关闭顺序属于 O11/O21，不能套用 panel HMR 的连续保护结论。

### 5.5 状态与配置

当前配置位置为 [guide-shield/cordis.patch.yml](../guide-shield/cordis.patch.yml)，不再写 panel 的嵌套 shield config：

```yaml
config:
  enabled: true
  inject: true
```

`/guide/api/state` 返回 settlementShield 的 mode/reason/inject。active 表示服务启用且没有已知包装失败；partial 表示某个父方法缺失/冻结等导致包装失败；enabled:false 为 off。缺独立服务时 panel 返回 off/host-service-unavailable。inject:false 仅关闭 inject 包装，保留 followup/steer，限诊断/回滚。

### 5.6 验收与兼容边界

已验收真实 idle/busy/scoped closing、非面板创建、子释放后身份、普通工作阳性对照、父重建与旧 activation guard、两进程恢复、真实 observation、panel HMR 新 apply 显式门控放行前结算及 HMR 后新指导。卸载包含第三方外层和交叠实例回归。

同步 snapshotEvents(inheritedEventCount) 仍是 deprecated API 的受控依赖。当前无法确认身份时转发；不能宣称已具备完整 unsupported 预检，统一契约与升级替代方案仍归 O21。服务自身核心 HMR、整个 Host 任意关闭顺序、未知版本和真实模型长时范围归 O11/O21。

### 5.7 O2/R6 实施与收尾

O2/R6 在支持基线内已关闭，详见 [收尾结论](O2-R6-CLOSEOUT.md)。prepare 122 次断言（O2 32 项）、restart 98 次（O2 8 项），errors=[]；两个阶段含重复基线，不合计为 220 个独立场景。

[基线报告](../evidence/O2-R6-2026-11-02/report.md)记录实现与隔离矩阵；[2026-11-03 迁移报告](../evidence/O2-R6-desktop-migration-2026-11-03/report.md)记录实际 desktop 安装、备份、冷启动与正常桌面组件运行确认。本机无旧 panel shield override，沿用 enabled/inject=true；既有 M3 指导及父日志哈希不变。保留原历史记录与恢复资料。

## 6. 实施顺序

详细任务、文件清单、依赖和验收见 [O6/O8 任务清单](O6-O8-TASKS.md)；下面是顺序摘要。

### 6.1 第 0 步：identity helper + 预检

- 在 `guide-panel` host 半新增 `identity.js`（或 `host-identity.js`），导出：
  - `isGuideSession(session)`
  - `isGuideIdSync(id)` / `isGuideId(id)` / `parentOf(id)`（sync + durable fallback）
  - `createIdentityCache()`（WeakMap + 有界 hint）
- 用 `ctx.inject(['tools','sessions','agents','sessionQuery'])` 做最小预检；缺 `tools` 时 O6 `unsupported`，缺 `sessions`/descriptor fold 时 O6/O8 `unsupported`。
- `ctx.on(...)` 的 `{ global: true }` 注册先做一个小型 host fixture 验证；如果不可用，改为 root context 注册 + `ctx.effect` 清理。
- 不改变任何行为；先合并测试。

### 6.2 第 1 步：O8

- `shieldParent` 增加 `inject`；改为可 restore。
- `isGuidanceSettlement` 改用 identity；删除无限 ID 集合。
- effect 清理 restore；补 `shield.test.mjs`。
- 这一步风险最低，先交付；即使 O6 未完成，父关闭 inject 也不再污染。

### 6.3 第 2 步：O6 列表过滤

- 接入 `tools.register` 窄观察层；实现注册前 `list_agents` execute 装饰。
- 先只做 `children`，再加 `descendants` 子树；每步补测试。
- state 增加 `modelProjection`；面板提示。
- 保持 `list_agents` 原 schema/渲染/notification。

### 6.4 第 3 步：O6 控制拦截

- 在 `send_message` / `interrupt_agent` 的原 execute 前做异步身份判定；不使用 pre-execute hook。
- 先 `send_message` 直接指导，再 `interrupt_agent` 分支路径。
- 默认 `blockControl: true`；如果产品上需要保留模型紧急停止，再加配置例外。
- 补边界表、取消/所有权和测试。

### 6.5 第 4 步：真实 Host 与文档

- 扩展 `guide-goal-adapter/scripts/smoke.mjs` 或新增隔离 Host 测试：
  - 服务层仍含指导；
  - 模型工具层隐藏；
  - `inject` 不污染父历史；
  - 冷恢复/重载。
- 更新 README/ARCHITECTURE/OPEN-ITEMS 状态和证据链接。
- 若 O21 尚未做，至少记录注册观察层/来源哈希的支持基线和升级重验步骤（见 §4.7）。

## 7. 验收清单

### O6

- [x] `list_agents` `children` 不返回指导。
- [x] `list_agents` `descendants` 不返回指导及其分支；普通分支/诊断保留。
- [x] `send_message` 到直接指导被拒绝；普通直接子级、指导孩子向指导回报放行。
- [x] `interrupt_agent` 到指导/指导工作后代被拒绝；指导自己的孩子、普通分支放行。
- [x] UI、名额门、goal adapter、普通任务不受影响（服务层仍见指导）。
- [x] 冷恢复、重载、卸载后行为仍正确；O8 面板禁用/重启用后 O6 仍 active。
- [x] 不支持 host 时 `modelProjection: unsupported/partial`，面板有提示。
- [x] 真实 native `tool-call` → session `tool/result` 通过。
- [x] 实际 PTC `run_code` 子调用通过（临时工作目录，只调用工具）。

### O8

- [x] `followup` / `steer` / `inject` 三条结算路径都拦住指导（T4.1a 真实 Host）。
- [x] 普通子代理、用户消息、系统消息、兄弟结算原样。
- [x] 继承前缀不误判；后续同类型 descriptor 不改写首个分类；缓存按 `seq`/事件失效。
- [x] 面板卸载/重载 restore；T4.1a 覆盖禁用/重启用。
- [x] 冻结 agent 不抛，状态 partial。
- [x] runtime closing/父重建/Host 重启及真实 panel HMR 门控结算窗口（O2/R6）；实际 desktop 新 bundle 安装与启动已于 2026-11-03 确认。

## 8. 已确认的取舍（2026-11-02）

用户已确认以下 5 项；实现任务按这些默认值执行，不再作为待决问题：

| # | 取舍 | 已确认结果 | 对实现的影响 |
|---|---|---|---|
| 1 | 默认阻止模型对指导的 `send_message`/`interrupt_agent` | **是** | 原控制定义的 execute 前判定；`model.blockControl: true`；面板/原生 UI 仍是停止通道 |
| 2 | 隐藏指导的整个后代分支 | **是** | `descendants` 过滤按 `parent` 传递隐藏；诊断也跟随隐藏 |
| 3 | 指导的孩子向指导发消息 | **放行** | `send_message` 目标为父级时不按指导拦截；保证普通 continuable 回报路径 |
| 4 | 现在抽独立 identity 包 | **不抽** | identity 放 `guide-panel` host 半；goal adapter 不改，仅用同一 fixture 防漂移 |
| 5 | `inject` shield 默认开 | **是** | 独立 guide-shield config 的 `inject: true`；关闭仅用于诊断/回滚 |

需要保留的例外：如果后续真实使用发现“模型必须能紧急停止指导”，只调整 `blockControl` 默认值或增加显式配置，不改变身份判据和 `list_agents` 隐藏。

## 9. 与其它待办的关系

- **O2/R6**：本设计的 §3/§5 同时修复 unwrap、继承边界和父关闭路径；O2/R6 已补 HMR/父重建/兄弟结算与两进程恢复验收，后续所有权调整见 §5.7。
- **O19**：名额统计应复用 §3 的 `isGuideId()`，`reserve` 边界单独校验；不在本设计里改容量算法。
- **O21**：本设计的 preflight 是最小版本；O21 再把 panel 的其它私有 API（`prepareContinuable`、`startActivation`、`sessionTitle`、`sidebarRightTabs`、`slots`）纳入统一兼容状态。
- **O12/O20/O5**：与本设计无直接依赖；O20 的自动归档仍从 `subagentCatalog` / label 枚举，后续可换成同一 identity。

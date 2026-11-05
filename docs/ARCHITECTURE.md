# 当前实现机制

> B′ 注册生命周期、取消与卸载交错、来源变更三项整改已通过扩展验收。当前保证以 [修复报告](../evidence/B-prime-fixes-2026-11-02/report.md) 为准。

更新：2026-11-05。本文描述当前代码；交付与决定在 [项目状态](../PROJECT-STATUS.md)，已接受边界在 [已定边界](DECISIONS.md)，安装和使用见 [README](../README.md)。

## 会话、preset 与上下文

guide-panel 自注册 `guide-fork` provider。创建时传入父会话最后一个已完成轮次之前的 seed、inheritedEventCount、parentSession 和 origin:subagent，并同时指定 agentPreset:guide。会话 ID 只是地址，单独复制 ID 不会继承日志。

provider 的 prepareContinuable 负责 seed，独立 preset 提供人格与工具。首次 activation 使用 delivery:caller，不向父会话投递结算通知；后续原生对话追问可冷恢复，宿主按持久化的 agent-preset/selected 重新挂载 preset。

完整 seed 成本已被接受，当前不做压缩 rebase；v1 不专门支持嵌套。指导工具面允许修改文件，和父 goal 并行时仍遵循各自宿主权限。

## API 与界面

guide-panel 提供 `/guide/api` 下的 POST ping、state、start 和 auto-archive。start body 为 `{ sessionId, question }`，父 agent 必须精确在线；请求经 connection 围栏和 64 KiB body 限制。state 返回容量、归档策略、候选核实结果与兼容状态。

面板 tab kind 为 guide-panel，不能复用内置 guide kind，避免覆盖原生开始页。指导对话使用原生 subagentchat resource，优先在右栏新分栏打开；关页签只释放视图引用。用户手动归档可停止执行；自动归档只处理核实为空闲的候选，不强制停止活动。

面板列表合并父 subagentCatalog 中“指导: ”条目与 localStorage 记录；后者帮助找回归档项。问题草稿按 sessionId 保存。专区显示当前会话的指导，并分组补充同一根会话下的其他指导；面板本身仍按当前 seat 打开。

## goal adapter

[guide-goal-adapter](../guide-goal-adapter/README.md) 导入原 driver 的 apply，不复制状态机。package patch 禁用原 driver entry、插入独立 entry；挂载时检查实际 Loader，只允许一个启用的调度入口。

原 driver 在私有 subagents 作用域运行。facade 转发其余方法并绑定原接收者；仅在 waitForChildren 中建立只读 manager 视图，调用原 join：resident 每次读取都从真实 Map 派生，materializations 保留原对象。其他消费者仍读取全局原服务。

调度分类使用 sessionQuery.observeSession 的 observation lease，核对 header/父会话/继承边界，读取第一个子会话自身 descriptor（与 Runtime first-wins 一致）。只排除已确认的直属本地 guide-fork activation，且不能 closing 或拥有工作后代。lease 释放、Session 级弱缓存与事件失效避免只依赖创建时 ID。

pending、external、普通工作与身份不明对象继续原等待。driver 产物和 join 函数指纹不支持时使用原等待并暴露状态；原模块导入失败则明确启动失败，通过成对脚本恢复，不能静默缺失 driver。

卸载沿用原 driver cancel/disarm，不会自动 re-arm；持久化 checkpoint、revision 与 round-limit 等继续由原状态机管理。

## sidebar adapter

[guide-sidebar-adapter](../guide-sidebar-adapter/README.md) 使用官方 0.28.2 Host/client。它在内存中装饰原浏览器模块 apply，让原 sidebar 读取私有 sessions facade，其他插件和模型工具保持原服务。

局部 snapshot 过滤任务 catalog 与 byId 枚举，隐藏指导及其后代；直接按 ID 查找仍能获得原会话。冻结 source 使用可配置镜像 Proxy，避免 ownKeys 不变量；按原 snapshot/revision 缓存，由原 store 和注册变化事件通知，不新增轮询。

原树/图、计数和 auto-open 共同消费该视图。adapter 只装饰 subagent descriptor 的组件容器，完整复用原任务组件，在底部追加独立滚动专区。guide-panel 优先使用 active adapter 的 v1 注册接口，迁移回退才连接旧 fork seam。

包装记录原指针与所有权，卸载只还原仍由自己持有的包装。重挂使用原 client-modules 的 tearDownEntryFiber 和 entry refresh；不停止 Host agent，不删除会话/设置。未知 sidebar/client-modules 产物或 Cordis 版本保持原侧栏并显示状态。

## 名额与自动归档

独立 `guide-admission` 服务负责原生 materialize 同步准入与权威快照。池按精确 live parent/resident 连续链解析，历史根 ID 不能替代；S 取原生 slots.size，包含创建中、closing、external 和仍持有 inbox 的 idle parked。已结算且 native release 后才不占槽，归档不重复释放。

C 跟随 Host volatile getter，R 按池，M 按 profile 全局。G 对自身 continuable/guide-fork descriptor 与接纳记录按 activation 对象去重。检查、登记、调用原生占槽期间无 await；普通工作直接委托。已有 creating 无法恢复 provider 时暂禁指导，待发布/回滚重新核对；manager 赋值同步接管，旧世代 G 在释放前继续计入。

panel 的 state 返回同源 admission/poolsBySession；旧跨根 catalog/label 和 pendingStarts 名额门已删除。client 从该快照按池计算压力和峰值保持，不再使用跨根 running summaries。候选合并已加载 projection、用户记录和 summary，并轮转处理超过 128 条的历史。Host 以自身 descriptor/父关系核实候选；客户端覆盖右栏保存页签与主视图打开状态，Host 自动归档不传 stopActivity，活动竞争交给原生拒绝；native busy 或当前池/身份未知时不自动归档。自动归档默认关闭（`archive.auto`），显式开启后才启动客户端调度；手动归档仍可停止执行。

核心服务采用冷更新，panel HMR 不卸载它；服务自身卸载/重载不承诺连续执法。未知源码/函数/形状或方法所有权变化报告 unsupported，不能声称所有原生入口仍受策略保护。生产隔离验收与实际 desktop 冷部署通过，见 [实施记录](../evidence/O19-production-2026-11-03/report.md)。

## guide-manager（Phase 3）

[guide-manager](../guide-manager/README.md) 是独立 Host + client bundle，不 import 六个组件。Host 半边从官方 `pluginManager.listPlugins()`/`listBundles()`（不可用时降级读 profile 清单）、组件自己的可选 state 服务、`pluginPackages` 解析的实际产物哈希和 `$DSH_HOME` 下的 skill 文件聚合状态，经 `/guide-manager/api/state` 暴露；client 半边在官方插件页注册 `plugins.tab`「指导」标签页。每个组件带 `action.gate.enable/disable`：契约、必需产物、依赖、组件 unsupported/failed 是硬阻断；宿主版本/构建、产物未知、版本漂移是警告；停用始终允许用于恢复。`/guide-manager/api/action` 只有门禁通过才执行：panel/sidebar 转调官方 `pluginManager.setPluginEnabled` 热生效；admission/shield/goal 只写 `profile/.guide-manager/pending.json`，由 `helper/restart-guide-manager.cmd` 在 Host 停止时调用官方 `writePluginEnabled` 应用并重启。goal 的 intent 同时包含 adapter 和原 driver，保持成对；preset/manager 为 `locked`。Phase 3 读取 profile dependency spec，把本地 `link:` 包映射为 `source-reload`：比较包内最新 mtime 与 Host 启动时间，UI 用 `reload-guide-manager.cmd` 重启加载；registry/tarball/git 包标记为 `package-manager`，仍由官方插件页执行 remove/install。冷切换的 patch 备份由 `rollback-guide-manager.cmd` 恢复最新一份。状态区分 `ready`、`ready-unverified`、`degraded`、`unsupported`、`failed`、`disabled`、`missing`、`unknown`，并把 version/contract/host 漂移显示为未验证而不是不兼容。

## O21 契约与维护边界

1.1.0 先核对官方 subagent/Cordis 及右栏/workspace 客户端产物，Host 检查必需服务/方法，客户端检查原生注册、保存 tab inventory 和主视图 selection。`/guide/api/state` 暴露 panelCompat，未知或缺失时只读/不可用并拒绝创建和自动归档；不挂半套 provider/tab。shield 独立预检，不支持时不声称 inject 防护 active。官方同步身份读取已 deprecated，当前按固定产物受控使用并公开诊断；升级与核心重载遵循冷更新，见 [维护手册](MAINTENANCE.md)。

## 结算 shield：与 goal 适配独立

首次 delivery:caller 本来就不投递父结算。冷恢复通常回到 delivery:parent，因此独立 Host `@local/dsh-guide-shield` 服务包装父 agent 的 `followup` / `steer` / `inject`，丢弃已登记指导发送的 subagent-settled 通知；优先核对 source.kind/senderSessionId，旧无 source 消息才回退首块 summary 文本。

身份与包装实现位于 [guide-shield](../guide-shield/README.md)；panel 的 identity/shield 入口保留兼容导出。只读自身 descriptor、first-wins；运行时用 Session 弱缓存与有界 hint。子 agent 在 notify 前释放，因此对确认身份保留按精确父对象分组的一次性结算凭据，消费/同 ID 新生命周期/父释放/服务卸载时清理。旧 wrapper 在无法从第三方外层摘除时也先失活直通。

panel 不再持有 shield 的卸载权。真实 HMR 门控证明旧 panel 已卸载、新 apply 未完成时结算仍被拦；真实 closing、父重建、两进程恢复与 observation 见 [O2/R6 验收](../evidence/O2-R6-2026-11-02/report.md)。独立服务自身卸载会释放自己的包装；其核心 HMR、整个服务图关闭顺序不属于 panel HMR 的连续保护承诺。

O6 采用 B′：在 `tools.register` 进入 registry 前装饰原 `list_agents` / `send_message` / `interrupt_agent` 定义（[model-projection.js](../guide-panel/model-projection.js)），保留原 schema/render/notification 和原 disposer。list 执行原 body 后过滤，控制在原 body 前判定；所有 await 后 caller 取消优先于卸载委托。来源按原模块 runtime 身份、首次接受的 execute 指针和 5 个源码哈希核验。已有定义从原模块 live fiber 的精确注册层 bootstrap；覆盖统计用 global/live-agent 可见视图，包装生命周期按精确注册存活管理，暂不可见不还原。事件中的未知 execute 替换失活旧包装并报告 partial，不覆盖第三方。状态仍为 off/pending/idle/active/partial/unsupported，含覆盖计数及注册/包装记录诊断。最新 34 组 Runtime、86 项 Host、11 项浏览器通过。实现和边界见 [归档设计](HISTORY-AND-MAINTENANCE-NOTES.md) / [整改报告](../evidence/B-prime-fixes-2026-11-02/report.md)。

原产物指纹见两阶段报告；最新 B′ 测试范围见整改报告。未验证路径不能套用主路径结论。O8 已通过 T4.1a；O6 完成 T4.1/T4.3 及 BP-1～3 整改；O2/R6 已完成基线矩阵及实际 desktop 部署并关闭，证据范围以 [归档收尾结论](HISTORY-AND-MAINTENANCE-NOTES.md) 为准。

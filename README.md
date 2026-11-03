# DSH 指导模式

> O2/R6 已在支持基线内关闭，实际 desktop shield 已迁移并启动确认，见 [收尾结论](docs/O2-R6-CLOSEOUT.md)。O6 B′ 的独立验收见 [修复报告](evidence/B-prime-fixes-2026-11-02/report.md)。

在主会话旁边打开继承上下文的指导对话，用独立 `guide` preset 提供建议或按要求执行修改。指导可使用写工具，并可与主会话 goal 并行。

截至 2026-11-03，两阶段局部注入与独立 Host shield 均已完成并安装到本机 desktop profile：复用原 goal driver，恢复官方 better-sidebar 0.28.2，通过两个独立 adapter 添加兼容行为。支持基线为 DSH 0.2.1-rc.3 / Cordis 4.0.5；两个 adapter 的未知产物会回退原行为，`guide-panel` 自身尚无同等宿主契约预检（O21）。

## 从哪里开始看

| 文档 | 唯一职责 |
|---|---|
| 本文 | 使用、当前安装、配置和常见问题 |
| [PROJECT-STATUS.md](PROJECT-STATUS.md) | 当前交付、已定决定、验收证据 |
| [OPEN-ITEMS.md](OPEN-ITEMS.md) | 真正尚未实现、待决策或待验证的事项 |
| [架构说明](docs/ARCHITECTURE.md) | provider、身份、局部作用域、shield 和生命周期 |
| [O6/O8 设计](docs/O6-O8-DESIGN.md) | 模型不可见投影与结算 shield；B′ 注册生命周期/取消/来源整改及扩展验收已完成 |
| [O6/O8 任务](docs/O6-O8-TASKS.md) | 已确认取舍后的任务、验收、回滚与完成记录 |
| [O2/R6 收尾](docs/O2-R6-CLOSEOUT.md) | 原完成标准、证据映射、正式关闭判定及 O11/O21 保留边界 |
| [局部注入方案](LOCAL-INJECTION-PLAN.md) | 已确认的工程约束与两阶段交付对照，不是下一轮待办 |
| [工作区整理记录](docs/WORKSPACE-CLEANUP.md) | 文件分类、归档和可回收产物清单 |
| [历史资料索引](docs/archive/README.md) | 旧方案和整理前文档，不能作为当前安装说明 |

## 使用

1. 在主会话先发一条消息，使父 agent 在线。
2. 右侧栏「开始」页 →「指导」，输入问题后开始；也可按 Ctrl/Cmd+Enter。
3. 指导在原生 `subagentchat` 对话页打开，继承父会话最后一个已完成轮次之前的上下文，可继续追问、Stop 和修改文件。
4. 关闭页签会保留会话；在面板或任务页专区点「打开」可回到同一段对话。
5. 归档会停止并隐藏该会话；已归档的指导在面板中以「休眠中」显示，可取消归档、重新打开。其他原生 UI 仍可能可见或可输入。

官方 better-sidebar 的原任务树/图隐藏指导及其分支，计数不含指导；创建指导不会自动弹出普通任务页，普通工作子代理仍保持原行为。指导专区位于原任务页底部，使用已确认的独立滚动区。

主会话模型调用 `list_agents` 时看不到指导及其分支；模型对指导分支的 `send_message` / `interrupt_agent` 会被拒绝，普通工作与指导向父级回报仍放行。需要停止或操作指导时，使用本面板或原生指导对话页，而不是让模型代做。默认开启；可用 `model.hideGuidance` / `model.blockControl` 关闭。

指导和 goal 可以同时修改工作区；当前没有额外的跨会话文件锁或冲突协调器。各自沿用宿主原有权限规则。

## 当前包与运行边界

| 目录 | 职责 |
|---|---|
| [guide-panel](guide-panel/) | `guide-fork` provider、API、面板、专区和自动归档；连接独立准入与 shield 服务 |
| [guide-admission](guide-admission/README.md) | 原生同步准入、权威容量/身份/按池快照；生产验收与 desktop 冷部署完成 |
| [guide-shield](guide-shield/README.md) | 独立 Host 结算防护，panel HMR 时连续持有包装；实际 desktop 新 bundle 已于 2026-11-03 安装并启动确认 |
| [guide-preset](guide-preset/) | `guide` persona 与工具面，必须和 panel 一起存在 |
| [guide-goal-adapter](guide-goal-adapter/README.md) | 在私有 subagents 作用域复用原 driver/join |
| [guide-sidebar-adapter](guide-sidebar-adapter/README.md) | 官方 sidebar 的局部数据视图与原任务组件装饰 |

生产代码不包含上游 driver、join 或任务组件副本；[better-sidebar-fork](better-sidebar-fork/) 仅冻结历史。UI 的 label 前缀过滤和 goal 的可信 provider 身份是不同判据，不能互相替代。

| 能力或边界 | 当前行为 |
|---|---|
| goal 续轮 | 支持产物下跳过已确认的直属指导；普通工作仍等待 |
| 保守等待 | pending 创建、external、closing、身份未知、指导拥有工作后代时继续等待 |
| 上下文 | 复制最后一个已完成轮次之前的 seed；未完成轮次不继承 |
| 名额 | activation 在 native release 前占槽；creating、closing、external、idle parked 均可能占槽 |
| 结算防污染 | O2/R6 支持基线内已关闭：真实 closing、panel HMR、父重建/两进程恢复通过，实际 desktop 部署完成；见 [收尾结论](docs/O2-R6-CLOSEOUT.md) |
| 模型工具面 | `list_agents` 隐藏指导分支；模型 `send_message`/`interrupt_agent` 到指导分支被拒绝；普通工作不受影响 |
| 归档 | 阻止模型执行；其他原生 UI 可能仍允许点开/输入，用户已接受 |
| 嵌套指导 | v1 不专门支持，保留默认 depth 限制 |
| 版本变化 | 未知 driver/join/sidebar/tool 来源回退明确状态；完整面板预检见 O21 |

## 配置

容量 `C` 只读宿主当前有效 `maxActiveSubagents`。R/M 配置位于 [guide-admission/cordis.patch.yml](guide-admission/cordis.patch.yml)：

```yaml
reserve: 2
maxGuides: 4
```

`R` 按原生池；`M` 是 profile 全局指导上限。指导在原生同步占槽前须满足 `S+1 <= max(0,C-R)` 和 `G+1 <= M`。普通工作可使用最后 R 个额度；不承诺一直有 R 个空槽。支持 M=0、R>=C，未知容量/身份阻止新增指导。

归档配置仍在 [guide-panel/cordis.patch.yml](guide-panel/cordis.patch.yml)：

```yaml
archive:
  lowDelayMs: 600000
  midDelayMs: 180000
  highDelayMs: 30000
  holdMs: 120000
```

B1 使用每池原生 `used / capacity`，阈值为 25% / 50% / 75%；C3 每池独立保持峰值 120 秒。已释放 activation 的归档不额外释放名额；native busy/未知/无当前池/状态查询失败时跳过自动归档。O20 的候选发现与主视图打开判定仍待补全。

生产隔离验证与实际 desktop 冷部署均已完成。设置页、Host getter/API 与配置来源核对为 C=8、R=2、全局 M=4，正常 desktop 准入组件运行中。部署状态与核对证据见 [实施记录](evidence/O19-production-2026-11-03/report.md)。

## 本机安装、更新与恢复

`@local/dsh-guide-admission` 已于 2026-11-03 完成成对安装与实际 profile 冷启动验证，正常 desktop 组件运行中。安装/回退入口位于 [guide-admission/scripts](guide-admission/scripts/)，原始 profile 与 panel 备份保存在 [本轮证据](evidence/O19-production-2026-11-03/report.md)。准备脚本会保留已经应用的原始迁移计划，后续升级须另建证据目录。

原有自有包已通过 link/bundle 登记到 `C:\Users\wang\.dsh\profiles\desktop`，官方 `dsh-better-sidebar` 保持 registry 版本 0.28.2。没有面向其他用户的统一安装入口。新增 `@local/dsh-guide-shield` 已于 2026-11-03 登记到实际 desktop，并完成冷启动与正常桌面运行状态核对；本机无旧 shield override。证据与备份见 [迁移报告](evidence/O2-R6-desktop-migration-2026-11-03/report.md)，再次迁移参考 [新服务说明](guide-shield/README.md)。

关闭 DSH Host 后，两个 adapter 的本机切换入口为：

```powershell
./guide-goal-adapter/scripts/install-desktop.ps1
node guide-sidebar-adapter/scripts/prepare-official.mjs
./guide-sidebar-adapter/scripts/install-desktop.ps1
# 恢复阶段一的 sidebar，保留 goal adapter：
./guide-sidebar-adapter/scripts/install-desktop.ps1 -Restore
# 恢复原 goal driver：
./guide-goal-adapter/scripts/install-desktop.ps1 -Restore
```

脚本保存配置和文件级恢复记录，只同步两个自有 link 的 lockfile importer，保留其余 registry 依赖图。`evidence/LI-stage*/desktop-before` 以及阶段二 `official` 目录是当前恢复/本机重装路径的依赖，暂不移动或删除。

原 goal driver 文件没有修改。sidebar adapter 的构建只运行 `node guide-sidebar-adapter/scripts/build.mjs`，不再构建或覆盖 fork。正常升级使用官方包管理流程，未知版本须重新核验私有边界与指纹。

普通 panel 客户端变更需要硬刷新；准入核心代码和 R/M 配置必须停 Host 后冷更新，不承诺服务自身 HMR 空窗连续执法。其余 Host 模块按各自支持边界使用 HMR 或重启。涉及 adapter 首次切换、依赖更新和运行中 goal 时优先冷启动；卸载会沿用原 driver 的取消/disarm，不会自动 resume。

## 验证与诊断

最新结果：原 driver/join 12/12、sidebar 核心及实际官方消费 5/5、B′ 真实 Runtime 34 组、真实隔离 Host **86 项断言**、浏览器 11 项通过。模型使用本机确定性 fixture，没有调用用户外部模型。O6 的 native/PTC 三个工具、standard/guide/custom 首调、冷恢复、配置切换与取消/所有权均有回归；`modelProjection=active`、Host `errors=[]`。两阶段实际 desktop 冷启动/恢复证据仍有效；2026-11-03 已完成当前源码和独立 shield 的实际 desktop 启动确认，O6 为 idle/no-target-tools 且保留 12 条包装记录，见 [迁移报告](evidence/O2-R6-desktop-migration-2026-11-03/report.md)。

证据和未覆盖项见 [阶段一报告](evidence/LI-stage1-2026-11-02/report.md) / [阶段二报告](evidence/LI-stage2-2026-11-02/report.md)。终端实际交互、多 pane 穷举、真实模型长时使用等仍在 [待验证清单](OPEN-ITEMS.md)。

```powershell
node guide-panel/test/identity.test.mjs
node guide-panel/test/shield.test.mjs
node guide-panel/test/lifecycle.test.mjs
node guide-panel/test/model-projection.test.mjs
node guide-panel/test/contract.test.mjs
node guide-panel/test/host-route.test.mjs
node guide-panel/test/panel-render.test.mjs
node guide-panel/test/scheduler.test.mjs
node guide-panel/scripts/lifecycle-smoke.mjs  # 隔离真实 Host、HMR 与跨进程恢复
node --test guide-sidebar-adapter/test/core.test.mjs
node guide-goal-adapter/scripts/smoke.mjs --integration
```

原 driver 和官方消费函数测试使用安装包 Electron Node：设置 `ELECTRON_RUN_AS_NODE=1`，传 `--expose-internals guide-goal-adapter/test/run-host.mjs`；sidebar 加 `--sidebar-core`。详见两个 adapter README。

面板提示 Host 未加载或请求 405 时，检查 `/guide/api` 是否已注册；只刷新客户端不能替换旧 Host 模块。旧 `kind:guide` 页签仍可能残留在布局缓存中，可先手动关闭；已决定的一键清理尚未实现。浏览器同源 SSE 排队（R5）仍待单独复核；O2/R6 的 closing、panel HMR 和父重建已完成支持基线内矩阵，并完成实际 desktop 新 bundle 部署。

输入问题的草稿按会话保存在 localStorage。输入框诊断可在 DevTools 设置 `window.__guideDebug = true`，观察面板底部事件与焦点信息。

# DSH 指导模式

在主会话旁边打开继承上下文的指导对话，用独立 `guide` preset 提供建议或按要求执行修改。指导可使用写工具，并可与主会话 goal 并行。

截至 2026-11-04，两阶段局部注入与独立 Host 服务已完成并在本机验收：goal 复用原 driver，better-sidebar 使用官方 `0.28.2`，通过两个独立 adapter 添加兼容行为；准入与结算防护拆成两个独立 Host 包。当前版本 `1.1.0`，先以私有 GitHub 仓库维护，市场／公开源码发布待稳定后另行决定。当前保留 `private:true`、`UNLICENSED`。

支持基线：DSH `0.2.1-rc.3`（build `be72761ee1a6736ebcdf4f3739363b083ae53c98`）、Cordis `4.0.5`、官方 `dsh-better-sidebar@0.28.2`。未知版本的 adapter 回退原行为，panel/shield 进入只读或 unsupported；不能据支持基线内的结论推定任意版本免维护。工作区在 1.1.0 基线上另有未发布的本地改动：自动归档默认关闭、专区改为混合分组，见 [CHANGELOG](CHANGELOG.md) 的 Unreleased。

## 使用

1. 在主会话先发一条消息，使父 agent 在线。
2. 右侧栏「开始」页 →「指导」，输入问题后开始；也可按 Ctrl/Cmd+Enter。
3. 指导在原生 `subagentchat` 对话页打开，继承父会话最后一个已完成轮次之前的上下文，可继续追问、Stop 和修改文件。
4. 关闭页签会保留会话；在面板或任务页专区点「打开」可回到同一段对话。
5. 归档会停止并隐藏该会话；已归档的指导在面板中以「休眠中」显示，可取消归档、重新打开。其他原生 UI 仍可能可见或可输入。

官方 better-sidebar 的原任务树/图隐藏指导及其分支，计数不含指导；创建指导不会自动弹出普通任务页，普通工作子代理保持原行为。指导专区位于原任务页底部，使用独立滚动区；它显示本会话的指导，并分组补充同一根会话下的其他指导。

主会话模型调用 `list_agents` 时看不到指导及其分支；模型对指导分支的 `send_message` / `interrupt_agent` 会被拒绝，普通工作与指导向父级回报仍放行。需要停止或操作指导时，使用本面板或原生指导对话页，而不是让模型代做。默认开启；可用 `model.hideGuidance` / `model.blockControl` 关闭。

指导和 goal 可以同时修改工作区；当前没有跨会话文件锁或冲突协调器，各自沿用宿主原有权限规则。

## 当前安装

| 包 | 职责 |
|---|---|
| [guide-panel](guide-panel/) | `guide-fork` provider、`/guide/api`、面板、专区与自动归档；连接独立准入与 shield 服务 |
| [guide-admission](guide-admission/README.md) | 原生同步准入、权威容量/身份/按池快照 |
| [guide-shield](guide-shield/README.md) | 独立 Host 结算防护；panel HMR 期间连续持有包装 |
| [guide-preset](guide-preset/README.md) | `guide` persona 与工具面；外部用户级 guide skill 缺失时明确降级 |
| [guide-goal-adapter](guide-goal-adapter/README.md) | 在私有 subagents 作用域复用原 driver/join |
| [guide-sidebar-adapter](guide-sidebar-adapter/README.md) | 官方 sidebar 的局部数据视图与原任务组件装饰 |

本机 desktop 已登记六个 `@local` link 与 bundle，官方 `dsh-better-sidebar` 保持 registry 版本 `0.28.2`。最近一次核对：准入 active、`C/R/M=8/2/4`，shield active/`inject=true`，O6 为 idle/no-target-tools（12 条注册与包装记录）。证据见 [O19 生产部署](evidence/O19-production-2026-11-03/report.md) / [O2/R6 迁移](evidence/O2-R6-desktop-migration-2026-11-03/report.md) / [1.1.0 实施](evidence/O12-O21-engineering-2026-11-03/report.md)。

生产代码不包含上游 driver、join 或任务组件副本；旧 fork 已提炼为 [历史设计摘要](docs/HISTORY-AND-MAINTENANCE-NOTES.md) 后删除。UI 的 label 前缀过滤和 goal 的可信 provider 身份是不同判据，不能互相替代。

仓库不包含本机 `evidence/`：原始报告、恢复备份、官方包缓存留在维护者机器。引用这些记录的链接用于追溯，不表示 clone 后已附带专项环境。新机器准备与本地快照见 [维护手册](docs/MAINTENANCE.md)，当前已接受边界见 [已定边界](docs/DECISIONS.md)。

## 能力与边界

| 能力或边界 | 当前行为 |
|---|---|
| goal 续轮 | 支持产物下跳过已确认的直属指导；普通工作仍等待 |
| 保守等待 | pending 创建、external、closing、身份未知、指导拥有工作后代时继续等待 |
| 上下文 | 复制最后一个已完成轮次之前的 seed；未完成轮次不继承 |
| 名额 | activation 在 native release 前占槽；creating、closing、external、idle parked 均可能占槽 |
| 结算防污染 | 支持基线内已关闭：真实 closing、panel HMR、父重建/两进程恢复通过，实际 desktop 部署完成 |
| 模型工具面 | `list_agents` 隐藏指导分支；模型 `send_message`/`interrupt_agent` 到指导分支被拒绝；普通工作不受影响 |
| 归档 | 阻止模型执行；其他原生 UI 可能仍允许点开/输入，用户已接受；自动归档默认关闭 |
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
  auto: false
  lowDelayMs: 600000
  midDelayMs: 180000
  highDelayMs: 30000
  holdMs: 120000
```

自动归档保留完整能力但默认关闭：只有显式 `auto: true` 才会启动 15 秒扫描；手动归档按钮不受影响。B1 使用每池原生 `used / capacity`，阈值为 25% / 50% / 75%；C3 每池独立保持峰值 120 秒。已释放 activation 的归档不额外释放名额；native busy/未知/无当前池/状态查询失败时跳过自动归档。1.1.0 已补 records/summary 候选、主视图与保存页签识别；Host 验证自身身份和父关系后调用不强制停止的原生归档。每轮最多 128 条并轮转扫描，历史较多时不会固定遗漏后续候选。

## 安装、更新与恢复

私有仓库：[PreLuna/dsh-guide-mode](https://github.com/PreLuna/dsh-guide-mode)。有权限的账号可 clone 后运行 `npm run repo:check`、`npm test` 和 `npm run doctor`。六包运行仍依赖上述固定 DSH／官方 sidebar 基线；本仓库不会安装或替换整个宿主。

统一安装、升级、完整卸载与回退见 [维护手册](docs/MAINTENANCE.md)。入口是 [scripts/workspace.mjs](scripts/workspace.mjs) 的 `prepare` 与 [scripts/apply-profile.ps1](scripts/apply-profile.ps1)，原则是先在隔离副本验证、停 Host、生成计划、审阅后应用，并保存文件级恢复记录。准入核心与 shield 核心采用冷更新；panel 客户端变更需要硬刷新。

两个 adapter 的本机切换（关闭 DSH Host 后）：

```powershell
./guide-goal-adapter/scripts/install-desktop.ps1
node guide-sidebar-adapter/scripts/prepare-official.mjs
./guide-sidebar-adapter/scripts/install-desktop.ps1
# 恢复阶段一的 sidebar，保留 goal adapter：
./guide-sidebar-adapter/scripts/install-desktop.ps1 -Restore
# 恢复原 goal driver：
./guide-goal-adapter/scripts/install-desktop.ps1 -Restore
```

`evidence/LI-stage*/desktop-before` 以及阶段二 `official` 目录是恢复与本机重装路径的依赖，暂不移动或删除。旧 O19/shield 精确迁移脚本只保留历史恢复入口；新升级必须使用新的证据目录。完整卸载后已有指导日志仍保留，但其 guide preset/provider 不再可用。

## 验证

本机基线（无需安装 DSH）：

```powershell
npm test          # 16 个 Node 进程：生成物检查 + 12 panel + 1 admission + 2 sidebar adapter
npm run build:check
npm run doctor    # 版本、私有许可、用户级 guide skill
npm run repo:check # 仓库文件边界与当前文档链接
```

需要已安装 DSH、Electron、官方 tarball 或隔离 Host 的用例单独运行：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& '<DSH 安装目录>\DeepSeek Harness.exe' --expose-internals guide-goal-adapter/test/run-host.mjs
& '<DSH 安装目录>\DeepSeek Harness.exe' --expose-internals guide-goal-adapter/test/run-host.mjs --sidebar-core
node guide-goal-adapter/scripts/smoke.mjs --integration
node guide-goal-adapter/scripts/smoke.mjs --integration --sidebar
node guide-panel/scripts/lifecycle-smoke.mjs   # 隔离真实 Host、HMR 与跨进程恢复
```

浏览器 UI 使用 `guide-sidebar-adapter/test/browser_test.py`（stdin 传配置、Edge/Playwright、隔离 profile，不读取真实用户凭据）。

最近结果：原 driver/join 12/12、sidebar 核心及官方消费函数 5/5、B′ 真实 Runtime 34 组、真实隔离 Host 86 项断言、浏览器 11 项通过；1.1.0 为 16 个 Node 检查进程、90 项真实 Host、11+2 项浏览器及 O2/R6 两进程回归。模型使用本机确定性 fixture，没有调用用户外部模型。逐项证据与未覆盖项见 [PROJECT-STATUS](PROJECT-STATUS.md) 与 [证据索引](evidence/README.md)。

## 诊断

- 面板提示 Host 未加载或请求 405：检查 `/guide/api` 是否已注册；只刷新客户端不能替换旧 Host 模块。
- 面板显示只读/不支持：查看 `/guide/api/state` 的 `panelCompat`、`guideAdmission`、`settlementShield`；未知契约不会挂半套 provider/tab。
- 已确认的旧 `kind:guide` 指导页签会在面板显示提示条，由用户点击清理；只处理历史标题与页面地址均匹配的项，原生开始页及无法确认的项保留。
- 输入草稿按会话保存在 localStorage；设置 `window.__guideDebug = true` 可观察面板底部事件与焦点信息。

## 文档地图

全仓库 7 篇文档，每类事实只有一个出处：

| 文档 | 唯一职责 |
|---|---|
| 本文 | 使用、当前安装、配置和诊断 |
| [PROJECT-STATUS.md](PROJECT-STATUS.md) | 当前交付、已定决定 D1–D31、未完成事项、验证索引、结果分级 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 已接受边界与暂缓事项（PT-6、RM-3/5/7、Q4、O5 等**已定稿**，不再反复修改） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | provider、身份、局部作用域、shield 和生命周期 |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | 目录地图、安装/升级/卸载/回退、升级门禁、仓库与打包 |
| [docs/HISTORY-AND-MAINTENANCE-NOTES.md](docs/HISTORY-AND-MAINTENANCE-NOTES.md) | 已删旧方案／fork／部署脚本中保留的维护经验 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史 |

本地不入库的还有 [证据索引](evidence/README.md)（报告、日志、JSON、截图与保留规则）。

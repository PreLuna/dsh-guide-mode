# DSH 指导模式

在主会话旁边打开继承上下文的指导对话，用独立 `guide` preset 提供建议或按要求执行修改。指导可使用写工具，并可与主会话 goal 并行。

两阶段局部注入与独立 Host 服务已完成并在本机验收：goal 复用原 driver，better-sidebar 使用官方 `0.28.2`，通过两个独立 adapter 添加兼容行为；准入与结算防护拆成两个独立 Host 包。功能主体已完成：指导会话与上下文继承、goal 并行准入、模型投影与控制拦截、结算防护、sidebar 专区、归档、manager 的安装/升级/恢复/卸载/修复/自升级、公开源查询下载、面板内自动执行与重启核对、5E link 来源迁移与 5F 硬中断恢复/缓存重建均已实现；5E 通过隔离及真实 Edge/独立桌面验收，5F 已完成默认/隔离验收并随 manager 1.4.0 发布部署。

支持基线：DSH `0.2.1-rc.3`（build `be72761ee1a6736ebcdf4f3739363b083ae53c98`）、Cordis `4.0.5`、官方 `dsh-better-sidebar@0.28.2`。未知版本的 adapter 回退原行为，panel/shield 进入只读或 unsupported；不能据支持基线内的结论推定任意版本免维护。

当前发布与本机安装：最新正式 Release 为 [guide-v1.5.0](https://github.com/PreLuna/dsh-guide-mode/releases/tag/guide-v1.5.0)，内含 manager `1.4.0` 与六组件 `1.1.0`。npm 元数据保持 `private:true`、`UNLICENSED`，未发布 npm/市场。2026-11-10 本机 desktop 已将七个自有包从工作区 link 切换为网络 tgz（SHA 固定缓存）；2026-11-17 已升级到 manager `1.4.0`，六组件保持 `1.1.0`，升级回执为 `verified-running`，源码目录和其他插件/配置保留。见 [早期安装记录](docs/LOCAL-ONLINE-INSTALL-2026-11-10.md) / [manager 1.4.0 升级证据](evidence/live-manager-1.4-upgrade-2026-11-17/live-manager-upgrade-result.json)。

剩余范围只有明确列出的扩展能力，不再作为待讨论项：5E-0/1/2 已发布到 `guide-v1.5.0` / manager `1.4.0`，独立 Electron 桌面 E-07 已通过；5F 硬中断诊断/显式恢复和缓存重建已随 manager 1.4.0 发布并部署到 live；真实 Edge 浏览器 UI 验收仍未单独运行。registry/git 与任意跨 schema 迁移、损坏缓存找回、断电点自动恢复、外部依赖一键代装仍未实现。详见 [项目状态](PROJECT-STATUS.md) 与 [功能检查表](docs/FUNCTIONAL-TEST-MATRIX.md)；各阶段实现细节见 [Phase 5](docs/PHASE-5-ASSESSMENT.md)、[5B](docs/PHASE-5B-PACKAGE-TRANSACTIONS.md)、[5C](docs/PHASE-5C-MAINTENANCE.md)、[5D](docs/PHASE-5D-REAL-ACCEPTANCE.md)、[5E 方案](docs/PHASE-5D-5E-IMPLEMENTATION-PLAN.md)、[5F 恢复](docs/PHASE-5F-RECOVERY.md) 与 [面板执行](docs/PHASE-5-PANEL-EXECUTION.md)。

从 [最新 Release](https://github.com/PreLuna/dsh-guide-mode/releases/latest) 下载 manager tgz，通过官方插件页安装，再到“插件 → 指导”检查并准备组件。确认前保存工作；manager 1.4.0 会自动执行、重启并返回指导页核对，旧版或故障恢复仍可使用页面给出的手动助手；link 来源迁移使用独立的「开发 link 来源迁移」区。better-sidebar、guide skill/skills manager 按各自入口管理。版本/宿主与恢复边界见 [5D-4](docs/PHASE-5D-REAL-ACCEPTANCE.md)，面板自动执行说明见 [面板执行](docs/PHASE-5-PANEL-EXECUTION.md)。

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
| [guide-manager](guide-manager/README.md) | 产品管理页：六组件、依赖边、宿主 BOM/产物、`guide` skill 与 skills manager 深链；兼容门禁、热/冷切换、reload/回滚、安装/升级/恢复/卸载/修复/自升级、公开源下载与面板自动执行 |

本机 desktop 当前登记六个运行组件与 `guide-manager`，官方 `dsh-better-sidebar` 保持 registry 版本 `0.28.2`。七个自有包的依赖均为 `.guide-manager/package-cache/<sha256>.tgz`；manager `1.4.0`、六组件 `1.1.0`，升级回执为 `verified-running`。`guide-manager` 的 BOM 写在自身 `package.json` 的 `dshGuide` 字段；切换前的准入、shield、O6 与四阶段验收记录继续作为历史证据，见 [O19 生产部署](evidence/O19-production-2026-11-03/report.md) / [O2/R6 迁移](evidence/O2-R6-desktop-migration-2026-11-03/report.md) / [1.1.0 实施](evidence/O12-O21-engineering-2026-11-03/report.md) / [早期网络包安装](evidence/install-online-2026-11-10/report.md) / [manager 升级](evidence/live-manager-upgrade-2026-11-16/live-manager-upgrade-result.json)。

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
| 管理页 | 官方插件页「指导」tab；Phase 1–4 启停/技能/源码 reload；5A 首次安装；5B 兼容组合升级、旧包/依赖锁备份与版本恢复；5C 卸载、原版本修复、管理器自升级与外部恢复；5D 公开源检查、下载、缓存与计划确认；1.2.0 起确认后自动执行并重启返回核对；5E link 清点、内容差异、迁移计划、停机切换与独立恢复已在 1.3.0 发布并部署。开发 link 受保护，远端与本地包操作共用官方锁 |
| 故障恢复/缓存 | 5F：install/package/maintenance 中断诊断与显式恢复；缓存缺失/损坏按 SHA 重建；已随 manager 1.4.0 发布并部署 |
| 远端分发 | 公开 GitHub Releases，默认免 token/source.json；查询、按依赖闭包下载、SHA/tar/契约校验、离线缓存与来源不可用恢复 |
| 面板自动执行 | manager 1.4.0 支持首次安装、独立/联动升级、版本恢复、修复、卸载及同协议管理器升级；确认后自动停机执行、重启、返回指导页并核对实际运行状态，手动助手保留为恢复入口 |
| 本机来源 | 自 2026-11-10 起七个自有包为网络发布包固定缓存；开发工作区继续作为源码、测试和隔离验证来源 |

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

公开仓库：[PreLuna/dsh-guide-mode](https://github.com/PreLuna/dsh-guide-mode)。可 clone 后运行 `npm run repo:check`、`npm test` 和 `npm run doctor`。六个运行组件加 `guide-manager` 仍依赖上述固定 DSH／官方 sidebar 基线；本仓库不会安装或替换整个宿主。

日常安装、升级、卸载与恢复从官方插件页的「指导」管理页发起，使用 manager 的网络包或本地可信包事务；完整流程见 [维护手册](docs/MAINTENANCE.md)。工作区 link 的开发维护入口是 [scripts/workspace.mjs](scripts/workspace.mjs) 的 `prepare` 与 [scripts/apply-profile.ps1](scripts/apply-profile.ps1)，原则是先在隔离副本验证、停 Host、生成计划、审阅后应用，并保存文件级恢复记录；当前 live 已是发布包，不用这条路径覆盖。准入核心与 shield 核心采用冷更新；panel 客户端变更需要硬刷新。Windows 上 `.ps1` 维护脚本要求 PowerShell 7（`pwsh`），Windows PowerShell 5.1 不支持 `ConvertFrom-Json -AsHashtable` 和覆盖式 `[IO.File]::Move`。

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
npm test          # 34 个 Node 进程：生成物检查 + 12 panel + 1 admission + 2 sidebar adapter + 18 manager
npm run build:check
npm run doctor    # 版本、公开来源、私有许可、用户级 guide skill
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

浏览器 UI 使用 `guide-sidebar-adapter/test/browser_test.py`（stdin 传配置、Edge/Playwright、隔离 profile，不读取真实用户凭据）；manager 的远端与面板执行使用 `guide-manager/test/remote-acceptance.py`、`one-click-acceptance.py`，真实匿名后端另运行 `node guide-manager/test/remote-live.mjs <新目录> --public`。

最近结果：默认 `npm test` 34 个 Node 进程全部通过，其中 manager 155 个测试用例；manager 1.2.0 面板执行在真实 Edge 与独立桌面各完成 8 次自动安装/升级/恢复/修复/卸载/自升级操作，均返回可见指导页并核对 `verified-running`、0 page error。5E-0/1/2 已覆盖清点/差异、计划指纹、迁移执行、失败回源、源码快照恢复与执行预览；隔离 profile 用真实官方 pnpm 完成七包迁移，独立 Electron 桌面 E-07 通过，live 已升级至 manager 1.3.0；5F 硬中断恢复/缓存重建已通过默认测试与隔离夹具，并随 manager 1.4.0 发布部署。历史结果仍为原 driver/join 12/12、sidebar 核心及官方消费函数 5/5、B′ 真实 Runtime 34 组、真实隔离 Host 86 项断言、浏览器 11 项通过；模型使用本机确定性 fixture，没有调用用户外部模型。逐项证据与未覆盖项见 [PROJECT-STATUS](PROJECT-STATUS.md) 与 [证据索引](evidence/README.md)。

## 诊断

- 面板提示 Host 未加载或请求 405：检查 `/guide/api` 是否已注册；只刷新客户端不能替换旧 Host 模块。
- 面板显示只读/不支持：查看 `/guide/api/state` 的 `panelCompat`、`guideAdmission`、`settlementShield`；未知契约不会挂半套 provider/tab。
- 已确认的旧 `kind:guide` 指导页签会在面板显示提示条，由用户点击清理；只处理历史标题与页面地址均匹配的项，原生开始页及无法确认的项保留。
- 输入草稿按会话保存在 localStorage；设置 `window.__guideDebug = true` 可观察面板底部事件与焦点信息。

## 文档地图

核心 7 篇负责当前事实，Phase 5 阶段文档只保存实现与验收细节，不重复维护交付台账：

| 文档 | 唯一职责 |
|---|---|
| 本文 | 使用、当前安装、配置和诊断 |
| [PROJECT-STATUS.md](PROJECT-STATUS.md) | 当前交付、已定决定 D1–D35、真实剩余范围、验证索引、结果分级 |
| [docs/DECISIONS.md](docs/DECISIONS.md) | 已接受边界与维持现状口径（PT-6、RM-3/5/7、Q4、O5 等**已定稿**，不因功能完成重开） |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | provider、身份、局部作用域、shield、manager、远端来源与执行生命周期 |
| [docs/MAINTENANCE.md](docs/MAINTENANCE.md) | 目录地图、安装/升级/卸载/回退、升级门禁、仓库与打包 |
| [docs/HISTORY-AND-MAINTENANCE-NOTES.md](docs/HISTORY-AND-MAINTENANCE-NOTES.md) | 已删旧方案／fork／部署脚本中保留的维护经验 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史与发布标签 |
| [docs/PHASE-5-ASSESSMENT.md](docs/PHASE-5-ASSESSMENT.md) | Phase 5 分期、完成状态与 5E 剩余边界 |
| [docs/PHASE-5-PANEL-EXECUTION.md](docs/PHASE-5-PANEL-EXECUTION.md) / [5B](docs/PHASE-5B-PACKAGE-TRANSACTIONS.md) / [5C](docs/PHASE-5C-MAINTENANCE.md) / [5D](docs/PHASE-5D-REAL-ACCEPTANCE.md) | 各阶段实现与验收细节 |
| [docs/LOCAL-ONLINE-INSTALL-2026-11-10.md](docs/LOCAL-ONLINE-INSTALL-2026-11-10.md) | 本机一次性来源切换的运维记录 |

本地不入库的还有 [证据索引](evidence/README.md)（报告、日志、JSON、截图与保留规则）。

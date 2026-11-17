# 工程维护手册

更新：2026-11-16（Asia/Shanghai）。当前生产安装为 `guide-manager` 1.3.0 + 六个运行组件 1.1.0，来自公开 Release `guide-v1.4.0` 的网络 tgz，固定到 profile `.guide-manager/package-cache/<sha256>.tgz`；工作区仍是开发、测试和隔离验证来源。七包均 `private:true`、`UNLICENSED`，未发布 npm/市场。Phase 5 的安装、升级、恢复、卸载、修复、自升级、面板自动执行与 5E link 来源迁移均已发布；独立 Electron E-07 通过，live 已升级。已接受的产品边界见 [已定边界](DECISIONS.md)；当前交付与剩余范围见 [项目状态](../PROJECT-STATUS.md)。

## 1. 版本、基线与 CI

一个工作区 Git 仓库管理七个自有包（六个运行组件 + manager）、当前文档与测试。当前生产安装为 manager 1.3.0 + 六组件 1.1.0；源码版本可以独立推进，兼容性由 peer、契约、维护者声明的精确版本组合以及重启后的健康核对约束，不再用“版本齐平”代替兼容性检查。

支持基线：DSH `0.2.1-rc.3`（build `be72761ee1a6736ebcdf4f3739363b083ae53c98`）、Cordis `4.0.5`、官方 `dsh-better-sidebar@0.28.2`。peer 范围收窄到该基线，不表示其他版本一定有缺陷。

`npm test` 运行 34 个无需安装 DSH 的 Node 回归进程（含 manager 155 个用例）与生成物一致性检查；`.github/workflows/test.yml` 为 Windows/Node 24 的最小 CI（`repo:check` + `test`），`.github/workflows/release.yml` 负责 tag/manual 发布，`.github/workflows/live-source-read.yml` 是显式的真实公开源只读检查。托管 CI 状态以 [Actions 实际记录](https://github.com/PreLuna/dsh-guide-mode/actions) 为准；它不能代替真实 Runtime/Host/浏览器验收。

`guide-sidebar-adapter/client.js` 是**生成物**，由该包自有 `core.js` + `client.entry.js` 生成。修改后运行 `npm run build --prefix guide-sidebar-adapter`，检查用 `npm run build:check`；安装脚本也会检查。

## 2. 目录与体积

仓库本体很小（2026-11-10 实测 Git 跟踪约 177 个文件、1.4 MB）；体积压力全部来自本机 `evidence/` 与 `dist/`。

| 路径 | 文件 | 体积 | Git | 作用 |
|---|---|---|---|---|
| `guide-panel/` | 27 | 0.24 MB | ✅ | 主插件：provider、`/guide/api`、面板与专区、自动归档 |
| `guide-sidebar-adapter/` | 21 | 0.16 MB | ✅ | 官方 sidebar 的局部数据视图与任务组件装饰 |
| `guide-goal-adapter/` | 13 | 0.12 MB | ✅ | 复用原 driver/join（不复制状态机） |
| `guide-shield/` | 8 | 0.03 MB | ✅ | 独立 Host 结算防护；`contracts.js` 记契约哈希 |
| `guide-admission/` | 6 | 0.02 MB | ✅ | 原生 materialize 同步准入、容量／身份／按池快照 |
| `guide-preset/` | 3 | 0.01 MB | ✅ | `guide` persona 与工具面 |
| `guide-manager/` | 79 | 0.83 MB | ✅ | 管理页、门禁/冷热切换、安装/升级/维护、远端来源、面板执行、5E 迁移、硬中断恢复、缓存重建与 helper |
| `docs/` | 15 | 0.12 MB | ✅ | 当前事实、阶段实现/验收、维护与历史 |
| `scripts/` | 15 | 0.07 MB | ✅ | 维护、发布与检查入口 |
| `.github/workflows/` | 3 | 0 | ✅ | 测试、tag/manual 发布、公开源只读检查 |
| `evidence/` | 约 5.8 万 | **约 3.0 GB** | ❌ | 本机原始验收证据；install-online 解包物使体积增大 |
| `dist/` | 约 3300 | 约 34 MB | ❌ | 离线发布快照、隔离验收与发布缓存 |
| `docs/archive/` | 1 | 4 KB | ❌ | 旧入口占位 |

`scripts/` 现在包含：`workspace.mjs`（doctor／prepare，生成 `plan.json`）、`apply-profile.ps1`（执行计划，失败回滚）、`package-local.mjs`（产出 `dist/`）、`prepare-manager-release.mjs`、`prepare-upgrade-catalog.mjs`、`prepare-manager-catalog.mjs`、`prepare-remote-release.mjs`、`github-release.mjs`（verify/draft/publish/history）、`check-repository.mjs`（挡产物 + 校验文档链接）、`test.mjs`、`r5-browser.py`，以及 `lib/` 共享打包/发布逻辑和 `validation/compat-matrix.mjs`。`doctor`／`prepare` 都要求新的输出目录，从不覆盖既有 `plan.json`，这是有意的安全设计。

完整的历史目录地图（含每个 `evidence/` 子目录的用途）见 [证据索引](../evidence/README.md)。

## 3. 安装、升级、卸载与回退

日常 live 的安装、升级、恢复、卸载与修复从官方插件页「指导」管理页发起；manager 1.3.0 支持确认后自动执行并重启返回核对，手动 helper 只用于旧版或故障恢复。当前 live 依赖为固定缓存包，不应再用下面的 workspace 路径覆盖。以下编号保留给**开发 link 部署**和完整卸载/回退演练：

1. `npm run doctor` 检查版本、公开来源与外部 guide skill。缺技能采用明确降级，不联网安装。
2. 在隔离副本修改，运行 Node、真实 Host 与浏览器回归。开发 link 部署的 junction 指向工作区，**禁止先直接覆盖源码再等停机**；live 发布包不受此影响。
3. 选择新的证据目录，停止目标 profile 的 Host；其他独立 profile 不应被停止。保存原源码、profile、生成物和前后哈希。
4. `node scripts/workspace.mjs prepare --mode install --output <新的目录>`；可用 `--profile <绝对路径>` 指定目标。
5. 审阅计划后执行 `pwsh -NoProfile -File ./scripts/apply-profile.ps1 -Plan <目录>/plan.json`。脚本再核对停机、来源 junction、候选哈希与其他配置；保留 registry 图，失败恢复已改文件及原链接状态。
6. 完整卸载：先 `prepare --mode uninstall`，再 apply。仅移除七个自有依赖、bundle、lock importer 和经核对的 junction；保留官方包、工作区、会话、localStorage 和证据。若有自有 profile override，先准备明确移除方案，不能遗留可执行孤立条目。
7. 回退同一操作：停 Host 后 `pwsh -NoProfile -File ./scripts/apply-profile.ps1 -Plan <目录>/plan.json -Restore`。代码版本必须和 profile 选择**成对**回退；profile 工具不擅自覆盖源码。
8. 冷启动检查 `/guide/api/state` 的 `panelCompat.mode=ready`、准入 active、shield active、goal/sidebar 支持状态，以及 `/guide-manager/api/state` 的 `installation`/`packageManagement`/`maintenance`/`execution`/`distribution`，并在正常 UI 确认组件运行。升级不自动重发用户问题或恢复 goal。

> 本仓库的 `.ps1` 维护/安装脚本要求 PowerShell 7（`pwsh`）；Windows PowerShell 5.1 不支持 `ConvertFrom-Json -AsHashtable` 和覆盖式 `[IO.File]::Move`。`apply-profile.ps1` 会在版本不足时先给出明确提示。

完整卸载后已有指导日志仍保留，但其 guide preset/provider 不再可用；不把卸载当作删除对话。

## 4. 升级必须重验的边界

Phase 5 的包安装/升级/恢复、远端来源、面板执行与 launcher 实例约束见 [manager 使用说明](../guide-manager/README.md)、[5B 事务设计](PHASE-5B-PACKAGE-TRANSACTIONS.md) 和 [面板执行](PHASE-5-PANEL-EXECUTION.md)。开发 link 与稳定缓存包是两种来源；5B/5C 不自动覆盖 link；5E 迁移已发布，独立 Electron E-07 通过，live 已升级。包版本恢复与旧 Phase 3 的 patch-only 回滚是两个不同入口。

- **admission**：dsh-subagent/Cordis 产物、materialize 函数、manager/resident/rootPools/slots、同步 reserve 与原生取消/closing。
- **goal**：原 driver 产物、waitForChildren/join 函数与独占调度入口。
- **sidebar**：官方 client、client-modules、Cordis、树/图/计数/auto-open 与注册的存活/卸载行为。
- **panel/shield**：官方 descriptor fold、自身 inheritedEventCount + first-wins、deprecated snapshotEvents 同步读；Host 必需服务/方法，以及 sidebarRight/slots/uiWorkspace 原生客户端形状。契约源哈希在 `guide-shield/contracts.js`。
- **manager**：官方 `pluginManager` 的 `listPlugins`/`listBundles`/`setPluginEnabled`、Plugins 页 `plugins.tab` slot、`dshGuide` BOM 的 host/components/artifacts 哈希、`$DSH_HOME` skill 状态；Phase 2 先跑操作门禁（契约/必需产物/依赖硬阻断，版本/未知/skill 未就绪警告）。Phase 3 比较本地 link 源码 mtime 与 Host 启动时间，提供 `reload-guide-manager.cmd` 和 `rollback-guide-manager.cmd`；registry 升级仍由官方插件页负责，可信 tarball/远端包走 5A/5B/5C/5D 事务。Phase 4 检测 `@michengai/dsh-skills-manager`，用官方设置 UI 深链到“技能”section，只读状态、不复制安装/禁用逻辑。热切换转调官方，冷切换写 `profile/.guide-manager/pending.json` 并由 `restart-guide-manager.cmd` 停 Host、调用官方 patch writer、重启；manager 不直接改 profile 依赖。
- **远端来源/发布**：schema 4 清单、七个包白名单与 SHA/tar/契约、Release tag 与提交绑定、默认公开源、按依赖闭包准备与缓存、`executionSchema`；发布端还需核对固定提交产物、附件回读、同版本同字节和显式 publish 门禁。
- **面板执行**：pending/plan 指纹、profile 四文件与控制器副本、Windows PowerShell 5.1/WMI 启动、`ack` 前不停机、新 Host 精确回执、恢复命令与重启后导航；升级前确认恢复入口可见。
- **O6**：tools/register、精确注册层、来源 runtime/execute 指针及现有五个源码哈希。**不能只改哈希让预检通过。**

不支持时明确显示不可用/只读，阻止新指导与自动归档，建议重启或恢复已支持版本；不注册半套 provider。缺少客户端注册必需形状时不挂半套 tab，并提供 `guidePanelClientCompatibility` 诊断。已有对话仍可从宿主原生入口查看。

### 4.1 G0 升级门禁（每次 DSH／Cordis／better-sidebar／client-modules 变化）

1. 记录新版本、构建号、安装路径、关键文件 SHA-256。
2. 对照当前 `SUPPORTED_SOURCE`、contracts、materialize/driver/join、sidebar client hash。
3. 在隔离 profile 运行 `npm test`、`build:check`、`doctor`。
4. 运行真实 Host、真实 Runtime、浏览器回归；保存新证据目录。
5. 停 Host，冷更新准入/shield 核心；**不要用 HMR 代替**。
6. 检查 `/guide/api/state`：`panelCompat`、`guideAdmission`、`settlementShield`、`modelProjection`、`goalAdapter`；检查 `/guide-manager/api/state` 的组件状态、BOM/产物、action policy、gate、`distribution`、`execution`、`installation`/`packageManagement`/`maintenance`。
7. 若变更涉及发布源或安装事务，另跑 `remote-live.mjs --public`、隔离安装/升级/恢复和面板执行的两端 UI；真实远端与 live profile 分开记录。
8. 保存回滚组合；失败则停在旧基线，不把 live 已切换的缓存包当开发 link 直接覆盖。
9. 不在未重验的情况下只改 pin。

> 2026-11-03 的 G0 演练 C-1～C-10 通过（C-10 为 rc.5 不支持版本明确拒绝 + rc.3 回滚）。**成功升级仍需未来受支持版本重跑以上 9 条**，该结论不承诺 rc.5 可用。

panel HMR 的既有保护回归保留；准入和 shield 核心更新采用冷重启，不承诺核心卸载/HMR 空窗连续防护。服务整体任意关闭顺序、真实模型长时、任意第三方包装仍按 [项目状态](../PROJECT-STATUS.md) 的验证缺口跟踪。

## 5. 仓库范围与本地打包

仓库收录七个自有包、可重复构建的源码与生成物、确定性测试、当前文档和 GitHub Actions。**不入库**：运行 profile、用户会话、凭据、官方包缓存、原始 evidence、旧 fork、Python 缓存与本地产物。个人机器路径出现在历史说明或默认诊断中，不等于发布的安装路径。

本地快照与正式发布：

```powershell
npm run repo:check      # 入库边界 + 文档链接
npm test
npm run doctor
npm run pack:local      # 需要工作树干净

# 正式发布从明确提交生成 schema 4 产物；verify/draft/publish 均需显式动作
npm run manager:remote-release -- --repository PreLuna/dsh-guide-mode --commit <完整SHA> --tag guide-vX.Y.Z --output dist/remote-candidate
npm run manager:github-release -- verify --bundle dist/remote-candidate
npm run manager:github-release -- draft --bundle dist/remote-candidate --execute
npm run manager:github-release -- publish --bundle dist/remote-candidate --execute
```

`pack:local` 输出在忽略的 `dist/<版本>-<commit>/`：七个自有包的 tgz、该 commit 的源码 ZIP、用于独立复核的 `source-for-verification/`、`manifest.json` 与 `SHA256SUMS.txt`。`manager:remote-release` 另输出 `guide-release.json`、连接配置示例、发布说明、`SHA256SUMS.txt`、`publish-plan.json` 与历史包缓存；上传白名单与草稿回读规则见 [发布格式](PHASE-5D-RELEASE-FORMAT.md)。

tgz 从 Git ZIP 解出的提交字节生成，避免 Windows 工作树换行转换造成来源偏差；使用离线 npm pack 且禁用生命周期脚本，不下载、不安装第三方依赖、不执行 publish。正式发布通过 GitHub Release 和 tag/manual workflow，当前最新为 `guide-v1.4.0`；npm 仍 `private:true`/`UNLICENSED`，未发布 npm/市场。发布可信度依赖仓库和发布权限，SHA 用于字节一致性，不构成独立签名。

## 6. `dist/` 与 `evidence/` 的去留

**`dist/`**：整目录可由 `pack:local`／发布工具重建，但包含隔离验收与发布缓存（2026-11-10 约 3300 文件 / 34 MB），是“换台机器不 clone 也能装”的凭据，建议保留。`.npm-cache/` 与可重建的测试目录可按需清理。

**`evidence/`**：38 个按日期命名的验收现场（2026-11-16 约 5.8 万文件 / 3.0 GB，其中 `install-online-2026-11-10` 的官方包解包内容占主要体积），**不可按缓存删**。

| 可以做 | 不要做 |
|---|---|
| 删 `evidence/*/isolated-home/`（可重建，会丢 session 细节） | 删 `LI-stage2/desktop-before`（回退脚本依赖） |
| 删 sha256 重复的截图副本 | 删 `LI-stage2/official/package`（本机重装/官方消费测试依赖，可从同目录 tarball 重新解包） |
| 删 `dist/.npm-cache/` | 移动／改名 `evidence/` 下任何目录 |
| 在 `evidence/<新日期>/` 记录新一轮验收 | 复用旧日期目录写新结果；把 evidence 打包后删原目录 |

`evidence/` 里现有 76 个 junction/符号链接（2026-11-10 清点，含 `official/package/node_modules` → `C:\Users\wang\.dsh\profiles\desktop\node_modules` 以及 one-click/install-online 隔离 home 的依赖链接），移动或改名会让它们一次性失效。注意：部分工具（资源管理器搜索、备份软件、`git status --ignored`）会跟随 junction，把几十 MB 报成数百 GB。

2026-11-04 清理记录：删除 `dist/.npm-cache/`（18 文件）与全部 `evidence/*/isolated-home/`（57 目录、4927 文件、64.45 MB、660 个内部链接），`evidence/` 从 6754 文件 / 136.6 MB 降为 1827 文件 / 72.1 MB。该数字是当时现场；之后 5A～5D、one-click 与 install-online 验收已使证据体积增长到上表规模。

## 7. 常用命令

Phase 5 的安装/升级/恢复、组件卸载/修复和 manager 自升级都在官方插件页「指导」管理页发起；1.3.0 确认后自动执行并重启返回核对，手动 helper 保留为恢复入口。5E 迁移入口显示 link/固定来源与内容差异，确认后走独立 `migration-pending.json` 事务；管理页不可用时使用 `helper/recover-migration.mjs`/`restart-guide-manager.ps1 -RecoverMigration`。保留 preset 和会话数据，与第 3 节开发环境“完整卸载”不同。页面在升级前给出 profile 自有目录下的外部恢复脚本；组件损坏使桌面插件页打不开时，使用 manager 包内 `helper/repair-components.ps1`。先保留可信包缓存及事务备份，不能把它们当普通可删缓存。详见 [5C](PHASE-5C-MAINTENANCE.md)、[面板执行](PHASE-5-PANEL-EXECUTION.md) 和 [功能测试清单](FUNCTIONAL-TEST-MATRIX.md)。

5F 硬中断恢复（工作区实现，尚未发布）：停止目标 DSH 后，先只读查看 `helper/recover-hard-interrupt.mjs --profile <profile>` 的诊断，再用 `--action install-restore|package-restore|maintenance-restore|manager-restore --id <id>` 执行；脚本会校验备份/事务哈希并保留原回执。缓存缺失/损坏时，管理页「包缓存」可用公开源重建，或离线使用 `helper/rebuild-cache.mjs --profile <profile> --catalog <release-catalog.json> --apply`；只写缓存，不改依赖。迁移事务仍用 `recover-migration.mjs`，不要用 5F 动作替代。

```powershell
npm test                 # 34 个 Node 进程，含 manager 155 用例
npm run repo:check       # 入库边界 + 文档链接
npm run doctor           # 七包元数据、公开来源与 guide skill
npm run build:check      # client.js 生成物一致性
npm run pack:local       # 重建 dist/ 离线快照
# 正式发布与远端验证命令见第 5 节和 [发布格式](PHASE-5D-RELEASE-FORMAT.md)
```

## 8. 文档维护

- 当前文档只写当前事实，每类事实只有一个出处：README 负责使用/安装/配置/诊断，[项目状态](../PROJECT-STATUS.md) 负责交付与真实剩余范围，[架构](ARCHITECTURE.md) 负责机制，[已定边界](DECISIONS.md) 负责收口口径，本文负责维护流程，Phase 5 阶段文档只保留实现与验收细节。
- 已完成能力按现有实现记录，不再写成“待讨论/待定/拟新增”；只有确实未实现的扩展能力进入剩余范围（D35）。已完成或已放弃的方案先提炼有效结论至 [历史经验](HISTORY-AND-MAINTENANCE-NOTES.md)，再删除确认无运行／测试／恢复依赖的重复原文；删除前记录路径与哈希。
- 当前文档不把历史记录当安装步骤。原始 evidence 和必要恢复资料留在本机，不上传 GitHub，不因未入 Git 就删除；过时链接迁移到新入口，原始结果不改写。
- 修改文档后核对相对链接；`npm test`、`npm run build:check`、`npm run doctor` 的结果必须与 README 的验证说明一致。

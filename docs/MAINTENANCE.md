# 工程维护手册

更新：2026-11-05（Asia/Shanghai）。适用于本机六个运行组件 + `guide-manager` 1.1.0（Phase 2）、`private:true`、`UNLICENSED` 的私有维护期。已接受的产品边界见 [已定边界](DECISIONS.md)；当前交付与待办见 [项目状态](../PROJECT-STATUS.md)。

## 1. 版本、基线与 CI

一个工作区 Git 仓库管理七个自有包（六个运行组件 + manager）、当前文档与测试。七个包同版本；内部 peer 锁定同版本。

支持基线：DSH `0.2.1-rc.3`（build `be72761ee1a6736ebcdf4f3739363b083ae53c98`）、Cordis `4.0.5`、官方 `dsh-better-sidebar@0.28.2`。peer 范围收窄到该基线，不表示其他版本一定有缺陷。

`npm test` 运行无需安装 DSH 的 Node 回归与生成物一致性检查；`.github/workflows/test.yml` 为 Windows/Node 24 的最小 CI（`repo:check` + `test`）。托管 CI 状态以 [Actions 实际记录](https://github.com/PreLuna/dsh-guide-mode/actions) 为准；它不能代替真实 Runtime/Host/浏览器验收。

`guide-sidebar-adapter/client.js` 是**生成物**，由该包自有 `core.js` + `client.entry.js` 生成。修改后运行 `npm run build --prefix guide-sidebar-adapter`，检查用 `npm run build:check`；安装脚本也会检查。

## 2. 目录与体积

仓库本体很小（约 1.8 MB）；体积压力全部来自本机 `evidence/`。

| 路径 | 文件 | 体积 | Git | 作用 |
|---|---|---|---|---|
| `guide-panel/` | 27 | 0.24 MB | ✅ | 主插件：provider、`/guide/api`、面板与专区、自动归档 |
| `guide-sidebar-adapter/` | 21 | 0.16 MB | ✅ | 官方 sidebar 的局部数据视图与任务组件装饰 |
| `guide-goal-adapter/` | 13 | 0.12 MB | ✅ | 复用原 driver/join（不复制状态机） |
| `guide-shield/` | 8 | 0.03 MB | ✅ | 独立 Host 结算防护；`contracts.js` 记契约哈希 |
| `guide-admission/` | 6 | 0.02 MB | ✅ | 原生 materialize 同步准入、容量／身份／按池快照 |
| `guide-preset/` | 3 | 0.01 MB | ✅ | `guide` persona 与工具面 |
| `guide-manager/` | 13 | 0.06 MB | ✅ | 官方插件页「指导」tab：六组件、依赖边、BOM/产物、skill；兼容门禁、热切换与 pending 冷切换 helper |
| `docs/` | 4 | 0.04 MB | ✅ | 架构、已定边界、维护、历史 |
| `scripts/` | 7 | 0.04 MB | ✅ | 维护入口脚本 |
| `.github/workflows/test.yml` | 1 | 0 | ✅ | 最小 CI |
| `evidence/` | 1827 | **72.1 MB** | ❌ | 本机原始验收证据 |
| `dist/` | 110 | 1.0 MB | ❌ | 离线发布快照 |
| `docs/archive/` | 1 | 4 KB | ❌ | 旧入口占位 |

`scripts/` 七个文件：`workspace.mjs`（doctor／prepare，生成 `plan.json`）、`apply-profile.ps1`（执行计划，失败回滚）、`package-local.mjs`（产出 `dist/`）、`check-repository.mjs`（挡产物 + 校验文档链接）、`test.mjs`、`validation/compat-matrix.mjs`、`r5-browser.py`。`doctor`／`prepare` 都要求新的输出目录，从不覆盖既有 `plan.json`，这是有意的安全设计。

完整的历史目录地图（含每个 `evidence/` 子目录的用途）见 [证据索引](../evidence/README.md)。

## 3. 安装、升级、卸载与回退

1. `npm run doctor` 检查版本与外部 guide skill。缺技能采用明确降级，不联网安装。
2. 在隔离副本修改，运行 Node、真实 Host 与浏览器回归。运行中的生产 junction 指向工作区，**禁止先直接覆盖源码再等停机**。
3. 选择新的证据目录，停止目标 profile 的 Host；其他独立 profile 不应被停止。保存原源码、profile、生成物和前后哈希。
4. `node scripts/workspace.mjs prepare --mode install --output <新的目录>`；可用 `--profile <绝对路径>` 指定目标。
5. 审阅计划后执行 `pwsh -NoProfile -File ./scripts/apply-profile.ps1 -Plan <目录>/plan.json`。脚本再核对停机、来源 junction、候选哈希与其他配置；保留 registry 图，失败恢复已改文件及原链接状态。
6. 完整卸载：先 `prepare --mode uninstall`，再 apply。仅移除七个自有依赖、bundle、lock importer 和经核对的 junction；保留官方包、工作区、会话、localStorage 和证据。若有自有 profile override，先准备明确移除方案，不能遗留可执行孤立条目。
7. 回退同一操作：停 Host 后 `pwsh -NoProfile -File ./scripts/apply-profile.ps1 -Plan <目录>/plan.json -Restore`。代码版本必须和 profile 选择**成对**回退；profile 工具不擅自覆盖源码。
8. 冷启动检查 `/guide/api/state` 的 `panelCompat.mode=ready`、准入 active、shield active、goal/sidebar 支持状态，并在正常 UI 确认组件运行。升级不自动重发用户问题或恢复 goal。

> 本仓库的 `.ps1` 维护/安装脚本要求 PowerShell 7（`pwsh`）；Windows PowerShell 5.1 不支持 `ConvertFrom-Json -AsHashtable` 和覆盖式 `[IO.File]::Move`。`apply-profile.ps1` 会在版本不足时先给出明确提示。

完整卸载后已有指导日志仍保留，但其 guide preset/provider 不再可用；不把卸载当作删除对话。

## 4. 升级必须重验的边界

- **admission**：dsh-subagent/Cordis 产物、materialize 函数、manager/resident/rootPools/slots、同步 reserve 与原生取消/closing。
- **goal**：原 driver 产物、waitForChildren/join 函数与独占调度入口。
- **sidebar**：官方 client、client-modules、Cordis、树/图/计数/auto-open 与注册的存活/卸载行为。
- **panel/shield**：官方 descriptor fold、自身 inheritedEventCount + first-wins、deprecated snapshotEvents 同步读；Host 必需服务/方法，以及 sidebarRight/slots/uiWorkspace 原生客户端形状。契约源哈希在 `guide-shield/contracts.js`。
- **manager**：官方 `pluginManager` 的 `listPlugins`/`listBundles`/`setPluginEnabled`、Plugins 页 `plugins.tab` slot、`dshGuide` BOM 的 host/components/artifacts 哈希、`$DSH_HOME` skill 状态；Phase 2 先跑操作门禁（契约/必需产物/依赖硬阻断，版本/未知警告）。热切换转调官方，冷切换写 `profile/.guide-manager/pending.json` 并由 `helper/restart-guide-manager.cmd` 停 Host、调用官方 patch writer、重启；manager 不直接改 profile 依赖。
- **O6**：tools/register、精确注册层、来源 runtime/execute 指针及现有五个源码哈希。**不能只改哈希让预检通过。**

不支持时明确显示不可用/只读，阻止新指导与自动归档，建议重启或恢复已支持版本；不注册半套 provider。缺少客户端注册必需形状时不挂半套 tab，并提供 `guidePanelClientCompatibility` 诊断。已有对话仍可从宿主原生入口查看。

### 4.1 G0 升级门禁（每次 DSH／Cordis／better-sidebar／client-modules 变化）

1. 记录新版本、构建号、安装路径、关键文件 SHA-256。
2. 对照当前 `SUPPORTED_SOURCE`、contracts、materialize/driver/join、sidebar client hash。
3. 在隔离 profile 运行 `npm test`、`build:check`、`doctor`。
4. 运行真实 Host、真实 Runtime、浏览器回归；保存新证据目录。
5. 停 Host，冷更新准入/shield 核心；**不要用 HMR 代替**。
6. 检查 `/guide/api/state`：`panelCompat`、`guideAdmission`、`settlementShield`、`modelProjection`、`goalAdapter`；检查 `/guide-manager/api/state` 的组件状态、BOM/产物、action policy 与 gate。
7. 保存回滚组合；失败则停在旧基线。
8. 不在未重验的情况下只改 pin。

> 2026-11-03 的 G0 演练 C-1～C-10 通过（C-10 为 rc.5 不支持版本明确拒绝 + rc.3 回滚）。**成功升级仍需未来受支持版本重跑以上 8 条**，该结论不承诺 rc.5 可用。

panel HMR 的既有保护回归保留；准入和 shield 核心更新采用冷重启，不承诺核心卸载/HMR 空窗连续防护。服务整体任意关闭顺序、真实模型长时、任意第三方包装仍按 [项目状态](../PROJECT-STATUS.md) 的验证缺口跟踪。

## 5. 仓库范围与本地打包

仓库收录七个自有包、可重复构建的源码与生成物、确定性测试、当前文档和 GitHub Actions。**不入库**：运行 profile、用户会话、凭据、官方包缓存、原始 evidence、旧 fork、Python 缓存与本地产物。个人机器路径出现在历史说明或默认诊断中，不等于发布的安装路径。

打包：

```powershell
npm run repo:check      # 入库边界 + 文档链接
npm test
npm run doctor
npm run pack:local      # 需要工作树干净
```

输出在忽略的 `dist/<版本>-<commit>/`：六个自有包的 tgz、该 commit 的源码 ZIP、`source-for-verification/`（解出的 101 个文件，用于独立复核 ZIP）、`manifest.json` 与 `SHA256SUMS.txt`。

tgz 从 Git ZIP 解出的提交字节生成，避免 Windows 工作树换行转换造成来源偏差；使用离线 npm pack 且禁用生命周期脚本，不下载、不安装第三方依赖、不执行 publish。

这些是私有仓库的本地快照，不创建正式 Release／tag，不表示已完成公共许可、市场元数据、所有 DSH 版本兼容或长期稳定性验收。后续公开前再确认包名／命名空间、版本、作者与许可证、外部 guide skill 的分发方式及目标市场要求。

## 6. `dist/` 与 `evidence/` 的去留

**`dist/`**：整目录可由 `pack:local` 重建，但它是"换台机器不 clone 也能装"的凭据，体积可忽略，建议保留。`.npm-cache/` 是打包临时缓存，可随时删。

**`evidence/`**：24 个按日期命名的验收现场，**不可按缓存删**。

| 可以做 | 不要做 |
|---|---|
| 删 `evidence/*/isolated-home/`（可重建，会丢 session 细节） | 删 `LI-stage2/desktop-before`（回退脚本依赖） |
| 删 sha256 重复的截图副本 | 删 `LI-stage2/official/package`（本机重装/官方消费测试依赖，可从同目录 tarball 重新解包） |
| 删 `dist/.npm-cache/` | 移动／改名 `evidence/` 下任何目录 |
| 在 `evidence/<新日期>/` 记录新一轮验收 | 复用旧日期目录写新结果；把 evidence 打包后删原目录 |

`evidence/` 里仍有 7 个绝对路径软链接（含 `official/package/node_modules` → `C:\Users\wang\.dsh\profiles\desktop\node_modules`），移动或改名会让它们一次性失效。注意：部分工具（资源管理器搜索、备份软件、`git status --ignored`）会跟随 junction，把几十 MB 报成数百 GB。

2026-11-04 清理记录：删除 `dist/.npm-cache/`（18 文件）与全部 `evidence/*/isolated-home/`（57 目录、4927 文件、64.45 MB、660 个内部链接），`evidence/` 从 6754 文件 / 136.6 MB 降为 1827 文件 / 72.1 MB。

## 7. 常用命令

```powershell
npm test                 # 无需安装 DSH 的回归
npm run repo:check       # 入库边界 + 文档链接
npm run doctor           # 七包元数据与 guide skill
npm run build:check      # client.js 生成物一致性
npm run pack:local       # 重建 dist/ 离线快照
```

## 8. 文档维护

- 当前文档只写当前事实，每类事实只有一个出处：README 负责使用/安装/配置/诊断，[项目状态](../PROJECT-STATUS.md) 负责交付与待办，[架构](ARCHITECTURE.md) 负责机制，[已定边界](DECISIONS.md) 负责收口口径，本文负责维护流程。
- 已完成或已放弃的方案先提炼有效结论至 [历史经验](HISTORY-AND-MAINTENANCE-NOTES.md)，再删除确认无运行／测试／恢复依赖的重复原文；删除前记录路径与哈希。
- 当前文档不把历史记录当安装步骤。原始 evidence 和必要恢复资料留在本机，不上传 GitHub，不因未入 Git 就删除；过时链接迁移到新入口，原始结果不改写。
- 修改文档后核对相对链接；`npm test`、`npm run build:check`、`npm run doctor` 的结果必须与 README 的验证说明一致。

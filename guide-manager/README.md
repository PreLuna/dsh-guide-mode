# Guide manager

manager 1.2.0：支持面板内确认后自动安装、重启、返回指导页并核对实际运行状态。首次安装、组件升级/恢复、修复/卸载与支持同一执行协议的管理器升级共用此流程，无需手动运行助手，也无需另外安装 PowerShell 7。确认前保存工作并结束运行任务；手动命令作为故障恢复入口保留。支持方式与测试边界见 [面板执行说明](../docs/PHASE-5-PANEL-EXECUTION.md)。以下 5A/5B/5C 章节记录底层准备、执行及恢复协议；新版页面已自动衔接这些步骤。

2026-11-09：manager 1.1.2 增加默认公开发布来源。通过官方插件页安装本仓库 manager tgz 后，直接进入“插件 → 指导 → 远端发布来源”检查并下载，无需配置 token 或 source.json。公开模式使用 Release 直链与 Git 智能 HTTP 的 tag/commit 核验，不消耗匿名 REST API 配额；保留包 SHA/tar/契约与现有冷事务门禁。实际整体验收进展见 [5D-4](../docs/PHASE-5D-REAL-ACCEPTANCE.md)。

2026-11-07：按 [Phase 5 设计](../docs/PHASE-5-ASSESSMENT.md) 实现独立安装入口、本地包升级/恢复、卸载/修复与管理器升级。manager 本身无需安装六个业务组件即可启动；原 Phase 1–4 开关、技能与源码 reload 语义保留。隔离验收与部署状态见 [项目状态](../PROJECT-STATUS.md)；未发布 npm，也未切换 live desktop 的安装来源。

## Phase 5A：安装入口

管理页增加“安装组件”区：选择组件 → 预览依赖与精确版本 → 确认准备 → 保存工作 → 运行安装助手 → 重启核对。选择 panel 自动补齐 preset/shield/admission；选择 admission 自动补齐 shield。推荐组合为六组件，sidebar 需要匹配的官方 better-sidebar；缺少时可取消该可选组件。已安装的同版本组件只保留，不覆盖 link；不同版本、未启用依赖或未验收版本必须先处理，不能借首次安装执行升级。

### 本机生成可安装包

```powershell
npm run manager:release -- --output dist/phase5a-local-01
```

输出七个 tgz、`release-catalog.json`、`manager-catalog.json`、`manifest.json` 和 `manager-config.json`。来源为当前工作区，标记为开发快照；不发布 npm，也不更改任何 profile。输出目录必须是新的，以便保留原包哈希。打包允许组件独立版本；首次安装仍要求当前 manager BOM，升级另外使用下述兼容组合目录。

先通过官方插件页安装输出中的 manager tgz。给 manager 的 Host config 设置 `catalogPath` 为输出目录下 `release-catalog.json` 的绝对路径，或由维护者将该目录文件复制到目标 profile 的 `.guide-manager/release-catalog.json`（默认查找位置）。目录中的 tgz 路径为本机绝对路径；复制到另一台机器时需重新生成或校正目录和哈希。manager 不接受浏览器传入任意包名、命令或来源。

### 执行与恢复

- 预览绑定 profile 的 package.json、pnpm-lock.yaml、cordis.patch.yml、pnpm-workspace.yaml 和发布目录；确认或执行时变化会拒绝过期计划。
- 确认仅写 `.guide-manager/install-pending.json`。页面给出含目标 `-Profile` 的安装助手命令；`helper/install-guide-manager.cmd` 通过原 PowerShell wrapper 的 `-Install` 模式停 DSH 后执行。
- 独立 `apply-install.mjs` 在官方 `withFileLock(package.json)` 内调用共享 `runProfilePnpm`，将 tgz 固定到 profile `.guide-manager/package-cache/<sha256>.tgz`，一次解析全部新增包，禁用自动 peer 安装与构建脚本。安装成功、包名/版本/契约、宿主产物核对完成后才登记 bundle，并经官方 patch writer 启用组件、配对关闭原 goal driver；最后复核组合配置。
- profile 原文件备份到 `.guide-manager/install-backups/`。失败时恢复文件并用宿主 pnpm 修复旧依赖图。`failed-restored` 可重试；`recovery-required` 保留备份和回执，wrapper 不自动重启 DSH。硬崩溃中断不能据普通异常恢复测试宣称自动恢复；应按备份人工处理，后续包版本事务在 5B 实施。
- 回执 `.guide-manager/install-result.json` 可在刷新后读取。`installed-awaiting-restart` 不等于已运行；新的 Host 启动后，版本、组件状态与依赖边通过才显示已就绪。home overlay 和其他启动配置仍可能覆盖 profile，必须查看实际运行状态。

安装助手只处理目标实例的进程树。非默认 profile 必须有 `.guide-manager/launcher.json`：`schema:1`、`kind:web|desktop`、`pid`、ISO `createdAt`、`executable`、绝对 `home/profile`；web 另有 `port`，desktop 另有独立绝对 `userData`（可选 `debugPort`）。助手校验 PID、创建时间和命令行实例标记，防止误停其他实例；重启继承同一 home/profile/启动类型并更新记录。默认桌面无记录时仅匹配普通 native root，多个 root 会拒绝操作。保存目标实例中的工作后使用；不会因同名进程就全停用户其他 DSH。

### Phase 5A API

```text
POST /guide-manager/api/install/plan    # { components: ["panel"] }
POST /guide-manager/api/install/stage   # { components: ["panel"], planId: "…", confirm: true }
POST /guide-manager/api/install/cancel  # { planId: "…", confirm: true }
```

状态见原 `/state` 的 `installation`；`actionScope:phase-4` 仍描述组件启停，包操作另以 `installation.phase:phase-5a` 标识。所有 HTTP 接口沿用 connection 围栏。首次安装准备存在时拒绝组件启停，避免与安装计划交叉修改配置。

首次安装与下方 5B/5C 分工；没有 registry 最新版本发现。运行 `npm test` 包括计划/HTTP/界面交互/失败恢复及 Windows 上的 PowerShell 语法和 launcher 时间回归；真实 Host/UI 验收单独执行。

## Phase 5B：独立升级与包版本恢复

将维护者明确选择的多个本地发布目录编译为升级目录：

```powershell
npm run manager:upgrade-catalog -- --release dist/base --release dist/panel-update --output dist/upgrade-catalog.json
```

每个输入是 `manager:release` 生成的完整七包快照。编译器读取实际 tarball manifest，检查同版本不同字节和内部 peer，输出有限的兼容版本组合；这属于维护者声明，不是自动的任意版本兼容证明。给 manager config 设置绝对 `upgradeCatalogPath`，或把目录文件放到 profile `.guide-manager/upgrade-catalog.json`。源文件使用绝对本机路径；真正安装时会另存稳定缓存。

管理页选择某组件目标版本 → 预览最少联动的兼容组合 → 确认准备升级 → 保存工作 → 运行 `helper/update-guide-manager.cmd -Profile <目标 profile>`（页面提供正确引用的命令）。例如只选 panel，兼容时只换 panel；选 shield 若要求新版 admission/panel，会明确列出联动。manager 自身不在候选中。开发 link、缺失组件、非缓存旧安装和跨数据 schema 不被升级入口隐式处理。

升级先备份 profile 四文件和旧 tgz 到 `.guide-manager/package-transactions/<id>/`，官方写锁内进行包操作，核对目标版本/契约/peer/宿主产物/组合配置，保留原有启停状态。安装禁用构建脚本，只支持数据 schema 1、无数据迁移的包。新 Host 的版本/服务/产物/依赖与启停状态核对通过后，`packageManagement.verification` 才是 `verified-running`；版本与旧 BOM 不同仍可显示 `ready-unverified`，不把运行就绪当成任意代码兼容证明。

“预览包版本恢复”恢复成功升级事务中的旧版本、精确旧依赖锁和配置。它与 Phase 3 的 patch-only 回滚分开；原发布目录或旧缓存副本删除时仍可从事务 tgz 补回。profile 在升级后发生额外编辑时拒绝恢复，避免覆盖用户后来安装的插件/配置；先明确处理这些变更。UI 显示最近 20 个记录中的可恢复事务，旧记录仍留磁盘。任何恢复失败会再尝试修复操作前的完整版本；`recovery-required` 或中断回执会阻止助手自动重启，需要按备份排查。

```text
POST /guide-manager/api/packages/plan          # { targets: [{ key: "panel", version: "1.1.1" }] }
POST /guide-manager/api/packages/restore-plan  # { transactionId: "..." }
POST /guide-manager/api/packages/stage         # { kind, targets|transactionId, planId, confirm:true }
POST /guide-manager/api/packages/cancel        # { planId, confirm:true }
GET  /guide-manager/api/state                  # packageManagement: catalog/pending/result/transactions/verification
```

5B 设计见 [事务说明](../docs/PHASE-5B-PACKAGE-TRANSACTIONS.md)。`test/acceptance.py` 测真实 UI 与生产助手；`test/run-package-host.mjs` 测真实官方 pnpm 的故障与恢复。测试版 `1.1.1`/`1.2.0` 只在独立夹具生成，生产 manifest 仍为 1.1.0。

## Phase 5C：卸载、修复与管理器升级

管理页选择组件 → 预览卸载或原版本修复 → 确认准备 → 运行页面给出的外部助手。卸载拒绝留下必需依赖者，preset 受保护；卸载 goal 会恢复原生 driver。仅清理所属依赖、bundle 和配置行，保留会话及外部插件。修复从 profile 的 SHA 缓存识别原版本，无需读取损坏的组件 manifest，重装后核对全部包文件，并保证四份 profile 文件不变。

DSH 桌面合并加载客户端时，缺失的组件 manifest 可能导致整个插件页无法打开。此时可直接使用 manager 包内的独立修复入口（面板也预先提供命令）：

```powershell
& '<manager安装目录>/helper/repair-components.ps1' -Profile '<目标profile>' -Components panel
```

管理器升级使用 `manager:release` 额外生成的 schema 3 目录；配置绝对 `managerCatalogPath`，或放到 profile `.guide-manager/manager-catalog.json`。多个明确版本可通过 `node scripts/prepare-manager-catalog.mjs --release <目录文件> ... --output <新目录文件>` 合并。选择精确版本预览、确认后，执行器和恢复脚本先复制到 `.guide-manager/controllers/<内容指纹>/`，随后才停机替换 manager。页面在升级前提供外部恢复命令；新 manager 无法加载或新缓存丢失时，也能从独立副本及旧包备份恢复。

恢复使用同宿主/control/data schema 1 的可信本地包；旧 manager 来源固定到本 profile 缓存，因此不承诺恢复其最初临时 tgz 路径或旧 lock 字节。组件 link/registry 迁移、任意 schema 迁移、损坏用户配置重置没有隐式执行。外部 skill、skills manager、better-sidebar 单独展示并由所属管理器管理。

状态在 `maintenance`；API 为 `/maintenance/plan|stage|cancel`，沿用 connection 围栏、计划指纹与互斥准备。实际包操作使用官方 profile 锁；失败恢复旧包，恢复再次失败则保持停止。详见 [5C 说明](../docs/PHASE-5C-MAINTENANCE.md) 与 [功能测试清单](../docs/FUNCTIONAL-TEST-MATRIX.md)。

## Phase 5D-0/1：发布端

5D-0/1 已提供独立的远端 schema 4 契约和维护端发布工具：`npm run manager:remote-release` 从明确提交生成七包与远端清单；`npm run manager:github-release -- verify|draft|publish` 校验/准备发布，写远端需显式 `--execute`。开发快照不可上传发布，旧版本与兼容组合保留，同版本改字节拒绝。详见 [格式与使用](../docs/PHASE-5D-RELEASE-FORMAT.md)。消费端已由下述 5D-2/3 接入，真实发布与整体验收另行记录。

## Phase 5D-2：后端准备服务

Host config.source 或 sourcePath（默认 profile/.guide-manager/source.json）读取连接配置，后端环境提供只读 token。guideManager 增加 checkSource、prepareSource、sourceTask/cancelSourceTask、planPreparedSource、stagePreparedSource；GET state.distribution 只读持久状态，不发网络请求。准备完成的目录交给原安装/升级/维护事务，单独 goal 安装不要求其他包下载。详见 [后端说明](../docs/PHASE-5D-CONSUMER-BACKEND.md)。

## Phase 5D-3：HTTP 与管理页

“远端发布来源”区接入检查、安装缺失组件/升级组件/升级 manager、进度、取消/重试、刷新恢复，以及精确计划预览/确认。确认后使用原助手执行，manager 自升级保留外部恢复入口。source/check、prepare、task、cancel、plan、stage 均为受 connection 围栏保护的 POST；浏览器不传凭据或任意来源。未配置远端时保留本地功能。HTTP/客户端回归和隔离 Edge 交互已通过，真实私有 Release/官方冷操作/独立桌面整体链路仍属 5D-4。详见 [接口、流程与测试](../docs/PHASE-5D-HTTP-UI.md)。

## Phase 1–4 基线机制

独立的 Host + client 包，在官方 **插件** 页增加一个「指导」标签页，展示指导模式的六个组件、依赖关系、宿主版本和 `guide` skill 状态，并提供两档切换：

- **热切换**：`guide-panel`、`guide-sidebar-adapter`，通过官方 `pluginManager.setPluginEnabled` 立即生效。
- **冷切换**：`guide-admission`、`guide-shield`、`guide-goal-adapter`，只写 pending intent；由独立 helper 在 DSH 停止时应用 profile patch 并重启。

Phase 2 增加兼容门禁；Phase 3 增加本地 link 源码变更检测、reload helper 和冷切换 patch 回滚；Phase 4 接入 `@michengai/dsh-skills-manager` 的状态与设置深链。manager 不 import 六个组件，也不直接写 profile。

## 显示内容

- **宿主**：DSH 版本/构建、Cordis、官方 `dsh-better-sidebar`，与包内 BOM 对照，区分 `已验证 / 未验证`。
- **六个组件**：版本、契约版本、实际启用状态、Loader fiber 阶段、组件自己的 state 服务。
- **依赖与互斥**：panel → preset/admission/shield/sidebar，以及 goal adapter 与原 goal driver 的互斥关系。
- **skills**：`guide` skill 是否存在、版本/哈希、`skills-guide` 路由数据是否完整、是否被 skills manager 禁用。
- **pending**：冷切换已准备的状态、helper 路径和 intent 数量。

状态分级：

| 状态 | 含义 |
|---|---|
| `ready` | 在已验证组合内，组件服务就绪 |
| `ready-unverified` | 技术上可用，但版本/契约/宿主构建不在已验证 BOM 内 |
| `degraded` | 组件可加载，但服务缺失、只读或回退到 native |
| `unsupported` | 必需契约缺失，组件明确不可用 |
| `failed` | Loader fiber 失败 |
| `disabled` / `missing` | 未启用 / 未安装 |
| `unknown` | 无法判断（例如官方 pluginManager 不可用） |

版本不一致不等于不兼容：它显示为 `ready-unverified`。只有契约缺失、服务明确 unsupported 或 fiber 失败才降为失败。

## 操作策略

| 组件 | 策略 | 当前行为 |
|---|---|---|
| `guide-panel` | `hot` | 停用/启用立即生效；停用后 manager tab 仍可用 |
| `guide-sidebar-adapter` | `hot` | 停用/启用立即生效；停用时恢复官方 sidebar |
| `guide-admission` | `restart-required` | 准备启用/停用；写 pending intent，helper 应用后重启 |
| `guide-shield` | `restart-required` | 同上 |
| `guide-goal-adapter` | `paired-restart` | 写 pending intent，成对切换 adapter 与原 driver |
| `guide-preset` | `locked` | 影响已有会话恢复，不提供开关 |
| `guide-manager` | `locked` | 管理器自身受保护 |

规则：

- 热操作只调用官方 `pluginManager.setPluginEnabled`，不自己写 profile。
- 冷操作只写 `profile/.guide-manager/pending.json`，不修改 `cordis.patch.yml`。
- goal 的 pending 必须同时包含 adapter 和原 driver 两项，避免两个都启用或都停用。
- 取消准备：再次触发“准备当前状态”即可清掉该组件的 intent；UI 提供“取消准备”按钮。
- 冷切换不会自动执行；需要用户双击 `helper/restart-guide-manager.cmd`，该 helper 会关闭并重启 DSH。

## 技能管理（Phase 4）

Host 读取 `$DSH_HOME/skills/guide/SKILL.md`、`$DSH_HOME/skills-guide/` 和 `$DSH_HOME/skills-manager/state.json`，展示：

- `guide` skill 是否存在、版本、哈希、路由文件数量；
- 是否被 skills manager 禁用；
- `@michengai/dsh-skills-manager` 是否安装及其版本。

如果已安装 skills manager，卡片显示“打开设置 → 技能”按钮。按钮用官方设置 UI 的 DOM 顺序打开账号菜单 → 设置 → “技能” section；设置 section 标签由 skills manager 自己注册。这是 best-effort 深链，不调用其内部 store，也不安装/禁用 skill。

skills manager 未安装时只显示说明，不伪造管理入口。`guide` skill 未就绪会在组件 `action.gate.enable` 里产生 `skill-not-ready` **软警告**，不阻断切换；用户仍可先启用组件，之后安装 skill。

## 操作门禁（Phase 2）

每个组件在状态里带 `action.gate.enable` / `action.gate.disable`：

| 结果 | 条件 | 效果 |
|---|---|---|
| 硬阻断 | 未安装、bundle error、契约版本不一致、组件 unsupported/failed/incompatible、panel 依赖未就绪、sidebar 宿主版本不符、必需产物哈希不匹配 | 不显示可执行按钮；UI 显示 `兼容门禁未通过` 和具体 blockers |
| 软警告 | 宿主版本/构建未验证、产物不可用或未知、版本漂移、组件 degraded | 允许操作，UI 显示 `兼容警告` |
| 停用 | 不受启用门禁阻断 | 始终允许停用，便于恢复 |

Phase 2 的 BOM 还记录敏感上游产物的 SHA-256：

- `@deepseek-ai/dsh-subagent` / `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-goal-round-driver`
- `dsh-better-sidebar` client
- `@deepseek-ai/dsh-client-modules` client
- right-sidebar / workspace client

Host 通过 `pluginPackages` 解析实际目录并哈希；包或文件不可用时记 `unknown`，不会伪称已验证。`host.artifacts.verified` 为 `true` 仅当所有声明产物都匹配；存在未知项时为 `null`，存在不匹配时为 `false`。

## 更新与回滚（Phase 3）

### 本地 link

本机六个组件都通过 `link:` 登记。Host 读取 profile 的 dependency spec，递归取包内最新 mtime，和本进程启动时间比较：

- `update.mode: 'source-reload'`；
- `update.sourceChanged: true` 表示源码在本次 Host 启动后改过；
- UI 的“更新与回滚”区列出变更组件，并给出：
  ```
  helper/reload-guide-manager.cmd
  ```
- reload helper 只停/重启 `DeepSeek Harness`，不修改任何包或 profile。

这条路径就是当前本地安装的实际升级方式：改源码 → reload → 重新加载 Host/client。

### registry / tarball / git

这些包在 `update.mode: 'package-manager'`，UI 提示到官方插件页更新。官方 manager 的更新是 `removeBundle` → `installBundle`，本 manager 不重复这套破坏性事务；官方的暂存、失败恢复和取消语义仍由官方 UI 负责。

### 冷切换回滚

每次 `apply-pending.mjs` 应用前会把 `cordis.patch.yml` 复制到：

```
profile/.guide-manager/backups/cordis.patch.yml.<timestamp>.bak
```

UI 检测备份后显示：

```
helper/rollback-guide-manager.cmd
```

rollback helper 停止 DSH，恢复**最新**一份备份，删除 pending，再重启。它回滚的是最近一次冷切换应用，不是整个历史；多次冷切换需要逐次回滚或直接编辑 patch。

helper 位置：

| 文件 | 作用 |
|---|---|
| `restart-guide-manager.cmd` | 应用 pending 后重启 |
| `reload-guide-manager.cmd` | 只重启，加载本地源码 |
| `rollback-guide-manager.cmd` | 恢复最新 patch 备份后重启 |
| `restart-guide-manager.ps1` | 三种模式的实现；只停 `DeepSeek Harness` |
| `apply-pending.mjs` | 调用官方 `writePluginEnabled` |

## Pending helper

位置：`guide-manager/helper/restart-guide-manager.cmd`

双击后：

1. 停止 `DeepSeek Harness` 进程（只停这个名字，不动其他程序）。
2. 用 Electron Node 运行 `apply-pending.mjs`，导入官方 `writePluginEnabled`。
3. 备份 `cordis.patch.yml`，逐项写 patch；任何失败恢复备份并保留 pending。
4. 删除 pending（成功时），重启 DSH。
5. 写日志和回执到 `profile/.guide-manager/`。

失败时 pending 保留，可修正后重试；回执见 `last-apply-result.json` / `helper-result.json`。

## API

```text
GET  /guide-manager/api/state   # 完整状态、action policy、pending
GET  /guide-manager/api/ping    # Host 半边存活检查
POST /guide-manager/api/action  # set-component-enabled
```

`POST /action` body：

```json
{
  "action": "set-component-enabled",
  "component": "admission",
  "enabled": false,
  "confirm": true
}
```

返回的 `application`：

- `applied`：热切换完成。
- `pending-restart`：冷切换已写入 pending，等待 helper。
- `pending-cleared`：取消了该组件的 pending。
- `restart-required` / `overridden` / `failed`：保留官方语义。

接口都经过宿主 `connection.requestRejection` 围栏。

## 数据来源

1. 官方 `pluginManager` 的 `listPlugins()` / `listBundles()`；不可用时降级读取 profile `package.json` 和已安装 manifest。
2. 六个组件自己的可选服务：`guidePanelCompatibility`、`guideAdmission`、`guideSettlementShield`、`guideSidebarHost`、`guideGoalAdapter`。
3. `$DSH_HOME/skills/guide/SKILL.md`、`$DSH_HOME/skills-guide/`、`$DSH_HOME/skills-manager/state.json`。
4. 包自己的 `dshGuide` BOM（`package.json`），包括 components、host 与 artifacts 哈希。
5. `profile/.guide-manager/pending.json`。

它不 import 六个组件中的任何一个，因此 panel 被禁用或损坏时，管理页仍能显示状态。

## 安装与测试

本机 desktop 已安装并验证「指导」tab。Phase 4 的代码是 link 到工作区的，更新后需要重启一次 DSH 才能加载新的 Host 代码。

```powershell
node guide-manager/test/core.test.mjs
node guide-manager/test/host-state.test.mjs
node guide-manager/test/client-registration.test.mjs
node guide-manager/test/helper.test.mjs
```

### 隔离验证（2026-11-05）

- 隔离 `DSH_HOME` + `manager-test` profile，七个包以 link 登记；`dsh --profile manager-test --dump-config` 组合出 `guide-manager` 与六个组件入口。
- 隔离 Web Host 打开官方插件页，出现「指导」标签页；六个组件卡片、依赖边、宿主版本、`guide` skill 状态和警告都渲染。
- panel 热切换实测：停用 → 确认 → `已应用` → `disabled/row-disabled`；启用 → 确认 → `ready`。
- admission 冷切换实测：准备停用 → 确认 → `已准备，重启后生效`，出现 pending banner 和 helper 路径；取消准备 → `已取消准备`，pending 文件删除。
- 在临时 profile 上直接运行 `apply-pending.mjs`：
  - admission 单项写入 `guide-admission disabled:true`；
  - goal 成对写入 `guide-goal-adapter disabled:true` 和 `goal-round-driver disabled:false`；
  - pending 成功删除，receipt 状态 `applied`。
- 隔离 Host 的产物门禁实测：
  - `dsh-subagent`、`cordis`、`goal-round-driver`、`client-modules`、`sidebar-right`、`workspace` 的哈希全部匹配；
  - 缺少 `dsh-better-sidebar` 时记为 `unknown`，`host.artifacts.verified=null`，sidebar 启用被 `component-unsupported` / `sidebar-host-mismatch` 阻断；
  - panel/admission/shield/goal 的启用门禁允许，但带 `host-version-unverified` 警告。
- Phase 3 更新/回滚实测：
  - Host 启动后修改 `guide-panel/icon.svg` 的 mtime，state 返回 `update.sourceChanged=true`、`update.mode='source-reload'`；
  - UI 显示“源码已更新，重启加载后生效”、reload helper 路径和“可回滚上次冷切换 (1)”；
  - 放置一份 `.guide-manager/backups/*.bak` 后，`state.backups.count=1`，rollback helper 路径出现。
- Phase 4 技能集成实测（隔离 profile 加入 `@michengai/dsh-skills-manager@1.2.21` 和 `guide` skill）：
  - state 返回 `skills.status=ready`、`skills.manager.installed=true`、版本 `1.2.21`；
  - SkillsCard 显示“打开设置 → 技能”按钮；
  - 点击按钮打开官方设置对话框并选中“技能”section，显示 skills manager 的“统一加载和管理本机 Agent Skills”页面。
- 在未安装 skills manager 的隔离 profile 中，sidebar 显示 `unsupported/package-unavailable`、skills 显示 `missing`，SkillsCard 不显示深链按钮；这是预期的降级。

## 边界

- Phase 4 只开放 panel/sidebar 热切换，以及 admission/shield/goal 的 pending 冷切换；preset 和 manager 仍锁定。
- 操作前门禁只阻断明确不兼容的组合；宿主版本、产物不可用、版本漂移、skill 未就绪作为警告，不把“未验证”伪称为“不兼容”。
- 本地 link 的“升级”是源码更新 + reload helper；可信本地 tarball 使用 5A/5B/5C；其余 registry/git 来源仍由官方插件页维护。
- 技能安装、禁用、来源管理由 `@michengai/dsh-skills-manager` 负责；本 manager 只读状态并深链到它的设置 section。
- rollback helper 只恢复最新一份 patch 备份，不等同于完整的包版本回滚。
- UI 不自动运行 helper；helper 需要用户双击，因为它会关闭并重启 DSH。
- 冷切换写的是 profile patch，不修改 `package.json`、lockfile 或官方包。
- 不是兼容性证明：`ready` 只表示该组合在已验证 BOM 内；`ready-unverified` 明确表示未验证。

# Phase 5C：卸载、修复与管理器升级

更新：2026-11-07。实现范围为私有、本地 tarball 分发，沿用 [Phase 5](PHASE-5-ASSESSMENT.md) 的独立 manager + 六组件方案。真实验收结果见 [本轮报告](../evidence/phase5c-2026-11-07/report.md)，后续缺口与功能测试见 [检查表](FUNCTIONAL-TEST-MATRIX.md)。

## 使用路径

管理页新增“卸载、修复与管理器升级”。选择组件 → 预览 → 确认准备 → 保存工作 → 运行页面给出的、含目标 profile 的外部助手。浏览器刷新可恢复 pending/结果；助手只停止目标实例，并按原 home/profile/启动方式重启。成功回执先表示包操作完成，新 Host 核对运行状态后才显示 `verified-running`。

| 操作 | 实际行为 | 保护与限制 |
|---|---|---|
| 卸载 | 移除选中的直接依赖、bundle 登记与所属 profile patch 行 | preset 保留；manager 不作为组件卸载；拒绝留下必需依赖者 |
| 卸载 goal | 移除 adapter，并用官方 patch writer 启用原生 goal driver | 停机执行，组合配置检查必须通过 |
| 修复 | 从当前 profile 固定 SHA 缓存重装原版本，逐文件核对 tarball 内容 | 不升级；四份 profile 文件必须保持原哈希；保留启停与用户配置 |
| 管理器升级 | 从维护者配置的可信目录选精确版本，外部执行器替换 manager | 同宿主与 control/data schema 1；不自动覆盖开发 link |
| 管理器恢复 | 从独立事务备份恢复旧 manager，重新安装并核对全部文件 | 无需新 manager 的 API/import；拒绝覆盖升级后的额外 profile 编辑 |

卸载按内置依赖关系检查 panel → preset/admission/shield、admission → shield，也检查其余 profile 直接依赖实际 manifest 中的非可选 dependency/peer。依赖者 manifest 丢失时保守拒绝卸载，先修复该包。optional sidebar 不阻止卸载。它不删除会话、工作区、skill、skills-guide、better-sidebar 或 skills manager。

profile patch 用 YAML AST 只清理目标 id/name 的覆盖、insert 行和 group 子行，保留其余节点与注释；涉及 anchor 的目标行拒绝删除，避免破坏别名。全部完成后通过宿主真实配置组合函数复核，不能留下指向已卸载组件的有效配置。

修复可处理组件的 `package.json`、入口或其他随包文件缺失/损坏：原版本身份取自 SHA 校验的缓存 tarball，不 import 组件。tar inventory 有压缩/解压体积、路径、类型、校验和与重复文件限制，不向磁盘解压任意路径；核对包内全部常规文件。修复不重置语义错误的用户配置，不恢复损坏的用户会话，也不自动替换 link 或 registry 来源。源缓存本身损坏/缺失时阻断，需维护者找回匹配 SHA 的可信原包。

桌面宿主会合并加载客户端；缺失组件 manifest 可能导致整个插件页无法启动。manager 的独立导入不能消除这个上游边界。因此额外提供包内 `helper/repair-components.ps1 -Profile <目标> -Components panel`，无需页面或运行中的 manager API。它从缓存预览/校验已登记包，复制外部执行器，按目标实例停机修复并重启。页面预先显示该命令；目标组件参数只能是六组件白名单。

宿主 pnpm 的 `--force` 不保证补回“manifest 完整、仅入口缺失”的包。修复因此先将安装包目录隔离到本事务备份，再重新导入；真实路径必须位于该 profile 的 node_modules 内，外部 link/store 不移动，不递归删除代码或数据。隔离目录保留作故障证据。

## 管理器发布目录与外部恢复

`npm run manager:release -- --output <新目录>` 额外输出 `manager-catalog.json`（schema 3），包含 manager 的包名、精确版本、tgz 绝对路径、SHA。合并明确选择的多个版本：

```powershell
node scripts/prepare-manager-catalog.mjs --release dist/release-a/manager-catalog.json --release dist/release-b/manager-catalog.json --output dist/manager-catalog.json
```

给 manager Host config 设置绝对 `managerCatalogPath`，或将目录放到目标 profile 的 `.guide-manager/manager-catalog.json`。同版本不同字节拒绝合并。目录只选择 manager 白名单包，不能由 HTTP 客户端传任意 npm spec/脚本/下载 URL。默认无远端“检查更新”；registry 安装的 manager 仍可在官方插件页维护，本轮面板的自升级入口面向可信本地 tarball。

准备维护时将当前 manager 的执行代码和 helper 复制到：

```text
<profile>/.guide-manager/controllers/<完整内容指纹>/
```

独立副本与 `.guide-manager/maintenance-pending.json` 绑定。执行前检查副本全部文件、计划指纹、四份 profile 快照、当前组件文件、发布包及目录。自升级绝不从正在替换的 manager 路径加载后续执行代码。

升级前页面已显示恢复命令，须保存它。即使新 manager 完全无法加载，在 PowerShell 仍可运行：

```powershell
& '<页面给出的外部目录>/helper/recover-manager.ps1' -Profile '<目标 profile>' -TransactionId '<升级事务 ID>'
```

省略 `-TransactionId` 时选择最近一次尚未恢复的成功 manager 升级；仍严格核对该事务后的 profile 快照。脚本先生成恢复计划，等待 Electron Node 完成后，才调用同目录的生产停机助手。恢复只依赖旧包备份与外部副本；新包原发布文件、缓存或入口缺失也可恢复。若旧包恢复也失败，保持停止并记录 `recovery-required`。

管理器最初通过官方插件页安装的 `file:<原 tgz>` 可以升级；事务保存原包。恢复时旧 manager 的来源规范化到本 profile 的 SHA 缓存，避免未来依赖临时发布目录。因此 manager 恢复保证旧包字节及其余配置恢复，**不承诺恢复原 tgz 路径或旧 lockfile 字节**。这与 5B 组件的精确旧锁恢复不同，预览提示该差异。生产版本目前保持 1.1.0；故障版仅在测试夹具产生。

## 事务与故障处理

`helper/apply-maintenance.mjs` 在宿主官方 `withFileLock(package.json)` 内使用共享 `runProfilePnpm`，禁用生命周期脚本与自动 peer 安装。`remove` 使用 `--config.ignore-scripts=true`，适配本机内置 pnpm 的命令参数。四文件和旧 tgz 备份到 `.guide-manager/maintenance-transactions/<id>/`，不覆盖历史。

成功状态为 `uninstall|repair|manager-upgrade|manager-restore-awaiting-restart`。普通异常恢复操作前文件和旧依赖，记为 `failed-restored`；依赖恢复失败或中断记为需要处理，wrapper 不自动启动不完整实例。失败 pending 可取消后重新预览；硬中断留下 `applying` 时不能仅删回执继续，先核对备份与官方依赖安装结果。本轮不承诺任意断电点自动恢复。

5A 安装、5B 升级、5C 维护和组件开关互相拒绝冲突的准备操作；所有实际包操作与官方插件页共用写锁。stage 仅写 manager 自有目录；它不在运行中写 profile 四文件。

```text
POST /guide-manager/api/maintenance/plan   # { kind: "uninstall"|"repair", components: ["panel"] }
POST /guide-manager/api/maintenance/plan   # { kind: "manager-upgrade", version: "x.y.z" }
POST /guide-manager/api/maintenance/stage  # 重复同一请求 + planId + confirm:true
POST /guide-manager/api/maintenance/cancel # { planId, confirm:true }
GET  /guide-manager/api/state             # maintenance: pending/result/catalog/helper/recovery/verification/external
```

接口复用 connection 围栏与请求体限制。`guide` skill、skills manager、better-sidebar 单独列出存在与版本，技能入口复用原设置深链。外部来源、安装、启停和升级继续由其所属管理器处理；六组件就绪不表示这些外部能力已全部就绪。

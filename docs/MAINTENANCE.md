# 维护与恢复

面向维护者：安装目录、备份、包事务、故障恢复和发布运维。日常安装/升级操作见 [安装与升级](INSTALLATION.md)。

## 1. 当前安装

| 项目 | 值 |
|---|---|
| Release | `guide-v1.5.0` |
| manager | `1.4.0` |
| 六组件 | `1.1.0` |
| profile | `%USERPROFILE%\.dsh\profiles\desktop` |
| 依赖形式 | `.guide-manager/package-cache/<sha256>.tgz` |
| 状态 | `verified-running` |

七包均为 `private:true`、`UNLICENSED`。当前分发只走 GitHub Releases。

## 2. 目录

```text
guide-panel/            指导会话、面板、HTTP API、归档
guide-admission/        原生准入、容量/身份/按池快照
guide-shield/           结算防护 Host 服务
guide-preset/           guide persona 与工具面
guide-goal-adapter/     goal driver/join 适配
guide-sidebar-adapter/  官方 sidebar 局部视图
guide-manager/          管理页、安装/升级/维护、远端来源、恢复
docs/                   用户、运维、架构、开发、限制
scripts/                构建、测试、发布工具
```

manager 内主要文件：

```text
index.js                        Host 入口、state/API
client.js                       管理页 React client
install.js / upgrade.js         安装与组件升级事务
maintenance.js                  卸载、修复、manager 升级
migration.js                    link → Release 迁移
cache.js                        固定缓存清点/重建
recovery.js                     硬中断只读诊断
remote.js                       公开源查询/下载/准备
execution.js                    面板自动执行
helper/                         冷执行、恢复、辅助脚本
```

## 3. Profile 四文件

所有冷事务至少保护：

- `package.json`
- `pnpm-lock.yaml`
- `cordis.patch.yml`
- `pnpm-workspace.yaml`

事务目录位于 `.guide-manager/`：

```text
package-transactions/<id>/
maintenance-transactions/<id>/
migration-transactions/<id>/
install-backups/<id>/
controllers/<hash>/
```

不要把这些目录当普通缓存删除；它们包含回退所需的旧包、四文件快照或恢复入口。

## 4. 包操作原则

- 使用官方 profile 锁；不要另起 npm/pnpm 并发写 profile；
- 先准备计划、预览指纹，再确认执行；
- 执行前停止目标 DSH；
- 升级/迁移/维护失败先自动恢复；
- 自动恢复失败时保持 Host 停止，写 `recovery-required`；
- 不盲删 pending，不重置用户会话；
- 开发 `link` 不自动覆盖，需显式迁移或重载；
- 缓存重建只写缓存，不修改依赖。

## 5. 管理页操作

| 操作 | 入口 | 备份 |
|---|---|---|
| 首次安装 | 安装组件 | `install-backups/<id>` |
| 组件升级 | 组件升级与包版本恢复 | `package-transactions/<id>` |
| 版本恢复 | 组件升级与包版本恢复 | 旧事务 + 原旧包 |
| 卸载 | 卸载、修复与管理器升级 | `maintenance-transactions/<id>` |
| 修复 | 卸载、修复与管理器升级 | 原包/缓存 |
| manager 升级 | 卸载、修复与管理器升级或远端来源 | `maintenance-transactions/<id>` |
| link 迁移 | 开发 link 来源迁移 | `migration-transactions/<id>` |
| 缓存重建 | 包缓存 | 只写 cache |

所有确认执行都要求保存工作并重启 DSH。

## 6. 自动执行

manager 1.4.0 支持面板确认后自动执行：

1. 页面生成精确执行计划；
2. 用户再次确认；
3. 独立 PowerShell worker 在 DSH 进程树之外启动；
4. 停止目标 Host、执行包操作、重启；
5. 新 Host 返回页面并核对；
6. 只有新 Host、计划已消费、回执和健康检查都通过才标记完成。

旧版本或执行器不可用时，页面保留手动 helper 命令。

## 7. 故障恢复

### 7.1 先判断

查看：

- 页面「硬中断恢复」；
- `.guide-manager/*-result.json`；
- `.guide-manager/*-pending.json`；
- 对应事务目录；
- `helper-*.log`。

不要仅在 `recovery-required` 时重试；先确认事务备份完整。

### 7.2 硬中断诊断

```powershell
node guide-manager/helper/recover-hard-interrupt.mjs --profile <profile>
```

只读输出中断类型、可恢复动作、事务 id、缺失备份和助手路径。

### 7.3 显式恢复

先停止目标 DSH：

```powershell
guide-manager/helper/recover-hard-interrupt.cmd `
  -Profile <profile> `
  -Action package-restore `
  -Id <transaction-id>
```

动作：

| 动作 | 用途 |
|---|---|
| `install-restore` | 首次安装中断 |
| `package-restore` | 组件升级/版本恢复中断 |
| `maintenance-restore` | 卸载/修复中断 |
| `manager-restore` | manager 升级中断 |
| `migration-recover` | 迁移中断，使用现有 migration 恢复 |

执行器会校验四文件、事务 artifact、缓存 SHA；恢复失败保持停止并写结果。

### 7.4 manager 恢复

```powershell
guide-manager/helper/recover-manager.ps1 -Profile <profile>
```

或使用 `restart-guide-manager.ps1 -RecoverManager`。恢复依赖 manager 事务和旧包。

### 7.5 link 迁移恢复

```powershell
guide-manager/helper/migrate-guide-manager.cmd -Profile <profile> -RecoverMigration -TransactionId <id>
```

恢复源码快照或原 link；不要用硬中断恢复动作替代迁移恢复。

### 7.6 缓存重建

页面「包缓存」从公开源重建；离线：

```powershell
node guide-manager/helper/rebuild-cache.mjs --profile <profile> --catalog <release-catalog.json> --apply
```

源文件/临时文件均校验 SHA；完整缓存不重写。

### 7.7 桌面打不开

组件损坏导致插件页无法启动时：

```powershell
guide-manager/helper/repair-components.ps1 -Profile <profile> -Components panel
```

它只使用可信本地包，不重装其他插件；多个组件用逗号分隔。

## 8. 升级维护

常规升级：

1. 检查更新；
2. 准备并预览；
3. 保存工作；
4. 确认执行并重启；
5. 核对版本、组件、缓存、pending。

manager 升级前保留：

- 当前四文件；
- 旧 manager tgz；
- manager catalog；
- 事务/控制器副本。

## 9. 发布运维

发布由维护者执行，固定提交、历史组合和附件 SHA：

```powershell
npm run manager:remote-release -- --repository PreLuna/dsh-guide-mode `
  --commit <sha> --tag guide-vX.Y.Z --output dist/remote-X
npm run manager:github-release -- verify --bundle dist/remote-X
npm run manager:github-release -- draft --bundle dist/remote-X --execute
npm run manager:github-release -- publish --bundle dist/remote-X --execute
```

需要 `DSH_GUIDE_RELEASE_TOKEN`。同版本不同字节拒绝发布；草稿可恢复上传但不覆盖既有资产。

## 10. 本地开发安装

工作区 link 开发入口：

```powershell
node scripts/workspace.mjs prepare
pwsh -File scripts/apply-profile.ps1 ...
```

要求先在隔离 profile 验证。当前 live 是发布包，不要用开发路径直接覆盖。

## 11. 检查命令

```powershell
npm test                 # 34 个 Node 进程，manager 155 用例
npm run build:check
npm run doctor
npm run repo:check
git diff --check
```

## 12. 证据

本机 `evidence/` 保存发布/恢复现场，不在 Git 中分发。当前关键记录：

- `evidence/live-manager-1.4-upgrade-2026-11-17/` — manager 1.4.0 live 升级；
- `evidence/phase5f-2026-11-17/` — 硬中断恢复隔离验收；
- `evidence/migration-e07-2026-11-16/` — link 来源迁移独立桌面验收；
- `evidence/migration-acceptance-2026-11-16/` — link 来源迁移真实 pnpm 隔离验收。

引用这些路径用于本机追溯，不表示 clone 后附带。

## 13. 禁止操作

- 删除 `package-cache` 中仍被依赖的 tgz；
- 直接改 `pnpm-lock.yaml` 绕过事务；
- 在 DSH 运行中覆盖 `node_modules/@local/*`；
- 删除 pending/事务以“修复”状态；
- 把历史证据中的旧脚本/旧路径当作当前发布流程；
- 在未知 Host 版本上强制升级后声称兼容。

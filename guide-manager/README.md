# guide-manager

DSH 指导模式的独立管理组件。它在官方插件页注册「指导」tab，负责六组件安装/升级/恢复/卸载/修复、manager 自升级、公开 Release 来源、来源迁移、故障恢复和包缓存。

- 当前版本：`1.4.2`
- 支持基线：DSH `0.2.1-rc.3`、Cordis `4.0.5`、better-sidebar `0.28.2`
- 分发：GitHub Releases；不发布 npm

manager 可以单独运行，不要求六组件已安装。

## 安装

从 [最新 Release](https://github.com/PreLuna/dsh-guide-mode/releases/latest) 下载 `local-dsh-guide-manager-<版本>.tgz`，在官方插件页安装并重启 DSH。之后进入「插件 → 指导」。

完整用户流程见 [安装与升级](../docs/INSTALLATION.md)。

## 管理页

### 安装与重启进度

显示当前安装/升级/迁移/恢复任务的阶段、进度和回执。执行期间不应并发发起其他包操作。

### 远端发布来源

- 默认公开仓库 `PreLuna/dsh-guide-mode`，免 token；
- 检查最新 Release；
- 选择安装组件、升级组件或升级 manager；
- 下载/校验准备后预览精确计划；
- 确认后自动停机、执行、重启并返回核对；
- 任务可取消/重试；
- 私有来源需要本机环境变量，浏览器不接收凭据。

### 开发 link 来源迁移

- 只处理七个自有包的 `link:` 依赖；
- 清点来源、版本、文件差异；
- 生成绑定四文件/源码哈希/目标 SHA 的迁移计划；
- 确认后停机迁移到固定缓存；
- 失败恢复原 link 或源码快照；
- 全部固定时显示 `0 / 7`，不提供迁移。

### 安装组件

首次安装缺失组件；自动补齐依赖；确认后执行并重启。已安装组件使用升级区。

### 组件升级与包版本恢复

- 选择兼容组合；
- 备份旧包、旧 lock、四文件；
- 成功后保留事务，可恢复旧版本；
- 失败自动修复；修复失败写 `recovery-required`；
- 不隐式覆盖开发 link。

### 卸载、修复与管理器升级

- 卸载：处理依赖、保护 preset、goal 恢复原生 driver；
- 修复：同版本重新安装缓存包；
- manager 升级：使用可信本地目录或远端来源，保留独立恢复入口；
- 页面显示外部恢复命令。

### 包缓存

- 清点 `.guide-manager/package-cache/<sha256>.tgz`；
- 缺失/损坏时从公开 Release 按 SHA 重建；
- 离线使用 `helper/rebuild-cache.mjs`；
- 只写缓存，不修改依赖。

### 硬中断恢复

仅检测到未完成事务时显示：

- 只读诊断；
- 可恢复动作/事务 id/助手路径；
- 不自动删除 pending；
- 需要停止 DSH 后运行外部助手。

## API

所有写操作受 connection 围栏、计划指纹和确认保护。

```text
GET  /guide-manager/api/state

POST /guide-manager/api/install/plan
POST /guide-manager/api/install/stage
POST /guide-manager/api/install/cancel

POST /guide-manager/api/packages/plan
POST /guide-manager/api/packages/restore-plan
POST /guide-manager/api/packages/stage
POST /guide-manager/api/packages/cancel

POST /guide-manager/api/maintenance/plan
POST /guide-manager/api/maintenance/stage
POST /guide-manager/api/maintenance/cancel

POST /guide-manager/api/migration/plan
POST /guide-manager/api/migration/stage
POST /guide-manager/api/migration/cancel

POST /guide-manager/api/source/check
POST /guide-manager/api/source/prepare
POST /guide-manager/api/source/task
POST /guide-manager/api/source/cancel
POST /guide-manager/api/source/plan
POST /guide-manager/api/source/stage
POST /guide-manager/api/source/cache

POST /guide-manager/api/execution/plan
POST /guide-manager/api/execution/start
POST /guide-manager/api/execution/ack
```

`state` 主要字段：

- `manager` / `release` / `host`
- `components` / `edges` / `pending`
- `installation` / `packageManagement`
- `maintenance` / `migration`
- `distribution` / `execution`
- `cache` / `recovery`
- `warnings`

## 包模型

### 包

六个运行组件：

- `@local/dsh-guide-panel`
- `@local/dsh-guide-admission`
- `@local/dsh-guide-shield`
- `@local/dsh-guide-preset`
- `@local/dsh-guide-goal-adapter`
- `@local/dsh-guide-sidebar-adapter`

manager：`@local/dsh-guide-manager`。

### 来源

- `file:` 固定缓存：生产推荐；
- `link:` 开发来源：受保护，不隐式替换；
- registry/git：由官方插件页维护，不自动迁移。

### 四文件

- `package.json`
- `pnpm-lock.yaml`
- `cordis.patch.yml`
- `pnpm-workspace.yaml`

### 事务

```text
.guide-manager/install-pending.json
.guide-manager/package-pending.json
.guide-manager/maintenance-pending.json
.guide-manager/migration-pending.json
.guide-manager/*-result.json
.guide-manager/install-backups/<id>/
.guide-manager/package-transactions/<id>/
.guide-manager/maintenance-transactions/<id>/
.guide-manager/migration-transactions/<id>/
.guide-manager/controllers/<hash>/
```

执行器在官方 profile 锁内校验计划、备份、执行官方 pnpm、核对版本/契约/宿主/配置；失败恢复旧图。

## 自动执行

`execution.js` 绑定计划、pending、四文件、控制器和 Host 身份。确认后：

1. 生成执行指纹；
2. Windows 自带 PowerShell/WMI 在 DSH 树外启动 worker；
3. 浏览器 ack 前不进入停机；
4. 执行器停 Host、应用事务、重启；
5. 新 Host 核对计划已消费、回执和健康状态；
6. 通过后标记 completed。

旧版/执行器不可用时，页面保留手动 helper。

## 恢复

```powershell
# 硬中断只读诊断
node helper/recover-hard-interrupt.mjs --profile <profile>

# 显式恢复（先停止 DSH）
helper/recover-hard-interrupt.cmd -Profile <profile> -Action package-restore -Id <id>

# manager 恢复
helper/recover-manager.ps1 -Profile <profile>

# 迁移恢复
helper/migrate-guide-manager.cmd -Profile <profile> -RecoverMigration -TransactionId <id>

# 缓存重建（离线）
node helper/rebuild-cache.mjs --profile <profile> --catalog <catalog.json> --apply
```

恢复动作：

- `install-restore`
- `package-restore`
- `maintenance-restore`
- `manager-restore`
- migration 使用现有 `recover-migration.mjs`

不盲删 pending，不重置用户会话。完整运维说明见 [维护与恢复](../docs/MAINTENANCE.md)。

## 安全

- 公开源不读 token；私有源 token 只从本机 env 读取；
- 浏览器不接收凭据、任意 URL、npm spec 或脚本；
- 所有写操作需要确认和精确计划；
- 包 SHA/契约/宿主不匹配即拒绝；
- 支持版本固定，未知版本进入只读/unsupported；
- 包元数据 `private:true`、`UNLICENSED`。

## 开发与测试

```powershell
npm test
npm run build:check
npm run doctor
npm run repo:check
git diff --check
```

manager 测试覆盖计划、事务、恢复、来源、HTTP、客户端、发布和真实 pnpm 路径。真实 UI 验收使用隔离 profile，不操作用户 live。

见 [开发](../docs/DEVELOPMENT.md)、[架构](../docs/ARCHITECTURE.md)、[限制](../docs/LIMITS.md)。

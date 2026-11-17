# DSH 指导模式

在 DSH 主会话旁运行继承上下文的指导会话，用独立 `guide` preset 提供建议或直接修改工作区。指导会话可以并行于主会话的 goal，同时通过 sidebar 专区、准入控制、结算防护和独立 manager 管理。

## 功能

- **指导会话**：继承父会话已完成轮次之前的上下文，在原生对话页继续追问、停止或修改文件。
- **goal 并行**：信任的直属指导不阻塞主会话续轮；普通工作、pending、closing 和身份未知时继续等待。
- **模型隔离**：主会话模型看不到指导及其后代，也不能通过 `send_message` / `interrupt_agent` 控制指导。
- **结算防护**：独立 Host 服务丢弃已结算指导的迟到通知，panel 热更新不卸载防护。
- **sidebar 集成**：官方 `dsh-better-sidebar` 的树/图/计数忽略指导；任务页底部提供独立指导专区。
- **归档**：手动归档停止并隐藏会话；自动归档默认关闭，可显式开启。
- **安装与包管理**：官方插件页「指导」tab 安装、升级、恢复、卸载、修复和自升级；公开 GitHub Release 来源默认免 token。
- **来源迁移**：开发 `link:` 安装可迁移到固定 Release 缓存，保留源码快照与失败恢复。
- **故障恢复**：只读诊断中断事务；缓存缺失/损坏时按 SHA 重建。

## 当前版本

| 项目 | 值 |
|---|---|
| 最新 Release | `guide-v1.5.0` |
| manager | `1.4.0` |
| 六组件 | `1.1.0` |
| 支持基线 | DSH `0.2.1-rc.3`、Cordis `4.0.5`、better-sidebar `0.28.2` |
| 分发 | GitHub Releases；npm 未发布，包为 `private:true` / `UNLICENSED` |

本机 live 当前为 manager 1.4.0 + 六组件 1.1.0 的固定缓存包，运行核对 `verified-running`。

## 安装

### 1. 安装 manager

从 [最新 Release](https://github.com/PreLuna/dsh-guide-mode/releases/latest) 下载 `local-dsh-guide-manager-<版本>.tgz`，在官方插件页安装并重启 DSH。安装后出现「插件 → 指导」页。

### 2. 安装组件

进入「指导 → 安装组件」：

1. 选择需要的组件；
2. 预览依赖与精确版本；
3. 保存工作；
4. 确认执行并重启；
5. 返回页面核对 `verified-running`。

推荐安装六组件。`sidebar` 需要先安装官方 `dsh-better-sidebar@0.28.2`；缺失时可取消该可选组件。

### 3. 外部依赖

以下不随插件打包，使用各自入口管理：

- `dsh-better-sidebar`：官方 sidebar 宿主；
- `guide` skill：用户级指导 persona；缺失时 preset 明确降级；
- `@michengai/dsh-skills-manager`：技能管理深链；不是运行必需。

详细步骤见 [安装与升级](docs/INSTALLATION.md)。

## 日常使用

1. 在主会话先发一条消息，使父 agent 在线；
2. 右侧栏「开始」→「指导」，输入问题后开始；
3. 指导在原生对话页运行，可继续追问、Stop 或修改文件；
4. 关闭页签保留会话，可从面板或专区重新打开；
5. 归档会停止并隐藏会话，可取消归档恢复。

详细行为见 [使用指南](docs/USER-GUIDE.md)。

## 管理页

「插件 → 指导」页面分为：

- **安装与重启进度**：当前执行任务和进度；
- **远端发布来源**：检查公开 Release、下载准备、预览计划、自动执行；
- **开发 link 来源迁移**：清点 link、比较内容、迁移到固定缓存；
- **安装组件**：首次安装缺失组件；
- **组件升级与包版本恢复**：兼容组合升级和旧版本恢复；
- **卸载、修复与管理器升级**：维护操作；
- **包缓存**：检查/重建七个自有包的固定缓存；
- **硬中断恢复**：仅在检测到未完成事务时显示，提供只读诊断和外部恢复助手。

完整说明见 [使用指南](docs/USER-GUIDE.md)。

## 运维与恢复

关键原则：

- 包操作使用官方 profile 锁；
- 升级/迁移前备份 profile 四文件、旧包和配置；
- 失败自动恢复；恢复失败时保持 Host 停止并保留回执；
- 不盲删 pending，不重置用户会话；
- 缓存重建只写缓存，不改依赖。

以下命令在仓库或 manager 包根目录执行；日常操作优先使用管理页。

```powershell
# 硬中断只读诊断
node guide-manager/helper/recover-hard-interrupt.mjs --profile <profile>

# 迁移事务恢复
guide-manager/helper/migrate-guide-manager.cmd -Profile <profile>

# 缓存重建（本地可信发布目录）
node guide-manager/helper/rebuild-cache.mjs --profile <profile> --catalog <release-catalog.json> --apply
```

完整流程、备份位置和外部恢复命令见 [维护与恢复](docs/MAINTENANCE.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [文档索引](docs/README.md) | 用户、维护者、开发者入口 |
| [安装与升级](docs/INSTALLATION.md) | 环境要求、首次安装、升级、迁移、缓存重建、回退 |
| [使用指南](docs/USER-GUIDE.md) | 指导会话、goal、sidebar、归档、管理页 |
| [维护与恢复](docs/MAINTENANCE.md) | 目录、备份、锁、故障恢复、发布运维 |
| [架构](docs/ARCHITECTURE.md) | 包结构、Host 服务、事务与安全边界 |
| [开发](docs/DEVELOPMENT.md) | 本地开发、测试、构建、发布流程 |
| [限制与兼容](docs/LIMITS.md) | 支持版本、已知缺口、许可证 |
| [变更记录](CHANGELOG.md) | 各版本发布内容 |

## 仓库结构

```text
guide-panel/           指导会话、面板、HTTP API、归档
guide-admission/       原生准入与容量/身份快照
guide-shield/          结算防护 Host 服务
guide-preset/          guide persona / 工具面
guide-goal-adapter/    goal driver/join 适配
guide-sidebar-adapter/ 官方 sidebar 适配
guide-manager/         管理页、安装与包事务、发布消费端
docs/                  用户、运维、架构与开发文档
scripts/               构建、测试、发布工具
```

## 许可证

包元数据为 `private:true`、`UNLICENSED`。源码公开可见，但当前不构成开源再分发授权；对外分发前需明确许可证与命名空间。

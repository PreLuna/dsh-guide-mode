# 安装与升级

本文面向使用指导模式的 DSH 用户。开发环境搭建见 [开发](DEVELOPMENT.md)。

## 1. 环境要求

| 项目 | 要求 |
|---|---|
| 操作系统 | Windows（真实 UI 与 Host 生命周期验收环境） |
| DSH | `0.2.1-rc.3`（build `be72761ee1a6736ebcdf4f3739363b083ae53c98`） |
| Cordis | `4.0.5` |
| better-sidebar | 官方 `0.28.2`（sidebar 组件必需） |
| 网络 | 可访问 GitHub Releases；公开源不需要 token |
| 权限 | 当前用户可写 DSH profile 与安装目录 |

未知 DSH/Cordis/better-sidebar 版本可能进入只读、`unsupported` 或降级状态；插件不会声称未验证版本可用。

## 2. 首次安装

### 2.1 安装 manager

1. 打开 [最新 Release](https://github.com/PreLuna/dsh-guide-mode/releases/latest)；
2. 下载 `local-dsh-guide-manager-<版本>.tgz`；
3. 在 DSH 官方插件页安装该 tgz；
4. 重启 DSH；
5. 打开「插件 → 指导」。

manager 可以单独运行，不要求六个组件已安装。

### 2.2 安装组件

进入「指导 → 安装组件」：

1. 勾选组件。推荐六组件：preset、shield、admission、panel、sidebar、goal；
2. 查看依赖闭包与精确版本；
3. 保存当前工作并结束正在运行的任务；
4. 点击「确认执行并重启」；
5. 等待 DSH 重启，页面自动返回并核对运行状态。

注意事项：

- `panel` 自动补齐 preset/shield/admission；`admission` 自动补齐 shield；
- `sidebar` 需要 `dsh-better-sidebar@0.28.2`，否则请取消该组件；
- 已安装的同版本组件不会在这里重复安装；
- 开发 `link` 不会被首次安装隐式覆盖。

### 2.3 外部依赖

这些不是六组件的一部分：

- **better-sidebar**：在官方插件页安装/升级；
- **guide skill**：用户级技能，缺失时 `guide` preset 明确降级；
- **skills manager**：技能设置深链，非运行必需。

## 3. 升级组件

进入「指导 → 组件升级与包版本恢复」：

1. 选择组件目标版本；
2. 预览兼容组合与依赖变化；
3. 保存工作；
4. 确认执行并重启；
5. 核对 `verified-running` 和新版本。

升级只接受发布清单中兼容的组合；不会自动跨越未声明的版本或数据 schema。

## 4. 恢复旧版本

升级成功后会保留事务备份。进入「组件升级与包版本恢复」：

1. 找到对应升级事务；
2. 预览恢复计划；
3. 确认执行并重启；
4. 核对旧版本和配置。

原 Release 目录不可用时，只要事务中的旧包与旧 lock 仍完整，仍可恢复。恢复不承诺还原临时发布目录路径或 lockfile 的原始字节，但会恢复依赖图和 profile 四文件语义。

## 5. 开发 link 来源迁移

仅当七个自有包以 `link:` 安装时使用。

1. 打开「插件 → 指导 → 开发 link 来源迁移」；
2. 先在上方检查更新；
3. 点击「下载并准备迁移」；
4. 预览源码/发布包文件差异和精确目标；
5. 保存工作；
6. 确认执行并重启。

迁移会：

- 备份 profile 四文件和源码快照；
- 清理目标包旧 lock importer；
- 用官方 pnpm 安装固定缓存 tgz；
- 失败恢复原 link 或从快照重建来源。

当前 live 的七个包已经是固定缓存，因此显示 `0 / 7` 是正常状态。

## 6. 重建包缓存

进入「指导 → 包缓存」：

1. 检查缓存状态；
2. 缺失/损坏时点击「重建缺失/损坏缓存」；
3. 先检查更新，提供 Release 快照；
4. 等待下载和 SHA 校验；
5. 刷新后确认缓存完整。

离线环境可使用本地可信发布目录：

```powershell
node guide-manager/helper/rebuild-cache.mjs `
  --profile <profile> `
  --catalog <release-catalog.json> `
  --apply
```

先不带 `--apply` 查看计划。重建只写 `.guide-manager/package-cache/<sha256>.tgz`，不修改依赖或配置。

## 7. 升级 manager

有两种方式：

- 在「远端发布来源」选择「升级管理器」，从公开 Release 准备并执行；
- 在「卸载、修复与管理器升级」选择可信本地 manager 目录升级。

manager 升级会保存独立恢复入口。升级完成后重新加载「指导」页；旧页面可能仍显示旧 UI，刷新即可。

## 8. 卸载与修复

- **修复**：同版本重新安装缓存包，保留配置；适用于文件损坏/缺少入口；
- **卸载**：移除选定组件及配置行；`preset` 受保护，`goal` 卸载会恢复原生 driver；
- **组件页面打不开**：使用 manager 包内 `helper/repair-components.ps1`；
- **完整移除**：先卸载组件，再通过官方插件页移除 manager；保留 profile 备份。

## 9. 失败与回退

- 操作失败时先看页面回执和 `.guide-manager/` 下的结果/日志；
- 不要直接删除 pending 或事务目录；
- 硬中断使用「硬中断恢复」区或 `helper/recover-hard-interrupt.mjs`；
- manager 升级失败使用 `recover-manager.ps1` 或页面给出的恢复命令；
- 迁移失败使用 `recover-migration.mjs`；
- 恢复前先停止目标 DSH。

详细恢复步骤、备份路径和命令见 [维护与恢复](MAINTENANCE.md)。

## 10. 安装后检查

在「插件 → 指导」确认：

- manager 版本正确；
- 六组件状态为 ready / running；
- 宿主版本、Cordis、sidebar 产物匹配；
- 没有未完成 pending；
- 包缓存完整；
- guide skill 状态符合预期。

页面出现只读/unsupported 时，先按 [限制与兼容](LIMITS.md) 核对版本，不要用强制覆盖绕过门禁。

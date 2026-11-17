# 架构

## 1. 总览

```text
DSH Host
├── guide-panel (provider, tab, API, archive)
│   ├── guide-admission  (native admission/capacity)
│   └── guide-shield     (settlement guard)
├── guide-preset         (guide persona/tool face)
├── guide-goal-adapter   (goal driver/join)
├── guide-sidebar-adapter(official sidebar projection)
└── guide-manager        (plugins tab, package transactions, release consumer)
```

六个运行组件互不复制上游 driver/join 源码。`guide` 会话使用 DSH 原生 subagent 机制和独立 preset；两个 adapter 只补充局部视图/并行行为。

## 2. 会话与上下文

- `guide-panel` 注册独立 `guide-fork` provider；
- 创建时 seed 父会话最后一个 completed turn 之前的事件；
- 首次 `delivery:caller` 建立父/子身份，后续支持冷恢复；
- 指导在原生 `subagentchat` 对话页运行，写入普通会话存储；
- 关闭页签只隐藏 UI，不销毁会话；
- 归档停止执行、保留历史，可取消归档恢复。

上下文继承只选择已完成轮次，避免把半轮消息带入指导。

## 3. Goal 并行与准入

- `guide-goal-adapter` 复用原 `goal` driver/join；
- 信任的直属指导不阻塞父会话续轮；
- 普通工作、pending、closing、external、身份未知仍等待；
- `guide-admission` 在原生同步路径占槽前检查容量；
- C 跟 Host、R 按原生池、M 按 profile 全局；
- 零预算禁止进入。

身份可信度来自 provider 关系，不来自 label 前缀；两者不能互相替代。

## 4. 模型投影与结算

- 主会话模型 `list_agents` 隐藏指导及其后代；
- 模型对指导的 `send_message` / `interrupt_agent` 被拒绝；
- 普通工作与指导向父级回报放行；
- `guide-shield` 是独立 Host 服务，包装父 `followup`/`steer`/`inject`；
- 已登记指导的 settled 通知被丢弃；
- panel 热更新不卸载 shield；shield 自身卸载会失活并释放包装；
- 第三方保留的旧 wrapper 直通原方法。

## 5. Sidebar

- 使用官方 `dsh-better-sidebar@0.28.2`；
- `guide-sidebar-adapter` 提供局部 sessions facade；
- 树/图/计数/auto-open 共用过滤结果；
- 任务页底部独立指导专区，可混合分组；
- 不构建/覆盖官方 sidebar；官方升级需重新核验产物。

## 6. 管理页

`guide-manager` 是独立 Host + client bundle：

- 在官方插件页注册「指导」tab；
- Host 通过官方 `pluginManager.listPlugins()`/`listBundles()` 或 profile manifest 读取组件；
- 汇总宿主 BOM、产物哈希、`guide` skill、skills manager、包缓存、事务和恢复状态；
- `/guide-manager/api/state` 输出当前状态；
- 所有写操作经过 connection 围栏、计划指纹和确认；
- panel/sidebar 启停走官方热切换；admission/shield/goal 走冷 pending；
- manager 自身通过独立控制器副本升级/恢复。

## 7. 包事务

### 7.1 四文件

所有冷事务保护：

- `package.json`
- `pnpm-lock.yaml`
- `cordis.patch.yml`
- `pnpm-workspace.yaml`

### 7.2 执行

- 首次安装：`install-pending.json` → `apply-install.mjs`；
- 组件升级/恢复：`package-pending.json` → `apply-package.mjs`；
- 卸载/修复/manager 升级：`maintenance-pending.json` → `apply-maintenance.mjs`；
- link 迁移：`migration-pending.json` → `apply-migration.mjs`。

执行器在官方 profile 锁内：

1. 校验计划/profile/包 SHA；
2. 备份四文件和旧包；
3. 用官方 pnpm 安装/删除；
4. 核对版本、契约、宿主和配置；
5. 失败恢复旧图；
6. 恢复失败写 `recovery-required` 并保持停止。

### 7.3 自动执行

`execution.js` 绑定计划、pending、四文件、控制器与 Host 身份。确认后由 Windows 自带 PowerShell/WMI 在 DSH 树外启动 worker，浏览器 ack 前不停机。新 Host 核对通过后才标记 completed。

## 8. 远端来源

- 发布清单 schema 4，固定 tag/commit 和附件 SHA；
- 消费端查询公开 Release，按依赖闭包下载；
- 写缓存前校验 SHA/tar/包身份/契约/宿主；
- 准备目录交给本地 install/upgrade/maintenance/migration 事务；
- 网络阶段不修改 profile；
- 同版本改字节、未知 schema、缺少依赖均拒绝。

## 9. 恢复与缓存

- `recovery.js` 只读诊断中断回执/事务；
- `recover-hard-interrupt.mjs` 在 Host 停止后显式恢复；
- 不盲删 pending；
- `cache.js` 清点固定缓存，按 SHA 重建；
- 缓存重建只写缓存文件，不改变依赖图。

## 10. 安全边界

- 公开源不需要 token；私有源从本机环境读取，不进入浏览器/URL；
- 不信任 HTTP 客户端传任意 npm spec、URL 或脚本；
- 支持版本固定，未知 DSH/Cordis/sidebar 进入只读或 unsupported；
- 包为 `UNLICENSED`，公开可见不等于再分发授权；
- 指导使用真实写权限，执行前需保存工作。

## 11. 数据与兼容

profile 四文件之外的数据（会话、skill、缓存）由 DSH 管理。只声明数据 schema 1；跨 schema 迁移、registry/git 来源迁移和损坏配置语义修复不在当前范围。见 [限制与兼容](LIMITS.md)。

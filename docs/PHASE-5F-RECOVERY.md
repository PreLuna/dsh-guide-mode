# Phase 5F：硬中断恢复与缓存重建

更新：2026-11-17。状态：**工作区实现与默认测试完成；尚未生成新 Release、未部署 live。**

## 1. 目标与边界

这组能力补的是“事务中途被强杀/断电后还能做什么”，以及“固定缓存文件丢失/损坏后如何可信恢复”。它不改变正常安装、升级、卸载或 5E migration 的路径。

明确不做：

- 不自动删除不认识/无法配对的 pending；
- 不在没有事务备份时猜测性重建；
- 不承诺任意断电点无人工恢复；
- 不重置用户配置语义；
- 不替代 5E migration 的源码快照恢复。

## 2. 硬中断诊断

`recovery.js` 只读扫描：

- `install-result.json` 的 `installing` / `recovery-required` / `invalid`；
- `package-result.json` 的 `upgrading` / `restoring` / `recovery-required` / `invalid`；
- `maintenance-result.json` 的 `applying` / `recovery-required` / `invalid`；
- `migration-result.json` 的 `migrating` / `recovery-required` / `invalid`；
- 各类 pending 与 `install-backups`、`package-transactions`、`maintenance-transactions`、`migration-transactions`。

输出 `state.recovery`，管理页显示问题、可恢复动作、事务 id 和恢复助手路径。只有能找到完整备份/事务的对象才标记 `recoverable: true`。

## 3. 显式恢复

`helper/recover-hard-interrupt.mjs` 在 DSH 停止后运行：

```powershell
node guide-manager/helper/recover-hard-interrupt.mjs --profile <profile>
```

只读诊断不修改文件。确认 action/id 后：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "<DeepSeek Harness.exe>" --expose-internals <manager>/helper/recover-hard-interrupt.mjs `
  --profile <profile> --action package-restore --id <transaction-id>
```

动作：

| action | 适用范围 | 行为 |
|---|---|---|
| `install-restore` | 首次安装中断 | 从 `install-backups/<id>` 恢复四文件，重装旧依赖图 |
| `package-restore` | 组件升级/版本恢复中断 | 校验 package transaction，恢复四文件、旧缓存 tgz、旧 lock 图 |
| `maintenance-restore` | 卸载/修复中断 | 校验 maintenance transaction，恢复旧组件图和配置 |
| `manager-restore` | manager 升级中断 | 恢复旧 manager tgz、四文件和旧图 |
| `migration-recover` | 迁移中断 | 继续使用 `recover-migration.mjs`，不在本助手重复实现 |

恢复在官方 profile 锁内执行；先校验备份/事务哈希，再恢复；完成后把对应 result 标为 `failed-restored`，写 `hard-interrupt-result.json`。不匹配的中断状态会拒绝执行。

## 4. 缓存重建

`cache.js` 只读检查 profile 依赖中的 `.guide-manager/package-cache/<sha256>.tgz`，区分 `ready` / `missing` / `corrupt`，忽略外部 registry/git 依赖。

两条执行路径：

1. 管理页「包缓存」：先检查更新，再按公开 Release catalog 的附件 SHA 下载缺失/损坏项；只写缓存，不改 package.json/lock。
2. 离线本地目录：
   ```powershell
   node guide-manager/helper/rebuild-cache.mjs --profile <profile> --catalog <release-catalog.json> [--catalog <manager-catalog.json>] --apply
   ```
   先不带 `--apply` 查看计划。

写入前再次校验源字节 SHA；`writeCacheArtifact` 先写临时文件、校验、再替换，避免留下半文件。源不可用、SHA 不符、目标包不匹配都会阻断；完整缓存不会被重写。

## 5. API 与管理页

- `GET /guide-manager/api/state` 新增 `cache` 与 `recovery`；
- `POST /guide-manager/api/source/cache` `{ snapshotId }` 启动公开源缓存重建任务；
- 管理页新增「包缓存」与「硬中断恢复」区；恢复区只展示问题和外部助手路径，不尝试在中断 Host 内自动重启。

## 6. 测试与证据

- `guide-manager/test/cache.test.mjs`：4 个用例（清点、计划/重建、源缺失阻断、源 SHA 不符阻断）；
- `guide-manager/test/recovery.test.mjs`：5 个用例（install 诊断/恢复、package 诊断/恢复、maintenance 恢复、缺失备份不声称可恢复）；
- `guide-manager/test/remote.test.mjs`：新增 1 个公开源缓存重建用例；
- 全量：34 个 Node 进程、manager 155 用例通过。
- 隔离夹具：删除真实缓存并由本地 catalog 重建；制造 install 中断备份并用真实 Electron Node/官方 pnpm 恢复，现场见 [隔离验收](../evidence/phase5f-2026-11-17/report.md)。

尚未执行：真实进程强杀/断电注入、真实损坏缓存现场、发布与 live 部署。当前 live 仍为 manager 1.3.0，不包含本页 5F 代码。


# Guidance sidebar adapter

以未经修改的官方 `dsh-better-sidebar@0.28.2` 为基础，包装其浏览器模块的 `apply()`。原模块在独立 sessions 作用域运行：任务枚举和 catalog 过滤指导，按 ID 直接访问会话保持完整；主会话、其他插件与模型工具的 sessions 服务不变。

指导专区位于原任务页底部，使用用户确认的独立滚动区；原任务图/树组件完整复用。adapter 提供 `guideSidebarAdapter` 的版本 1 注册接口，guide-panel 在 active 模式优先使用它；旧 fork seam 仅保留为切换/回退期间的兼容入口。

没有上游源码副本或依赖 fork 的构建过程。`node scripts/build.mjs` 只拼装本包自己的 vanilla JavaScript。发布文件不包含研究提取件、官方包缓存或测试 fixture。

当前同时核验官方 client 产物、宿主 client-modules 产物及 Cordis 版本。未知版本/产物保持原侧栏，面板提示兼容功能不可用。实际私有边界仅集中在本包：模块导出装饰、原 Loader entry 生命周期和任务 descriptor 装饰。

装载/卸载兼容层会通过宿主 `tearDownEntryFiber()` 刷新一次原侧栏客户端，再交给原 `apply()` 运行；不停止 Host agent，不删除会话或设置。快速页签切换/刷新时原宿主偶有 WebSocket 提前关闭或 session reference released 的控制台提示；功能验收会保留这些日志，不能把它们当作静默通过。

## 安装与回退

先运行 `scripts/prepare-official.mjs` 下载并验证 npm SHA-512，再完成隔离验证。关闭 DSH 后运行 `scripts/install-desktop.ps1`：保存文件级恢复信息，将已覆盖的安装恢复为官方文件，登记独立 adapter 的 link/bundle。

`install-desktop.ps1 -Restore` 恢复阶段一的 sidebar 文件和配置选择，保留 goal adapter 与其他后续 profile 配置；不递归删除包或用户数据。恢复文件均核对 SHA-256，替换文件时不会写穿可能的硬链接。重新运行正常安装可回到官方包 + adapter。

不再运行 better-sidebar-fork 的构建或覆盖脚本。原 fork 与实验源码仅冻结为历史证据。

## 验证

```powershell
node guide-sidebar-adapter/scripts/build.mjs
node --test guide-sidebar-adapter/test/core.test.mjs
# 使用安装的 Electron Node 和 DSH runtime 解析原依赖：
& '<安装目录>/DeepSeek Harness.exe' --expose-internals guide-goal-adapter/test/run-host.mjs --sidebar-core
node guide-goal-adapter/scripts/smoke.mjs --integration --sidebar
```

隔离 UI 验证使用官方 tarball、独立 DSH_HOME、确定性本机模型和新的 headless Edge profile；测试 fixture 不安装到真实 desktop。证据见 `evidence/LI-stage2-2026-11-02/`。

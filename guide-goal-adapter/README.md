# Guidance goal adapter

独立 Host 插件：复用宿主 `dsh-goal-round-driver` 的 `apply()`，仅在私有 subagents 作用域过滤已确认的直属指导 activation。没有 driver/join 源码副本，也不改全局 subagent 服务。

目前过滤适配已核验 DSH `0.2.1-rc.3` 的具体 driver 产物和 join 函数指纹；其他产物保持原等待行为。跟踪中的创建工作、external、closing、拥有后代工作的指导、身份不明对象均保守等待。身份使用 sessionQuery 的 observation lease 和子会话自己的 descriptor，忽略继承事件。

`guideGoalAdapter.getState()` 返回 `ready` / `filtered` / `native` 及诊断原因。guide-panel 的 `/guide/api/state` 暴露这个状态；native 模式会提示指导仍可能阻挡续轮。

## 验证

使用安装包的 Electron Node 与原模块运行（设置 `ELECTRON_RUN_AS_NODE=1`，传 `--expose-internals`）：

```powershell
& '<DSH安装目录>/DeepSeek Harness.exe' --expose-internals guide-goal-adapter/test/run-host.mjs
node guide-goal-adapter/scripts/smoke.mjs
node guide-goal-adapter/scripts/smoke.mjs --integration
```

smoke 使用工作区下独立 DSH_HOME 和 profile；integration 使用进程内确定性模型，不读取真实用户凭据或调用外部模型。当前结果见 `evidence/LI-stage1-2026-11-02/`。

## 安装与撤销

首次切换前关闭 DSH Host，执行 `scripts/install-desktop.ps1`；它保存恢复信息、登记 link 包及 bundle，然后冷启动 DSH。`-Restore` 移除 adapter 的 bundle 和依赖选择，原 driver 的禁用 patch 随之消失，再次冷启动恢复。

安装脚本不覆盖原 driver 包。lockfile 由独立校验脚本只同步两个自有 link 的 importer 记录，并断言其余依赖图完全不变；本机离线 pnpm 缺少旧 registry 元数据，不能借此重新解析整个 profile。不要在适配器仍处于 bundles 中时只删除其目录。缺包/导入失败应被启动审计显式报告；按 `-Restore` 恢复，不在半初始化后再启动第二份 driver。

后置用户 patch 若重新启用原 driver，adapter 会拒绝重复调度入口并报告配置错误。卸载沿用原 driver 的取消/disarm 语义，不自动恢复用户 goal。

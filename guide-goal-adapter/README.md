# guide-goal-adapter

独立 Host 插件，复用宿主 `dsh-goal-round-driver` 的 `apply()`，只在私有 subagents 作用域过滤已确认的直属指导 activation。不复制 driver/join 源码，也不改全局 subagent 服务。

## 行为

- 跟踪中的创建工作、external、closing、拥有后代工作的指导、身份不明对象保守等待；
- 信任的直属指导不阻塞父会话续轮；
- 身份使用 sessionQuery 的 observation lease 和子会话自身 descriptor，忽略继承事件；
- 其他 driver 产物保持原等待行为；
- 后置用户 patch 重新启用原 driver 时，adapter 拒绝重复调度入口并报告配置错误。

## 状态

`guideGoalAdapter.getState()` 返回 `ready` / `filtered` / `native` 及诊断原因。panel 的 `/guide/api/state` 暴露该状态；`native` 表示指导仍可能阻挡续轮。

## 安装

由 manager 六组件流程安装；profile 中登记 adapter 和原 driver 的成对 intent。安装脚本不覆盖原 driver。卸载沿用原 driver 的取消/disarm 语义，不自动恢复用户 goal。

## 验证

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& '<DSH安装目录>/DeepSeek Harness.exe' --expose-internals guide-goal-adapter/test/run-host.mjs
node guide-goal-adapter/scripts/smoke.mjs
node guide-goal-adapter/scripts/smoke.mjs --integration
```

隔离 smoke 使用独立 `DSH_HOME` 和确定性模型，不读取真实用户凭据、不调用外部模型。

## 边界

- 只核验支持基线的具体 driver/join 产物；
- 未知产物不承诺过滤；
- 不恢复用户 goal，不替代原生 goal 生命周期。

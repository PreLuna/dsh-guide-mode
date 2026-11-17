# guide-admission

独立 Host 准入与容量服务。支持经源码/函数指纹核验的 DSH `0.2.1-rc.3` / Cordis `4.0.5`。

## 容量模型

- `capacity`：只读 Host 当前有效 `maxActiveSubagents`；
- `reserve:2`；
- `maxGuides:4`；
- C：Host 容量；
- R：按 live parent/resident 的原生池；
- M：按 profile 全局指导数；
- S：活动子 agent 槽，包括 creating、closing、external、带 inbox 的 idle parked；
- G：自身 first-wins `continuable/guide-fork` descriptor + 已接纳创建记录。

新建、非面板创建和原生 coldResume 在同一个无 await 的 materialize 边界检查：

```text
S + 1 <= max(0, C - R)
G + 1 <= M
```

通过后由原生同步占槽。

## 状态

`guideAdmission.state({sessionId?,sessionIds?})` 返回：

- 配置来源；
- 全局 G/unknown/busyIds；
- `poolsBySession` 的 C/S/B、poolId、压力和允许/拒绝原因。

新父未分配池可确认 `used=0`；父不在线时为未知，不按历史父链猜测。

## 拒绝

使用原生支持的 `ACTIVATION_LIMIT_REACHED` / `CONTINUATION_UNAVAILABLE`；原因写入 `admissionReason` 和 state。不自动排队或重发问题。

## 安装

- manager 六组件流程安装；
- profile 依赖和 bundles 中放在 panel 前；
- 移除 panel 的旧 `capacity/reserve/maxGuides` 配置；
- 旧覆盖值先迁移，再停 Host/冷启动。

## 边界

- 未知源码/函数/形状/包装所有权变化 → `unsupported`，面板禁止新增指导；
- 无法可信安装 hook 的未知版本**不保证其他原生入口仍受 R/M 限制**；
- 不承诺服务自身卸载/HMR 空窗连续执法；
- 卸载只还原自己仍持有的方法/manager accessor。

## 验证

```powershell
node guide-admission/test/core.test.mjs
```

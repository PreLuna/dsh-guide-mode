# Guide admission

独立 Host 准入服务 `@local/dsh-guide-admission`，支持经源码/函数指纹核验的 DSH 0.2.1-rc.3 / Cordis 4.0.5。

`capacity` 只读 Host 当前有效 `maxActiveSubagents`；本服务配置 `reserve:2`、`maxGuides:4`。R 按精确 live parent/resident 的原生池，M 按 profile 全局。新建、非面板创建和原生 coldResume 在同一个无 await 的 materialize 边界检查 `S+1 <= max(0,C-R)`、`G+1 <= M`，随后由原生同步占槽。普通工作直接委托原方法，不读取准入诊断。

S 来自 `slots.size`，包括 creating、closing、external、带 inbox 的 idle parked。G 根据自身 first-wins `continuable/guide-fork` descriptor 和已接纳创建记录计算；按 activation 对象去重，原生释放后移除。普通指导后代只增加 S。启动时已有 creating 无法恢复 provider，服务保持 reconciling，发布/回滚后重核，不能当零。

`guideAdmission.state({sessionId?,sessionIds?})` 返回配置来源、全局 G/unknown/busyIds，以及 `poolsBySession` 的 C/S/B、poolId、压力和允许/拒绝原因。新父未分配池可确认 used=0，状态读取不创建池；父不在线则未知，不按历史父链猜测。

服务同步观察 manager 赋值，接管替换实例并在旧实例排空前保留其 G。父/池/activation 均按对象生命周期识别。未知源码、函数、形状或包装所有权变化报告 unsupported，面板禁止新增指导；无法可信安装 hook 的未知版本**不保证其他原生入口仍受 R/M 限制**。

核心代码和 R/M 配置采用**停 Host → 更新 → 冷启动**。不承诺服务自身卸载/HMR 空窗连续执法；panel HMR 不卸载本服务。卸载只还原自己仍持有的方法/manager accessor，第三方保留的失活旧 wrapper 直通原方法。

容量策略拒绝使用原生支持的 `ACTIVATION_LIMIT_REACHED` / `CONTINUATION_UNAVAILABLE`，具体原因保存在 `admissionReason` 和 state；原生 prompt 对外映射为可重试的 `subagent/delivery-unavailable`。不自动排队或重发问题。

安装与回退必须与 panel 配套：profile 依赖和 bundles 中登记本服务，放在 panel 前，创建本地 junction；移除 panel 的 capacity/reserve/maxGuides 配置。旧覆盖值先迁移到此服务，旧 capacity 与 Host 不一致时应先核对。完整部署脚本和证据见 [实施记录](../evidence/O19-production-2026-11-03/report.md)。

验证入口：`node guide-admission/test/core.test.mjs`；真实 Host：`node evidence/O19-production-2026-11-03/run.mjs`。生产包不导入研究原型。

1.1.0 及后续本机维护使用 [统一维护流程](../docs/LOCAL-MAINTENANCE.md)。本目录原 O19 prepare/apply/rollback 脚本只保留该轮精确恢复关系；源码变化后会拒绝覆盖历史计划，不用于新版本升级。

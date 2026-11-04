# Guide settlement shield

独立 Host bundle `@local/dsh-guide-shield`，支持 DSH 0.2.1-rc.3 / Cordis 4.0.5。O2/R6 实现、验收与实际 desktop 部署已关闭，最终判定见 [收尾结论](../docs/HISTORY-AND-MAINTENANCE-NOTES.md)。panel 的 provider/API/O6 生命周期与结算防护分开：重载或禁用 panel 不卸载此服务，已有指导结算仍受保护。服务自身卸载会失活并释放它持有的包装；第三方保留的旧 wrapper 直通原方法。

`index.js` 先核验宿主源码与官方 descriptor fold 契约，不通过时报告 unsupported 并不安装半套保护；`core.js` 持有事件监听、父对象包装和释放；`identity.js` 只读子会话自身 first-wins descriptor。`guide-panel/identity.js` 与 `shield.js` 是兼容导出，goal adapter 继续保留独立 reader，但使用同一 first-wins 语义。

子 agent 在 Runtime 通知父会话之前已被释放。释放时对确认的指导保留一次性结算凭据，按**精确父对象**分组，投递时消费；新同 ID 生命周期、父释放或服务卸载会清理。每父最多 128 条、10 分钟惰性过期，仅保存 ID/时间，不持有整个 Session。该界限覆盖当前 Runtime 的 teardown 后立即通知契约；不承诺任意延迟或重复伪造通知。

## 当前维护

1.1.0 的统一安装、升级、完整卸载与恢复使用 [维护手册](../docs/MAINTENANCE.md)。官方同步 snapshotEvents(inheritedEventCount) 已 deprecated，目前在固定产物下受控使用并在 state 暴露依赖；升级必须复核，核心更新使用冷重启。旧独立服务迁移经验见历史摘要，不能作为新版本升级计划重复执行。

## 安装与恢复

六包通过统一 profile 计划成组安装，shield 放在 panel 前；配置位于 `guide-shield/cordis.patch.yml`，默认 `enabled:true`、`inject:true`。若旧 panel 有自定义 shield override，应先核对并迁移到独立服务，不能让两个配置所有者同时生效。

启动后检查 `/guide/api/state` 的 `settlementShield.mode=active`、`inject=true`。缺服务时 panel 报 off／host-service-unavailable。回退必须配套源码版本与 profile，单独卸载 shield 会有意解除防护。旧固定日期迁移脚本已提炼到 [恢复经验](../docs/HISTORY-AND-MAINTENANCE-NOTES.md) 后删除，原始本机备份保留。

## 验证与边界

从工作区运行 `node guide-panel/scripts/lifecycle-smoke.mjs`。使用工作区内独立 profile、panel 复制件、两个真实 Host 进程和进程内确定性模型，不访问真实 desktop profile、不调用外部模型。

真实 closing、父重建、Host 重启后已有/新建指导、真实 HMR apply 门控、持久化 observation 和普通工作阳性对照见 [验收报告](../evidence/O2-R6-2026-11-02/report.md)。panel HMR 连续防护不包括本服务自身卸载/HMR、整个 subagent/sessions 服务替换、硬崩溃的数据耐久性或未知宿主版本；后者仍属 O11/O21。

# Guide settlement shield

独立 Host bundle `@local/dsh-guide-shield`，支持 DSH 0.2.1-rc.3 / Cordis 4.0.5。O2/R6 实现、验收与实际 desktop 部署已关闭，最终判定见 [收尾结论](../docs/O2-R6-CLOSEOUT.md)。panel 的 provider/API/O6 生命周期与结算防护分开：重载或禁用 panel 不卸载此服务，已有指导结算仍受保护。服务自身卸载会失活并释放它持有的包装；第三方保留的旧 wrapper 直通原方法。

`index.js` 静态导入宿主官方 descriptor fold；`core.js` 持有事件监听、父对象包装和释放；`identity.js` 只读子会话自身 first-wins descriptor。`guide-panel/identity.js` 与 `shield.js` 是兼容导出，goal adapter 继续保留独立 reader，但使用同一 first-wins 语义。

子 agent 在 Runtime 通知父会话之前已被释放。释放时对确认的指导保留一次性结算凭据，按**精确父对象**分组，投递时消费；新同 ID 生命周期、父释放或服务卸载会清理。每父最多 128 条、10 分钟惰性过期，仅保存 ID/时间，不持有整个 Session。该界限覆盖当前 Runtime 的 teardown 后立即通知契约；不承诺任意延迟或重复伪造通知。

## 安装与迁移

2026-11-03 已按本说明完成实际 desktop 迁移并启动确认，见 [迁移报告](../evidence/O2-R6-desktop-migration-2026-11-03/report.md)。以下为迁移步骤：关闭 Host 后，在其 profile 的 dependencies 中登记本包，并在 bundles 中放到 panel 前；为 profile/node_modules/@local/dsh-guide-shield 建立指向本目录的 junction，方式与现有自有包一致。保留 panel、preset、goal/sidebar adapter 和其他依赖。

```json
{
  "dependencies": {
    "@local/dsh-guide-shield": "link:D:/files/Project/指导模式/guide-shield"
  },
  "dsh": { "profile": { "bundles": ["@local/dsh-guide-shield"] } }
}
```

这是**合并片段，不是替换整个 manifest**。新服务的配置位于 `guide-shield/cordis.patch.yml`：`enabled:true`、`inject:true`。如旧 panel 有自定义 `shield.enabled` / `shield.inject`，把值迁到新服务 config；panel 不再拥有该配置。恢复前核对 profile 原有成对 goal driver/adapter 选择。

启动后检查 `/guide/api/state` 的 `settlementShield.mode=active`、`inject=true`。缺服务时 panel 报 `off / host-service-unavailable`，不会声称受保护。完整回退应使用迁移前 profile 与迁移前 panel 版本；仅卸载新服务会有意解除防护。

## 验证与边界

从工作区运行 `node guide-panel/scripts/lifecycle-smoke.mjs`。使用工作区内独立 profile、panel 复制件、两个真实 Host 进程和进程内确定性模型，不访问真实 desktop profile、不调用外部模型。

真实 closing、父重建、Host 重启后已有/新建指导、真实 HMR apply 门控、持久化 observation 和普通工作阳性对照见 [验收报告](../evidence/O2-R6-2026-11-02/report.md)。panel HMR 连续防护不包括本服务自身卸载/HMR、整个 subagent/sessions 服务替换、硬崩溃的数据耐久性或未知宿主版本；后者仍属 O11/O21。

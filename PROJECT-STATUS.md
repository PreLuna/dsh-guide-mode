# 项目状态与待办

更新：2026-11-05（Asia/Shanghai）。本文件是**当前事实与待办的唯一出处**：交付状态、已定决定、真正剩余的工作。已接受边界与暂缓事项见 [已定边界](docs/DECISIONS.md)，实现机制见 [架构](docs/ARCHITECTURE.md)，历史经验见 [历史经验](docs/HISTORY-AND-MAINTENANCE-NOTES.md)。

支持基线：DSH `0.2.1-rc.3`（build `be72761ee1a6736ebcdf4f3739363b083ae53c98`）、Cordis `4.0.5`、官方 better-sidebar `0.28.2`。未知 adapter 构建回退原行为，不承诺任意版本免维护。

## 1. 当前交付

两阶段核心改造、实际安装、成对回退均已完成。完整平台回归仍有明确边界，不能据此称所有历史问题都已解决。

| 交付 | 状态 | 当前实现 / 证据 |
|---|---|---|
| 第一阶段 goal 局部注入 | 完成 | 独立 adapter 导入原 apply/join，可信直属指导不阻挡续轮，普通工作仍等待；[报告](evidence/LI-stage1-2026-11-02/report.md) |
| 第二阶段 sidebar 去 fork | 完成 | 官方 0.28.2 + 独立局部 sessions 视图，原任务组件、计数、auto-open、底部专区；[报告](evidence/LI-stage2-2026-11-02/report.md) |
| 实际 desktop 切换/恢复 | 通过 | 两个 adapter 已选择，原 driver 成对禁用，sidebar 原 Host 保留；[挂载](evidence/LI-stage2-2026-11-02/desktop-mount-result.json) / [sidebar 恢复](evidence/LI-stage2-2026-11-02/desktop-restore-result.json) |
| 安装内容审计 | 通过 | 477 个官方文件零差异，其他 registry 依赖图未变；[审计](evidence/LI-stage2-2026-11-02/delivery-audit.json) |
| 上游源码副本维护 | 已退出 | 运行/构建不依赖 fork 或研究 sources；旧 fork 冻结为历史 |
| O6/O8 实现设计 | B′ 审计整改及基线验收完成 | BP-1～3 已修复；34 组真实 Runtime、86 项 Host、11 项浏览器通过；[修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O2/R6 生命周期 | 支持基线内已关闭 | 真实 closing/HMR 门控/父重建/两进程恢复与 desktop 迁移证据闭环 |
| O19/O7/R1 生产实现 | 支持基线及核心冷更新边界内关闭 | 43 项生产 Host 断言、44 项核心检查及 O2/R6 回归；实际 desktop C/R/M=8/2/4；[生产实施](evidence/O19-production-2026-11-03/report.md) |
| O12 / O20 / O21 | 1.1.0 实现与实际 desktop 冷部署完成 | 旧页签精准清理、Host 核实身份的自动归档、完整必需契约与只读/unsupported 状态；[证据](evidence/O12-O21-engineering-2026-11-03/report.md) |
| R4 / R7 / R8 / R9 / O10 | 本机工程基线完成 | 本地 Git、最小 CI、生成物检查/加载、guide skill 降级、locale 清理、六包统一装卸恢复 |
| guide-manager Phase 2 | 本机 desktop 安装与隔离 Host 实测完成 | 官方 Plugins 页「指导」tab；六组件、依赖边、宿主 BOM/产物、`guide` skill；切换前兼容门禁（契约/产物/依赖硬阻断，版本/未知警告）；panel/sidebar 热切换；admission/shield/goal pending 冷切换；[README](guide-manager/README.md) |
| O11 / PT-6 | 暂缓，保留当前设计 | 原生结果卡与测试保留；默认沙箱 failed、无沙箱对照 45/45 passed，不改写为整体通过；[报告](evidence/O11-validation-2026-11-04/pt6/report.md) |
| O11 / RM-3/5/7 | 按宿主默认机制收口 | 接受 persona／压缩／重试与上下文复制成本；[验收取舍](docs/DECISIONS.md) |
| O11 / 多 pane、Git 与归档补测 | 主流程通过，边界已接受或划出范围 | 同 child 重复视图残留接受现状；原生编辑关闭保护不列为插件任务；[范围](docs/DECISIONS.md) / [报告](evidence/O11-residual-check-2026-11-04/report.md) |
| R5 有界扩展观察 | 约 124 秒未复现，不代表长期修复 | 五页、六次刷新、六次重挂；660 次请求全部 200，关闭其他页面后 TCP 回落 |
| 文档收口 | 2026-11-04 完成 | 12 篇合并为 7 篇，每类事实单一出处 |

2026-11-03 desktop 状态：六个 `@local` link/bundle 已登记，准入 active、C/R/M=8/2/4，shield active/`inject=true`，O6 为 idle/no-target-tools（12 条注册与包装记录）。O6 的 idle 说明代码已加载，不表示本轮执行过用户真实模型的 list/control。`guide-manager` 1.1.0（Phase 2）已登记到该 profile，并在隔离 Host 完成 panel 热切换、admission pending、goal 成对 patch 和产物门禁实测。

## 2. 已定决定

"决定已定"与"功能已实现"分别记录；已定但未实现的项目仍进入待办，不再重复询问方向。

| ID | 决定 | 落地状态 |
|---|---|---|
| D1 | 指导使用 subagent runtime 子会话 | 已实现 |
| D2 | seed 取父会话最后一个 completed turn 之前的事件 | 已实现，接受当前复制成本 |
| D3 | 使用独立 guide preset，同时支持 seed 和 preset | 已实现 |
| D4 | 保留写工具和执行修改能力 | 已实现，无额外只读 guard |
| D5 | 面板 tab kind 使用 guide-panel，保留原生开始页 | 已实现 |
| D6 | 过滤/专区使用窄注册接口，适配集中在独立兼容层 | 已迁移到 sidebar adapter v1 |
| D7 | 任务 UI 仍按"指导: "前缀识别 | 已实现；调度使用可信 provider，不能复用 UI 判据 |
| D8 | 自动归档压力分为 25% / 50% / 75% | 已实现；调度器整体去留见 O5 |
| D9 | reserve 为硬预留 | 生产已修：C 跟 Host、R 按池、M 按 profile 全局，零预算禁入 |
| D10 | 压力按池原生 used / Host capacity，activation 释放后不计 | 已改同源按池快照与峰值保持；idle parked 在 native release 前计入 |
| D11 | C3 峰值保持 holdMs，none 时保留闲置累计 | 已实现，默认 120 秒 |
| D12 | 首次 delivery:caller，后续结算通过 shield 防污染 | 已包 inject/补 unwrap；真实 Host 生命周期见 O2/R6 |
| D13 | 不自动迁移旧 kind:guide 缓存 | 1.1.0 已实现提示条与用户点击精准清理 |
| D14 | 归档停止执行，显示休眠中，可重新打开 | 已实现，接受其他 UI 仍可能可见/可输入 |
| D15 | v1 不专门支持嵌套指导 | 已定，保留默认 depth 限制 |
| D16 | 任务页计数与树/图使用同一过滤结果 | 已实现 |
| D17 | 文档按职责维护，避免重复台账漂移 | 2026-11-04 合并为 7 篇，单一出处 |
| D18 | 分两阶段局部注入，最终去掉 fork 生产依赖 | 已完成 |
| D19 | 接受指导与主 goal 并行执行修改 | 已实现，不另建跨会话文件锁 |
| D20 | 原任务页底部独立滚动区，保留原图/树高度 | 已实现 |
| D21 | O6 默认阻止模型对指导的 `send_message`/`interrupt_agent` | 已实现（execute 前判定）；面板/原生 UI 仍是停止通道 |
| D22 | O6 隐藏指导的整个后代分支 | 已实现；真实 Host 44 项探针通过 |
| D23 | O6 放行指导的孩子向指导回报 | send/interrupt 路径已实现 |
| D24 | O6/O8 不抽独立 identity 包 | 改由独立 Host shield 持有核心，panel 保留兼容入口；goal 保持独立 reader |
| D25 | O8 的 `inject` shield 默认开 | 已迁到 guide-shield 服务 config；关闭仅用于诊断/回滚 |
| D26 | 独立 Host shield 服务覆盖 panel HMR 空窗 | 已实现与隔离验收；2026-11-03 实际 bundle 已安装并启动确认 |
| D27 | O5：自动归档保留能力但默认关闭 | `archive.auto` 默认 false，手动归档不变 |
| D28 | Q7：专区采用本会话 + 根会话混合分组 | 已实现；面板仍按当前 seat |
| D29 | Q4：核心会话行转圈保持现状 | 沿用宿主显示，不调整 UI |
| D30 | 原生组件职责与已接受边界不反复列为强制整改 | 见 [已定边界](docs/DECISIONS.md) |
| D31 | 先维护私有 GitHub 仓库，再决定公开或市场发布 | [PreLuna/dsh-guide-mode](https://github.com/PreLuna/dsh-guide-mode) 为 PRIVATE；无市场发布／正式 tag |

其他已保留方向：模型不可见投影（O6）要做；指导结算 inject 拦截（O8）要做；seed 成本接受（O13）；归档平台可见性接受（O15）；运行中占一个槽、闲置不占的语义接受。

## 3. 未完成事项

O2/R6（含 O8 部署确认）、O6 的 BP-1～BP-3、O19/O7/R1、O12/O20/O21 及本机工程基线均已在支持基线内关闭。完整平台回归与版本兼容不能由单项关闭推定完成；建议顺序不代表授权实现全部项目。

### 3.1 平台回归与版本边界

核心验收已通过。剩余覆盖缺口包括：原生各 Stop 入口的集成、第三方后续包装、服务整体重建、所有加载顺序/导入失败/不兼容组合。真实模型长压／故障与长时资源验证为可选非阻塞项。自动归档 low 600 秒档未做完整计时实测（high/mid/C3 有历史实测、三档有短延迟补测）。

O2/R6 已覆盖真实 scoped closing 与 panel HMR；整个 Host graceful shutdown 的任意服务关闭顺序、shield 服务整体重建及硬崩溃耐久性继续在此归口，不作为 O2/R6 残留重复追踪。准入核心与 shield 核心采用冷更新，连续 HMR 执法不在已接受支持边界内。

这是覆盖范围，不表示上述功能均存在缺陷。优先补真实使用中出现的具体问题；版本升级后必须按 [维护手册](docs/MAINTENANCE.md) 的第 4 节重新审查私有边界与指纹。

已执行的补测（证据在各日期目录）：

- 2026-11-03 P0 多 pane：MP-1～MP-7 `passed`，36 项断言，0 条浏览器 console error；[报告](evidence/O11-validation-2026-11-03/report.md)。
- 2026-11-03 P0 Git/文件编辑：GF-1～GF-6 功能断言 6/6 通过，整体 `known-diagnostic`；[报告](evidence/O11-validation-2026-11-03/p0-git-file-edit/report.md)。
- 2026-11-03 P2 真实模型小样：1 次普通对话 + 6 轮 goal + 3 指导并行；RM-1/2/4/6 `passed`，RM-3/5/7 `blocked`，实际 22.9 秒，未达 30 分钟/200k 预算；[报告](evidence/O11-validation-2026-11-03/p0-real-model-soak/report.md)。不能写成"长时 soak 通过"。
- 2026-11-04 残留复核：Git 提交 UI 与自动归档短延迟三档通过；同 child 双 pane 归档只关一个视图，原生编辑器未保存关闭无确认；[报告](evidence/O11-residual-check-2026-11-04/report.md)。
- 2026-11-04 PT-6：修正测试后 PT-1～PT-5 passed、PT-6 failed（Windows 沙箱／PTY 启动）；无沙箱对照 45/45 passed；[报告](evidence/O11-validation-2026-11-04/pt6/report.md)。用户决定暂缓。

### 3.2 R5：浏览器同源 SSE 排队

历史 M3/M4 的同源 HTTP/1.1 SSE 排队保留为历史事实。初次一页／两页／刷新 9 次请求未复现；2026-11-04 扩展为同上下文四页 + 独立上下文一页、六次刷新、六次 adapter 重挂，最终观察 123.797 秒，660 次请求均 HTTP 200、最长 47 ms。当前每页保持 1 SSE + 3 WebSocket，关闭其他页面后 Host TCP 资源从五页 19 降到单页 5。没有修改连接协议；原生多窗口、任意源码 HMR 和长期泄漏不由约两分钟观察担保，真实使用重现时继续定位。

### 3.3 可选事项（非阻塞）

- **O17 名额语义独立复测**：运行占槽、结算释放、闲置不占已有用户实验报告和源码依据；`maxActiveSubagents=1` 的独立脚本复测未补齐。O7/R1 的零预算和容量 1/2/8 已验。
- **RM-7 长时资源趋势**：见 [已定边界](docs/DECISIONS.md) §3。
- **Q7 折叠与批量操作**：仅为可选后续，未形成必须实施的需求。

### 3.4 工程维护与分发

本机自用六个运行组件统一为 1.1.0，另有 `guide-manager` 1.1.0（Phase 2，已登记到 desktop）；具备本地 Git、最小 CI、生成物检查、真实 client 加载测试、卸载与回退流程，见 [维护手册](docs/MAINTENANCE.md)。市场发布、公开仓库、公开许可与作者／命名空间留到稳定或再次检查后决定。需要持续维护的是两个 adapter 的兼容边界，不是重新开启 fork 维护。

## 4. 验证索引

| 验证 | 最新结果 | 证据 |
|---|---|---|
| 原 driver/join + Cordis | 12/12 | [日志](evidence/LI-stage1-2026-11-02/final-tests.log) |
| sidebar 核心 + 实际官方 count/auto-open 消费函数 | 5/5 | [日志](evidence/LI-stage2-2026-11-02/final-tests.log) |
| 真实隔离 Host goal 循环 | 11 项断言通过 | [runtime-result](evidence/LI-stage2-2026-11-02/runtime-result.json) |
| 官方 sidebar 浏览器（阶段二） | 当时 11 项断言通过、consoleErrors=0 | [browser-result](evidence/LI-stage2-2026-11-02/browser-result.json) / [截图](evidence/LI-stage2-2026-11-02/tasks.png) |
| 1.1.0 本机交付 | 16 个 Node 检查进程、90 项真实 Host、11+2 项浏览器及 O2/R6 两进程回归通过 | [实施记录](evidence/O12-O21-engineering-2026-11-03/report.md) / [最终复核](evidence/O12-O21-engineering-2026-11-03/verification.json) |
| panel 路由/渲染/调度 | 通过 | [测试目录](guide-panel/test/) |
| O8 真实隔离 Host（T4.1a） | 通过：async apply、真实 inject、普通消息、unwrap、重启用 | [T4.1 报告](evidence/O6-O8-2026-11-02/report.md) |
| O6 B′ + T4.1 真实 Host | **44 项断言通过，errors=[]；`modelProjection=active`；native tool-call + 实际 PTC `run_code`** | [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) |
| B′ 审计整改 + 扩展验收 | **34 组 Runtime、86 项 Host、11 项浏览器通过；errors/consoleErrors 均为 0** | [修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O2/R6 生命周期与部署 | prepare 122 次（O2 32）、restart 98 次（O2 8），errors=[]；desktop shield active/inject=true | [只读关闭复核](evidence/O2-R6-desktop-migration-2026-11-03/closeout-audit.json) |
| O19/O7/R1 生产实现与部署 | 43 项生产 Host 断言、44 项核心检查；desktop C/R/M=8/2/4、准入 active | [实施记录](evidence/O19-production-2026-11-03/report.md) |
| O6 注册观察层探针 | 2/2：caller/scope、来源 runtime、disposer、失败回滚、fiber bootstrap | [registration-results.json](evidence/O6-enforcement-boundary-2026-11-02/registration-results.json) |
| O6 send/interrupt 拦截 | 单测 + 真实 Host 直接工具/native/PTC 全部通过 | [测试](guide-panel/test/model-projection.test.mjs) |

真实 goal 循环已覆盖普通工作等待、指导跨轮并行、round-limit、冷恢复、pause 取消、普通消息不 re-arm、revision 和卸载取消。浏览器已覆盖图/树、多指导、计数、归档/恢复、auto-open、文件列表、Git/sidechat 组件渲染、适配器卸载重启与刷新。

## 5. 结果分级

每个补测项输出到新目录 `evidence/O11-validation-<YYYY-MM-DD>/`，`result.json` 至少含 `status`、`scenario`、`sourceVersions`、`startedAt`、`finishedAt`、`assertions[]`、`errors[]`、`knownDiagnostics[]`、`evidence[]`。

- `passed`：断言全部通过。
- `known-diagnostic`：出现已登记诊断（如 reload 期间 sidebar WebSocket 提前关闭），功能断言仍通过并保留日志。
- `failed`：功能断言失败，必须记录复现步骤和最小现场。
- `blocked`：环境/凭据/夹具不具备，不能记为通过。

不承诺：任意 DSH 版本、任意第三方包装、所有加载顺序、硬崩溃耐久性、嵌套指导、跨会话文件锁。可重建的测试夹具不入库；多 pane/Git/PTY/真实模型不进 `npm test` 默认集合。

## 6. 历史事项收口

| 原编号 | 现在如何处理 |
|---|---|
| O1 / M2 | 标准主会话能独立回复的受控证据继续保留；会话行转圈是独立视觉取舍 Q4 |
| O3 / M4 / O18 | 修复前等待现象保留作对照；O18 在支持基线上已修复 |
| O4 | 编号歧义不再列为产品阻塞；M5-A/B/C 保留历史别名，以具体待办 ID 追踪 |
| O9 | 旧 fork PR 从当前维护路径搁置，上游公共接口贡献可另开事项 |
| O12 / O20 / O21 / R4 / R7 / R8 / R9 / O10 | 1.1.0 本机实现、验证和冷部署完成 |
| O5 | 自动归档保留能力，默认关闭；`archive.auto: true` 才启动客户端调度 |
| O11 重复视图归档清理 | 正常归档流程通过；同 child 强制双 pane 留一个视图接受现状 |
| 原生 Git／编辑器业务 | 原生组件职责，不列为指导插件任务；自有集成回归仍负责 |
| Q4 | 沿用宿主转圈显示，维持现状 |
| Q7 | 专区改为混合分组；面板仍按当前 seat |
| O19 / O7 / R1 | 43 项断言、44 项核心检查、O2/R6 回归及 desktop 冷部署完成；核心采用冷更新 |
| O2 / R6（含 O8 部署确认） | 实现、隔离矩阵及实际 desktop 迁移闭环 |
| O6 / O8 | BP-1～3 修复与 34 组 Runtime、86 项 Host、11 项浏览器验收完成 |
| O13 / O14 / O15 | seed 成本接受 / v1 不做嵌套 / 归档可见性接受，不再反复待定 |
| R2 / R3 | 官方安装产物已核验；旧 fork 全量测试不再是当前交付门槛 |
| O16 | 文档已按职责合并为 7 篇，历史快照保留 |

# 当前交付与决策台账

更新：2026-11-03（Asia/Shanghai）。本文件只记录当前事实、已定决定和证据；所有未完成事项以 [OPEN-ITEMS.md](OPEN-ITEMS.md) 为唯一清单。原长台账已完整保存到 [整理前快照](docs/archive/2026-11-02/before-cleanup/PROJECT-STATUS.md)，旧实验报告中的章节编号对应该快照。

## 当前交付

两阶段的核心改造、实际安装、成对回退均已完成。完整平台回归仍有明确边界，不能据此称所有历史问题均已解决。

| 交付 | 状态 | 当前实现 / 证据 |
|---|---|---|
| 第一阶段 goal 局部注入 | 完成 | 独立 adapter 导入原 apply/join，可信直属指导不阻挡续轮，普通工作仍等待；[报告](evidence/LI-stage1-2026-11-02/report.md) |
| 第二阶段 sidebar 去 fork | 完成 | 官方 0.28.2 + 独立局部 sessions 视图，原任务组件、计数、auto-open、底部专区；[报告](evidence/LI-stage2-2026-11-02/report.md) |
| 实际 desktop 切换/恢复 | 通过 | 两个 adapter 已选择，原 driver 成对禁用，sidebar 原 Host 保留；[挂载](evidence/LI-stage2-2026-11-02/desktop-mount-result.json) / [sidebar 恢复](evidence/LI-stage2-2026-11-02/desktop-restore-result.json) / [goal 恢复](evidence/LI-stage1-2026-11-02/desktop-restore-result.json) |
| 安装内容审计 | 通过 | 477 个官方文件零差异，其他 registry 依赖图未变；[审计](evidence/LI-stage2-2026-11-02/delivery-audit.json) |
| 上游源码副本维护 | 已退出 | 运行/构建不依赖 fork 或研究 sources；旧 fork 冻结为历史 |
| O6/O8 实现设计 | B′ 审计整改及基线验收完成 | BP-1～3 已修复；34 组真实 Runtime、86 项 Host、11 项浏览器通过；O8 后续生命周期已由 O2/R6 独立验收；[修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O2/R6 生命周期 | 已关闭：支持基线内实现、矩阵和本机部署均完成 | [收尾结论](docs/O2-R6-CLOSEOUT.md)；真实 closing/HMR 门控/父重建/两进程恢复与 desktop 迁移证据已闭环 |
| O19/O7/R1 生产实现 | 支持基线及核心冷更新边界内关闭；生产部署和正常 desktop 运行确认完成 | [生产实施](evidence/O19-production-2026-11-03/report.md)：43 项生产 Host 断言、44 项核心检查及 O2/R6 回归通过；实际 profile/API/UI 核对 C/R/M=8/2/4 |
| O12 / O20 / O21 | 1.1.0 实现与实际 desktop 冷部署完成 | 旧页签精准清理、Host 核实身份的自动归档、完整必需契约与只读/unsupported 状态；[证据](evidence/O12-O21-engineering-2026-11-03/report.md) |
| R4 / R7 / R8 / R9 / O10 | 本机工程基线完成 | 本地 Git、最小 CI、生成物检查/加载、guide skill 降级、locale 清理、六包统一安装/卸载/恢复；无远端发布 |
| 文档收口 | 本轮完成 | 当前事实、待办、工程约束与历史材料分开；[整理记录](docs/WORKSPACE-CLEANUP.md) |

支持基线：DSH `0.2.1-rc.3`，构建 `be72761ee1a6736ebcdf4f3739363b083ae53c98`，Cordis `4.0.5`，官方 better-sidebar `0.28.2`。关键产物与函数指纹见阶段报告；未知 adapter 构建回退原行为，不承诺任意版本均免维护；O6 工具来源有 5 个源码哈希预检，1.1.0 新增 panel/shield 的来源及必需服务契约预检，升级重验流程见 [本机维护](docs/LOCAL-MAINTENANCE.md)。

## 已定决定

“决定已定”与“功能已实现”分别记录；已定但未实现的项目仍进入待办，不再重复询问方向。

| ID | 决定 | 落地状态 |
|---|---|---|
| D1 | 指导使用 subagent runtime 子会话 | 已实现 |
| D2 | seed 取父会话最后一个 completed turn 之前的事件 | 已实现，接受当前复制成本 |
| D3 | 使用独立 guide preset，同时支持 seed 和 preset | 已实现 |
| D4 | 保留写工具和执行修改能力 | 已实现，无额外只读 guard |
| D5 | 面板 tab kind 使用 guide-panel，保留原生开始页 | 已实现 |
| D6 | 过滤/专区使用窄注册接口，适配集中在独立兼容层 | 已迁移到 sidebar adapter v1 |
| D7 | 任务 UI 仍按“指导: ”前缀识别 | 已实现；调度使用可信 provider，不能复用 UI 判据 |
| D8 | 自动归档压力分为 25% / 50% / 75% | 已实现；调度器整体去留仍见 O5 |
| D9 | reserve 为硬预留 | 生产代码已修：C 跟 Host、R 按池、M 按 profile 全局，零预算禁入；隔离生产验收及实际 desktop 冷部署通过 |
| D10 | 压力按池原生 used / Host capacity，activation 释放后不计 | 生产 client 已改同源按池快照与峰值保持；idle parked 在 native release 前计入；实际 desktop 已切换 |
| D11 | C3 峰值保持 holdMs，none 时保留闲置累计 | 已实现，默认 120 秒 |
| D12 | 首次 delivery:caller，后续结算通过 shield 防污染 | T1 已包 inject/补 unwrap；真实 Host 生命周期见 T4.1/O2/R6 |
| D13 | 不自动迁移旧 kind:guide 缓存 | 1.1.0 已实现提示条与用户点击精准清理；保留原生开始页及其他 tab |
| D14 | 归档停止执行，显示休眠中，可重新打开 | 已实现，接受其他 UI 仍可能可见/可输入 |
| D15 | v1 不专门支持嵌套指导 | 已定，保留默认 depth 限制 |
| D16 | 任务页计数与树/图使用同一过滤结果 | 已实现 |
| D17 | 文档按职责维护，避免重复台账漂移 | 本轮重新整理，见 README 导航 |
| D18 | 分两阶段局部注入，最终去掉 fork 生产依赖 | 已完成 |
| D19 | 接受指导与主 goal 并行执行修改 | 已实现，不另建跨会话文件锁 |
| D20 | 原任务页底部独立滚动区，保留原图/树高度 | 用户已接受，已实现 |
| D21 | O6 默认阻止模型对指导的 `send_message`/`interrupt_agent` | 已实现（T3.1/T3.2，B′ execute 前判定）；面板/原生 UI 仍是停止通道 |
| D22 | O6 隐藏指导的整个后代分支 | 已实现（T2.2）；真实 Host 44 项探针通过 |
| D23 | O6 放行指导的孩子向指导回报 | send 路径已实现（T3.1）；interrupt 语义已实现（T3.2）；普通 continuable 回报路径 |
| D24 | O6/O8 当时不抽独立 identity 包 | O2/R6 经用户确认改由独立 Host shield 持有核心，panel 保留兼容入口；goal 保持独立 reader，语义统一 first-wins |
| D25 | O8 的 `inject` shield 默认开 | 已迁到 guide-shield 服务 config；真实 closing 分支通过，关闭仅用于诊断/回滚 |
| D26 | 独立 Host shield 服务覆盖 panel HMR 空窗 | 用户在 O2/R6 执行中明确选择；已实现与隔离验收；2026-11-03 实际 bundle 已安装并启动确认 |

旧 OPEN-ITEMS 记录的其他已确认方向也已保留：模型不可见投影（O6）要做；指导结算 inject 拦截（O8）要做；seed 成本接受（O13）；归档平台可见性接受（O15）；运行中占一个槽、闲置不占的语义接受。D21–D25 是 2026-11-02 确认的 O6/O8 取舍，落地细节见 [O6/O8 设计](docs/O6-O8-DESIGN.md) §8；O6 的 BP-1～3 已闭环并通过扩展验收，O8/O2/R6 基线生命周期已验收，实际 desktop 新服务 bundle 已于 2026-11-03 安装并启动确认。

## 验证索引与边界

| 验证 | 最新结果 | 证据 |
|---|---|---|
| 原 driver/join + Cordis | 12/12 | [日志](evidence/LI-stage1-2026-11-02/final-tests.log) |
| sidebar 核心 + 实际官方 count/auto-open 消费函数 | 5/5 | [日志](evidence/LI-stage2-2026-11-02/final-tests.log) |
| 真实隔离 Host goal 循环 | 11 项断言通过 | [runtime-result](evidence/LI-stage2-2026-11-02/runtime-result.json) |
| 官方 sidebar 浏览器（阶段二） | 当时 11 项断言通过、consoleErrors=0；1.1.0 的新回归见下行 | [browser-result](evidence/LI-stage2-2026-11-02/browser-result.json) / [截图](evidence/LI-stage2-2026-11-02/tasks.png) |
| 1.1.0 本机交付 | 16 个 Node 检查进程、90 项真实 Host、11+2 项浏览器及 O2/R6 两进程回归通过；含预期 503 和 reload WebSocket 诊断 | [实施记录](evidence/O12-O21-engineering-2026-11-03/report.md) / [最终复核](evidence/O12-O21-engineering-2026-11-03/verification.json) |
| panel 路由/渲染/调度 | 通过 | [测试目录](guide-panel/test/)；阶段报告记录 |
| O8 真实隔离 Host（T4.1a） | 通过：async apply、真实 inject、普通消息、unwrap、重启用 | [T4.1 O8 报告](evidence/O6-O8-2026-11-02/report.md) / [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) |
| O6 B′ + T4.1 真实 Host | **44 项断言通过，errors=[]；`modelProjection=active`；native tool-call + 实际 PTC `run_code`** | [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) / [T4.1 报告](evidence/O6-O8-2026-11-02/report.md) |
| B′ 审计整改 + 扩展验收 | **34 组 Runtime、86 项 Host、11 项浏览器通过；最终 Host errors/浏览器 consoleErrors 均为 0** | [最新修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O2/R6 生命周期与部署 | prepare 122 次（O2 32）、restart 98 次（O2 8），errors=[]；desktop shield active/inject=true，组件运行中 | [收尾结论](docs/O2-R6-CLOSEOUT.md) / [只读关闭复核](evidence/O2-R6-desktop-migration-2026-11-03/closeout-audit.json) |
| O19/O7/R1 生产实现与部署 | 43 项生产 Host 断言、44 项核心检查；O2/R6 两进程及真实 Runtime/浏览器回归通过；desktop C/R/M=8/2/4、准入 active；核心采用冷更新 | [实施记录](evidence/O19-production-2026-11-03/report.md) / [最终复核](evidence/O19-production-2026-11-03/verification.json) |
| O6 注册观察层探针 | 2/2：caller/scope、来源 runtime、disposer、失败回滚、fiber bootstrap | [probe-registration.mjs](evidence/O6-enforcement-boundary-2026-11-02/probe-registration.mjs) / [registration-results.json](evidence/O6-enforcement-boundary-2026-11-02/registration-results.json) |
| O6 send/interrupt 拦截（T3.1/T3.2） | 单测 + 真实 Host 直接工具/native/PTC 全部通过 | [测试](guide-panel/test/model-projection.test.mjs) / [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) |

真实 goal 循环已覆盖普通工作等待、指导跨轮并行、round-limit、冷恢复、pause 取消、普通消息不 re-arm、revision 和卸载取消。浏览器已覆盖图/树、多指导、计数、归档/恢复、auto-open、文件列表、Git/sidechat 组件渲染、适配器卸载重启与刷新。

未测试真实模型长时使用、真实 PTY 交互、Git 提交/完整编辑、多 pane 组合及所有版本/故障顺序。T4.1 已覆盖 O8 面板禁用/重启用以及 O6 重启用后的重新包装，当时未覆盖的 runtime closing、父重建、Host 重启和 panel HMR 现已由 [O2/R6 独立矩阵](evidence/O2-R6-2026-11-02/report.md) 验收；两类证据不可混算。

## 历史事项收口

| 原编号 | 现在如何处理 |
|---|---|
| O1 / M2 | 标准主会话能独立回复的受控证据继续保留；会话行转圈是独立视觉取舍 Q4 |
| O3 / M4 / O18 | 修复前等待现象保留作对照；O18 在支持基线上已修复 |
| O4 | 编号歧义不再列为产品阻塞；M5-A/B/C 保留历史别名，以 LI-0…5 和具体待办 ID 追踪后续 |
| O9 | 旧 fork PR 从当前维护路径搁置，上游公共接口贡献可另开事项 |
| O13 / O14 / O15 | seed 复制成本接受 / v1 不做嵌套 / 归档可见性接受，均不再反复待定 |
| R2 / R3 | 官方安装产物已核验；旧 fork 全量测试不再是当前交付门槛 |
| O16 | 此次重写当前文档、保存历史快照；以职责分工降低再次漂移 |

历史 M2/M3/M4/M5-A 报告与原始证据仍在 evidence，见 [证据索引](evidence/README.md)。它们的有效结论继续保留；当时的“未回填”“当前安装”“旧 driver 不等待”等时态或早期猜测只按历史背景阅读。

## 下一步范围

O6 的 B′ 审计整改和 T4.1/T4.3 已在支持基线内闭合。O2/R6 与 O19/O7/R1 均已完成支持基线内实现、验收和实际 desktop 部署；准入核心采用冷更新。O12/O20/O21 与本机工程基线已随 1.1.0 完成；后续为 O11 的真实模型长时平台回归；本轮 desktop 准入 active，C/R/M=8/2/4，shield active/inject=true，O6 idle/no-target-tools 且持有 12 条包装记录。R5 本轮当前插件组合未复现，重现时再推进；本机工程基线不等于完成公开发布。产品取舍、可选回归和发布工作独立列在 [OPEN-ITEMS.md](OPEN-ITEMS.md)。

## B′ 最新审计结论

原 [审计](evidence/B-prime-audit-2026-11-02/report.md) 的 BP-1～3 均已修复，扩展回归通过，见 [整改验收](evidence/B-prime-fixes-2026-11-02/report.md)。生命周期按精确注册层管理，caller 取消优先于卸载委托，有事件的未知 execute 替换明确 partial。实际 desktop 进程加载状态已于 2026-11-03 核对；O21 已在 1.1.0 落实，O11 扩展事项仍保留。原审计的 18 项回收回执继续有效，本轮没有继续删除文件。

## 2026-11-03 desktop 迁移确认

新增独立 shield 的 link/bundle，放到 panel 之前；仅增补两份锁文件的 shield importer。无旧 panel shield override，沿用 enabled/inject=true。原 goal/sidebar 选择、其他 profile 文件与 registry 图不变。真实 desktop Host 冷启动检查通过，正常桌面 UI 的 guide-settlement-shield 显示运行中。既有 M3 指导按官方自身 descriptor 识别，父/指导日志哈希不变；未创建会话、发消息或调用模型。O6 为 idle/no-target-tools（12 条注册与包装记录），不宣称真实模型功能已回归。备份和证据见 [迁移报告](evidence/O2-R6-desktop-migration-2026-11-03/report.md)。

## O2/R6 关闭判定（2026-11-03）

该次逐项核对原完成标准、原始矩阵结果、源码/测试入口哈希及实际 profile 安装状态，结论为**支持基线内已关闭，无 O2/R6 剩余待办**。当时源码与备份哈希保留为历史证据；后续 1.1.0 已修改生产代码和 profile，并重新通过 O2/R6 两进程回归，最新哈希与部署见 [本轮复核](evidence/O12-O21-engineering-2026-11-03/verification.json)。服务自身核心 HMR、整图 graceful shutdown 顺序、真实模型长时仍按 O11 跟踪；未知版本按已落实的契约拒绝/降级并在升级时重验。原完成标准映射以 [O2/R6 收尾结论](docs/O2-R6-CLOSEOUT.md) 为准。

# 当前交付与决策台账

更新：2026-11-04（Asia/Shanghai）。本文件只记录当前事实、已定决定和证据；所有未完成事项以 [OPEN-ITEMS.md](OPEN-ITEMS.md) 为唯一清单。旧方案、重复台账和收尾原文已提炼为 [历史设计摘要](docs/HISTORY-AND-MAINTENANCE-NOTES.md) 后删除；原始 evidence 和恢复依赖留在本机。

## 当前交付

两阶段的核心改造、实际安装、成对回退均已完成。完整平台回归仍有明确边界，不能据此称所有历史问题均已解决。

| 交付 | 状态 | 当前实现 / 证据 |
|---|---|---|
| 第一阶段 goal 局部注入 | 完成 | 独立 adapter 导入原 apply/join，可信直属指导不阻挡续轮，普通工作仍等待；[报告](evidence/LI-stage1-2026-11-02/report.md) |
| 第二阶段 sidebar 去 fork | 完成 | 官方 0.28.2 + 独立局部 sessions 视图，原任务组件、计数、auto-open、底部专区；[报告](evidence/LI-stage2-2026-11-02/report.md) |
| 实际 desktop 切换/恢复 | 通过 | 两个 adapter 已选择，原 driver 成对禁用，sidebar 原 Host 保留；[挂载](evidence/LI-stage2-2026-11-02/desktop-mount-result.json) / [sidebar 恢复](evidence/LI-stage2-2026-11-02/desktop-restore-result.json) / [goal 恢复](evidence/LI-stage1-2026-11-02/desktop-restore-result.json) |
| 安装内容审计 | 通过 | 477 个官方文件零差异，其他 registry 依赖图未变；[审计](evidence/LI-stage2-2026-11-02/delivery-audit.json) |
| 上游源码副本维护 | 已退出 | 运行/构建不依赖 fork 或研究 sources；旧 fork 冻结为历史 |
| O6/O8 实现设计 | B′ 审计整改及基线验收完成 | BP-1～3 已修复；34 组真实 Runtime、86 项 Host、11 项浏览器通过；[修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O2/R6 生命周期 | 支持基线内已关闭 | 真实 closing/HMR 门控/父重建/两进程恢复与 desktop 迁移证据闭环；[收尾结论](docs/HISTORY-AND-MAINTENANCE-NOTES.md) |
| O19/O7/R1 生产实现 | 支持基线及核心冷更新边界内关闭 | 43 项生产 Host 断言、44 项核心检查及 O2/R6 回归通过；实际 profile/API/UI 核对 C/R/M=8/2/4；[生产实施](evidence/O19-production-2026-11-03/report.md) |
| O12 / O20 / O21 | 1.1.0 实现与实际 desktop 冷部署完成 | 旧页签精准清理、Host 核实身份的自动归档、完整必需契约与只读/unsupported 状态；[证据](evidence/O12-O21-engineering-2026-11-03/report.md) |
| R4 / R7 / R8 / R9 / O10 | 本机工程基线完成 | 本地 Git、最小 CI、生成物检查/加载、guide skill 降级、locale 清理、六包统一安装/卸载/恢复；当前转为私有仓库维护，无公开发布 |
| O11 / PT-6 | 用户决定暂缓，保留当前设计 | 原生结果卡查看方式与测试保留；历史默认沙箱 failed、无沙箱隔离对照 45/45 passed，不改写为整体通过；[报告](evidence/O11-validation-2026-11-04/pt6/report.md) |
| O11 / RM-3/5/7 | 当前首轮方案按默认机制收口，扩展实测不作门禁 | 接受宿主 persona／压缩／重试与上下文复制成本；长时资源趋势可选补测，历史未实测不改写为 passed；[验收决定](docs/RM-ACCEPTANCE-DECISIONS.md) |
| O11 / 多 pane、Git 与归档补测 | 归档主流程、Git 提交 UI、短延迟归档通过；边界已接受或划出任务范围 | 同 child 重复视图残留接受现状；原生编辑关闭保护不列为指导插件任务；原始 failed 证据保留；[范围决定](docs/SCOPE-AND-ACCEPTED-LIMITS.md) / [报告](evidence/O11-residual-check-2026-11-04/report.md) |
| R5 有界扩展观察 | 约 124 秒未复现，不代表长期修复 | 五页、六次刷新、六次 adapter 重挂；660 次 API 请求全部成功，关闭其他页面后 TCP 资源回落；[报告](evidence/O11-residual-check-2026-11-04/report.md) |
| 文档收口 | 2026-11-03 完成 | 当前事实、待办、工程约束与历史材料分开；旧原文已提炼后删除，见 [历史设计摘要](docs/HISTORY-AND-MAINTENANCE-NOTES.md) |

支持基线：DSH `0.2.1-rc.3`，构建 `be72761ee1a6736ebcdf4f3739363b083ae53c98`，Cordis `4.0.5`，官方 better-sidebar `0.28.2`。关键产物与函数指纹见阶段报告；未知 adapter 构建回退原行为，不承诺任意版本均免维护；O6 工具来源有 5 个源码哈希预检，1.1.0 新增 panel/shield 的来源及必需服务契约预检，升级重验流程见 [本机维护](docs/LOCAL-MAINTENANCE.md)。

2026-11-03 当前 desktop 状态：六个 `@local` link/bundle 已登记，准入 active、C/R/M=8/2/4，shield active/`inject=true`，O6 为 idle/no-target-tools（12 条注册与包装记录）。O6 的 idle 状态说明代码已加载，不表示本轮执行过用户真实模型的 list/control。

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
| D10 | 压力按池原生 used / Host capacity，activation 释放后不计 | 生产 client 已改同源按池快照与峰值保持；idle parked 在 native release 前计入 |
| D11 | C3 峰值保持 holdMs，none 时保留闲置累计 | 已实现，默认 120 秒 |
| D12 | 首次 delivery:caller，后续结算通过 shield 防污染 | 已包 inject/补 unwrap；真实 Host 生命周期见 O2/R6 |
| D13 | 不自动迁移旧 kind:guide 缓存 | 1.1.0 已实现提示条与用户点击精准清理；保留原生开始页及其他 tab |
| D14 | 归档停止执行，显示休眠中，可重新打开 | 已实现，接受其他 UI 仍可能可见/可输入 |
| D15 | v1 不专门支持嵌套指导 | 已定，保留默认 depth 限制 |
| D16 | 任务页计数与树/图使用同一过滤结果 | 已实现 |
| D17 | 文档按职责维护，避免重复台账漂移 | 2026-11-03 再次收口，见文档地图与归档索引 |
| D18 | 分两阶段局部注入，最终去掉 fork 生产依赖 | 已完成 |
| D19 | 接受指导与主 goal 并行执行修改 | 已实现，不另建跨会话文件锁 |
| D20 | 原任务页底部独立滚动区，保留原图/树高度 | 用户已接受，已实现 |
| D21 | O6 默认阻止模型对指导的 `send_message`/`interrupt_agent` | 已实现（execute 前判定）；面板/原生 UI 仍是停止通道 |
| D22 | O6 隐藏指导的整个后代分支 | 已实现；真实 Host 44 项探针通过 |
| D23 | O6 放行指导的孩子向指导回报 | send/interrupt 路径已实现；普通 continuable 回报路径 |
| D24 | O6/O8 当时不抽独立 identity 包 | 改由独立 Host shield 持有核心，panel 保留兼容入口；goal 保持独立 reader，语义统一 first-wins |
| D25 | O8 的 `inject` shield 默认开 | 已迁到 guide-shield 服务 config；真实 closing 分支通过，关闭仅用于诊断/回滚 |
| D26 | 独立 Host shield 服务覆盖 panel HMR 空窗 | 已实现与隔离验收；2026-11-03 实际 bundle 已安装并启动确认 |
| D27 | O5：自动归档保留能力但默认关闭 | 已实现：`archive.auto` 默认 false，显式开启后才启动客户端调度；手动归档不变 |
| D28 | Q7：专区采用本会话 + 根会话混合分组 | 已实现：本会话指导与同一根会话下的其他指导分组显示；面板仍按当前 seat |
| D29 | Q4：核心会话行转圈保持现状 | 沿用宿主显示，不调整 UI；不表示主会话无法回复 |
| D30 | 原生组件职责与已接受边界不反复列为强制整改 | Git／编辑器业务归原生路径；指导归档保留，重复视图清理接受现状；自有集成回归仍负责；[任务边界](docs/SCOPE-AND-ACCEPTED-LIMITS.md) |
| D31 | 先维护私有 GitHub 仓库，再决定公开或市场发布 | [PreLuna/dsh-guide-mode](https://github.com/PreLuna/dsh-guide-mode) 为 PRIVATE；保留私有许可和当前版本，无市场发布／正式 tag；[仓库说明](docs/REPOSITORY-PREPARATION.md) |

旧 OPEN-ITEMS 记录的其他已确认方向也已保留：模型不可见投影（O6）要做；指导结算 inject 拦截（O8）要做；seed 成本接受（O13）；归档平台可见性接受（O15）；运行中占一个槽、闲置不占的语义接受。D21–D25 的取舍细节与实施记录见 [历史设计摘要](docs/HISTORY-AND-MAINTENANCE-NOTES.md)；O6 的 BP-1～3、O8/O2/R6 基线生命周期及实际 desktop 部署均已验收。

## 验证索引

| 验证 | 最新结果 | 证据 |
|---|---|---|
| 原 driver/join + Cordis | 12/12 | [日志](evidence/LI-stage1-2026-11-02/final-tests.log) |
| sidebar 核心 + 实际官方 count/auto-open 消费函数 | 5/5 | [日志](evidence/LI-stage2-2026-11-02/final-tests.log) |
| 真实隔离 Host goal 循环 | 11 项断言通过 | [runtime-result](evidence/LI-stage2-2026-11-02/runtime-result.json) |
| 官方 sidebar 浏览器（阶段二） | 当时 11 项断言通过、consoleErrors=0；1.1.0 的新回归见下行 | [browser-result](evidence/LI-stage2-2026-11-02/browser-result.json) / [截图](evidence/LI-stage2-2026-11-02/tasks.png) |
| 1.1.0 本机交付 | 16 个 Node 检查进程、90 项真实 Host、11+2 项浏览器及 O2/R6 两进程回归通过；含预期 503 和 reload WebSocket 诊断 | [实施记录](evidence/O12-O21-engineering-2026-11-03/report.md) / [最终复核](evidence/O12-O21-engineering-2026-11-03/verification.json) |
| panel 路由/渲染/调度 | 通过 | [测试目录](guide-panel/test/)；阶段报告记录 |
| O8 真实隔离 Host（T4.1a） | 通过：async apply、真实 inject、普通消息、unwrap、重启用 | [T4.1 报告](evidence/O6-O8-2026-11-02/report.md) / [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) |
| O6 B′ + T4.1 真实 Host | **44 项断言通过，errors=[]；`modelProjection=active`；native tool-call + 实际 PTC `run_code`** | [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) / [T4.1 报告](evidence/O6-O8-2026-11-02/report.md) |
| B′ 审计整改 + 扩展验收 | **34 组 Runtime、86 项 Host、11 项浏览器通过；最终 Host errors/浏览器 consoleErrors 均为 0** | [最新修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O2/R6 生命周期与部署 | prepare 122 次（O2 32）、restart 98 次（O2 8），errors=[]；desktop shield active/inject=true，组件运行中 | [收尾结论](docs/HISTORY-AND-MAINTENANCE-NOTES.md) / [只读关闭复核](evidence/O2-R6-desktop-migration-2026-11-03/closeout-audit.json) |
| O19/O7/R1 生产实现与部署 | 43 项生产 Host 断言、44 项核心检查；O2/R6 两进程及真实 Runtime/浏览器回归通过；desktop C/R/M=8/2/4、准入 active；核心采用冷更新 | [实施记录](evidence/O19-production-2026-11-03/report.md) / [最终复核](evidence/O19-production-2026-11-03/verification.json) |
| O6 注册观察层探针 | 2/2：caller/scope、来源 runtime、disposer、失败回滚、fiber bootstrap | [probe-registration.mjs](evidence/O6-enforcement-boundary-2026-11-02/probe-registration.mjs) / [registration-results.json](evidence/O6-enforcement-boundary-2026-11-02/registration-results.json) |
| O6 send/interrupt 拦截 | 单测 + 真实 Host 直接工具/native/PTC 全部通过 | [测试](guide-panel/test/model-projection.test.mjs) / [runtime-result](evidence/LI-stage1-2026-11-02/runtime-result.json) |

真实 goal 循环已覆盖普通工作等待、指导跨轮并行、round-limit、冷恢复、pause 取消、普通消息不 re-arm、revision 和卸载取消。浏览器已覆盖图/树、多指导、计数、归档/恢复、auto-open、文件列表、Git/sidechat 组件渲染、适配器卸载重启与刷新。

Git 提交 UI、多 pane 组合及真实 PTY 已有后续专项证据；双 pane 归档与原生编辑关闭的具体边界见本轮补测报告。真实模型长时与所有版本/故障顺序仍未完整覆盖；PT-6 已暂缓，RM 范围按用户决定收口。O2/R6 已覆盖 runtime closing、父重建、Host 重启和 panel HMR；两类证据不可混算。

## 历史事项收口

| 原编号 | 现在如何处理 |
|---|---|
| O1 / M2 | 标准主会话能独立回复的受控证据继续保留；会话行转圈是独立视觉取舍 Q4 |
| O3 / M4 / O18 | 修复前等待现象保留作对照；O18 在支持基线上已修复 |
| O4 | 编号歧义不再列为产品阻塞；M5-A/B/C 保留历史别名，以 LI-0…5 和具体待办 ID 追踪后续 |
| O9 | 旧 fork PR 从当前维护路径搁置，上游公共接口贡献可另开事项 |
| O13 / O14 / O15 | seed 复制成本接受 / v1 不做嵌套 / 归档可见性接受，均不再反复待定 |
| R2 / R3 | 官方安装产物已核验；旧 fork 全量测试不再是当前交付门槛 |
| O16 | 当前文档按职责重写，历史快照保留；以分工降低再次漂移 |

历史 M2/M3/M4/M5-A 报告与原始证据仍在 evidence，见 [证据索引](evidence/README.md)。它们的有效结论继续保留；当时的“未回填”“当前安装”“旧 driver 不等待”等时态或早期猜测只按历史背景阅读。

## 下一步范围

O6 的 B′ 审计整改和 T4.1/T4.3、O2/R6、O19/O7/R1 均已在支持基线内闭合并完成实际 desktop 部署；O12/O20/O21 与本机工程基线已随 1.1.0 完成。后续为 O11 的真实模型长时平台回归；R5 在实际重现时再推进。本机工程基线不等于完成公开发布；产品取舍、可选回归和发布工作独立列在 [OPEN-ITEMS.md](OPEN-ITEMS.md)。

# 项目状态与待办

更新：2026-11-09（Asia/Shanghai）。本文件是**当前事实与待办的唯一出处**：交付状态、已定决定、真正剩余的工作。已接受边界与暂缓事项见 [已定边界](docs/DECISIONS.md)，实现机制见 [架构](docs/ARCHITECTURE.md)，历史经验见 [历史经验](docs/HISTORY-AND-MAINTENANCE-NOTES.md)。

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
| guide-manager Phase 1–4 | 四阶段整体验收完成（2026-11-05） | 官方 Plugins 页「指导」tab；六组件、依赖边、宿主 BOM/产物、`guide` skill 与 skills manager 深链；兼容门禁；热/冷切换；本地 link reload；冷切换回滚；20 个 Node 进程、manager 30 用例、隔离端到端与 live 三项冒烟通过；[README](guide-manager/README.md) / [验收记录](evidence/O23-four-phase-acceptance-2026-11-05/report.md) |
| Phase 5A 独立管理器安装入口 | 隔离整体验收通过（2026-11-07） | 真实 Edge 与独立 Electron 桌面从 manager-only 安装六组件，生产助手限定实例停机/重启，全部 ready、健康核对通过；修复打包 peer 路径、PowerShell 参数冲突与重启环境；[验收](evidence/phase5-acceptance-2026-11-07/report.md) |
| Phase 5B 独立升级与包版本恢复 | 实现与隔离整体验收通过（2026-11-07） | 可信本地兼容目录、最小联动、稳定包缓存、精确旧锁/配置/tgz 备份、失败修复与显式恢复；真实 Edge/Electron 验证单组件升级、三组件联动与连续恢复（原发布包/旧缓存缺失也恢复）；24 个 Node 进程、manager 60 用例；未切换 live、未发布 npm；[设计](docs/PHASE-5B-PACKAGE-TRANSACTIONS.md) / [证据](evidence/phase5b-2026-11-07/report.md) |
| Phase 5C 卸载、修复与管理器升级 | 实现与隔离功能验收通过（2026-11-07） | 依赖卸载/preset 保护、goal 原生恢复、SHA 原包修复、独立控制器自升级及外部恢复；桌面无法启动时另有外部组件修复；25 个 Node 进程、manager 75 用例、真实 pnpm 4 项、Edge 10 项/桌面 11 项通过（Edge 保留停机诊断）；[设计](docs/PHASE-5C-MAINTENANCE.md) / [证据](evidence/phase5c-2026-11-07/report.md) / [功能测试清单](docs/FUNCTIONAL-TEST-MATRIX.md) |
| Phase 5D-0/5D-1 发布格式与发布端 | 本地实现与验证通过（2026-11-08） | schema 4/连接配置、固定提交七包、历史组合、草稿上传/回读与显式发布工具、tag/manual workflow；26 个 Node 进程、manager 96 用例通过；真实 GitHub 写入与托管 runner 尚未执行；[说明](docs/PHASE-5D-RELEASE-FORMAT.md) / [证据](evidence/phase5d-2026-11-08/report.md) |
| Phase 5D-2 消费端后端 | 本地实现与隔离验证通过（2026-11-09） | 异步查询/准备/取消、SHA 缓存、三类本地目录适配、服务接口与持久状态；27 个测试进程通过，网络为模拟传输，真实 tgz/离线计划验证；[说明](docs/PHASE-5D-CONSUMER-BACKEND.md) / [证据](evidence/phase5d-2026-11-09/report.md) |
| Phase 5D-3 HTTP 接口与管理页 | 本地实现与隔离 Edge 交互通过（2026-11-09） | source 六个 POST 接口、三类操作选择、进度/取消/重试、刷新恢复、计划确认与原助手衔接；28 个测试进程通过，manager 118 用例；HTTP 使用模拟 GitHub、Edge 使用浏览器响应夹具；[说明](docs/PHASE-5D-HTTP-UI.md) / [证据](evidence/phase5d3-2026-11-09/report.md) |
| Phase 5D-4 真实验收 → 5E link 来源迁移 | 真实验收施工中，5E 未开始 | 已推送正式实现、发布基线及独立升级版本；用户已将仓库公开，现按无 token 来源补验。manager 1.1.2 默认公开来源/直链/tag 核验已实现，真实匿名后端验证通过；官方 pnpm、Edge/独立桌面完整链路待本轮完成；live 未迁移；[说明](docs/PHASE-5D-REAL-ACCEPTANCE.md) |
| O11 / PT-6 | 暂缓，保留当前设计 | 原生结果卡与测试保留；默认沙箱 failed、无沙箱对照 45/45 passed，不改写为整体通过；[报告](evidence/O11-validation-2026-11-04/pt6/report.md) |
| O11 / RM-3/5/7 | 按宿主默认机制收口 | 接受 persona／压缩／重试与上下文复制成本；[验收取舍](docs/DECISIONS.md) |
| O11 / 多 pane、Git 与归档补测 | 主流程通过，边界已接受或划出范围 | 同 child 重复视图残留接受现状；原生编辑关闭保护不列为插件任务；[范围](docs/DECISIONS.md) / [报告](evidence/O11-residual-check-2026-11-04/report.md) |
| R5 有界扩展观察 | 约 124 秒未复现，不代表长期修复 | 五页、六次刷新、六次重挂；660 次请求全部 200，关闭其他页面后 TCP 回落 |
| 文档收口 | 2026-11-04 完成 | 12 篇合并为 7 篇，每类事实单一出处 |

2026-11-03 desktop 状态：六个 `@local` link/bundle 已登记，准入 active、C/R/M=8/2/4，shield active/`inject=true`，O6 为 idle/no-target-tools（12 条注册与包装记录）。O6 的 idle 说明代码已加载，不表示本轮执行过用户真实模型的 list/control。`guide-manager` 1.1.0（Phase 1–4）已登记到该 profile；隔离端到端和 2026-11-05 live 三项冒烟均通过，四阶段整体验收完成。2026-11-07 开始 Phase 5 本地施工，部署/隔离验收结果另行记录，见 [设计](docs/PHASE-5-ASSESSMENT.md)。

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
| D32 | Phase 5 使用独立 manager 安装入口 + 六个独立组件包；推荐组合安装、按需独立升级 | 5A/5B/5C 本地包路径已实现；发布、来源迁移、数据迁移另行推进；不做强制 suite 依赖入口 |
| D33 | 先接通现有 GitHub Releases 的发布清单/下载并验收，再实施当前 link 环境的一次性切换 | 2026-11-08 用户同意；5D-0～3 已本地实现，真实发布/整体验收与迁移仍待实施；registry 来源通用迁移、跨 schema 迁移不并入首版 |

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

本机生产元数据仍为六组件 + manager `1.1.0`（Phase 1–4 已在 desktop 验收）；保留既有 Git、CI、link 装卸/回退路径，见 [维护手册](docs/MAINTENANCE.md)。2026-11-07 按顺序完成 5A/5B，并实现 5C 的本地包卸载、原版本修复及 manager 自升级/外部恢复。工程检查允许组件独立版本，兼容性由精确版本组合、peer、契约、宿主产物与重启健康核对约束。测试用 `1.1.1`/`1.1.2`/`1.2.0` 仅在夹具中生成，故障版不用于用户安装。当前无 registry 最新版本发现，不覆盖开发 link；组件的非稳定缓存来源需显式迁移，manager 的本地 tgz 来源在恢复时固定到缓存。本轮未切换 live 安装，live 仍是 link 部署，不能把隔离包验收当作 live 来源迁移完成。正式分发、来源迁移、跨 schema 迁移、可信源缓存找回、断电点自动恢复及外部依赖的一键代装均未实现；[功能核对与测试清单](docs/FUNCTIONAL-TEST-MATRIX.md) 逐项记录实现缺口与验证缺口。需要持续维护的是两个 adapter 的兼容边界，不是重新开启 fork 维护。

2026-11-08 已定后续顺序为 **5D 远端分发/查询/下载 → 隔离验收 → 5E link 来源迁移 → 隔离验收 → live 具体部署准备**。5D-0/5D-1 的格式校验、固定提交产物、草稿/正式发布工具及 workflow 已完成本地实现。截至 2026-11-08 未新增消费端下载/UI，也未真实上传、创建远端 tag/Release 或迁移；代码的默认完整回归与发布工具测试不等于 GitHub 托管 runner/私有仓库链路验收。生产元数据仍 1.1.0；工作区含未提交实现，真实发布需先形成包含这些实现的正式来源提交，不能把本地临时 Git 夹具提交当成真实仓库提交。详见 [发布端说明](docs/PHASE-5D-RELEASE-FORMAT.md) 和 [证据](evidence/phase5d-2026-11-08/report.md)。首版使用现有仓库私有策略与 GitHub Releases，不新增服务器；外部凭据与真实远端访问在对应验收项记录，不能用 mock 结果替代。

2026-11-09：5D-2 后端消费链路与 5D-3 HTTP/UI 已实现并通过本地隔离测试；Edge 实际页面确认取消重试、刷新恢复与计划确认，远端仍使用测试夹具。5D-4 真实私有远端/官方冷操作/桌面整体验收及 5E 仍待实施。见 [后端说明](docs/PHASE-5D-CONSUMER-BACKEND.md) / [HTTP 与管理页](docs/PHASE-5D-HTTP-UI.md)。

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

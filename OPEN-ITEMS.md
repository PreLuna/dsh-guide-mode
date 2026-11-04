# 当前未完成事项

更新：2026-11-04（Asia/Shanghai）。本文件只保留仍有实际后续工作的事项；已完成、已接受的限制及旧方案见 [PROJECT-STATUS.md](PROJECT-STATUS.md)，设计/任务/研究/收尾过程记录见 [历史资料索引](docs/HISTORY-AND-MAINTENANCE-NOTES.md)。

O2/R6（含 O8 本机部署确认）、O6 的 BP-1～BP-3、O19/O7/R1、O12/O20/O21 及本机工程基线均已在支持基线内关闭。完整平台回归与版本兼容不能由单项关闭推定完成；建议顺序不代表授权实现全部项目。

## 1. 平台回归与版本边界

### O11 / LI 后续平台回归

核心验收已通过。当前任务边界见 [任务边界与维持现状的设计](docs/SCOPE-AND-ACCEPTED-LIMITS.md)：归档主流程、Git 提交 UI、自动归档短延迟三档已验；同 child 强制重复视图的归档残留接受现状，原生 Git 业务／编辑器关闭保护不列为指导插件开发或修复任务。它们不再作为本插件强制整改项；原始 failed 证据仍保留，自有集成造成的回归仍负责。

后续覆盖缺口仍包括原生各 Stop 入口的集成、第三方后续包装、服务整体重建及所有加载顺序/导入失败/不兼容组合。真实模型长压／故障与长时资源验证为可选非阻塞项，RM-3／RM-5 接受宿主默认机制，RM-7 接受上下文复制／成本。PT-6 已由用户暂缓，保留设计与历史默认沙箱失败、无沙箱隔离对照 45/45 通过的事实。自动归档 low 600 秒档未做完整计时实测，high/mid/C3 有历史实测、三档有短延迟补测；保留覆盖说明，不因该说明自动扩大当前任务。

O2/R6 已覆盖真实 scoped closing 与 panel HMR；整个 Host graceful shutdown 的任意服务关闭顺序、shield 服务整体重建及硬崩溃耐久性继续在此归口，不作为 O2/R6 残留重复追踪。准入核心与 shield 核心采用冷更新，连续 HMR 执法不在已接受支持边界内。

这是覆盖范围，不表示上述功能均存在缺陷。优先补真实使用中出现的具体问题；版本升级后必须重新审查私有边界与指纹。缺口拆分、优先级和补测脚本计划见 [O11 验证计划](docs/O11-VALIDATION-PLAN.md)。

2026-11-03 已执行 P0 多 pane（A1）：MP-1～MP-7 全部 `passed`，36 项断言，0 条浏览器 console error；证据见 [P0 多 pane 报告](evidence/O11-validation-2026-11-03/report.md)。同日执行 P0 Git/文件编辑（A2）：GF-1～GF-6 功能断言 6/6 通过，整体 `known-diagnostic`（2 条既有 sidebar 诊断）；证据见 [P0 Git/文件编辑报告](evidence/O11-validation-2026-11-03/p0-git-file-edit/report.md)。2026-11-04 补测确认 Git tab 原生提交 UI 和自动归档短延迟三档通过；同 child 双 pane 归档只关闭一个视图，原生右栏编辑器未保存关闭没有确认弹窗。前者已接受为视图清理边界，后者划出指导插件任务范围；均保留实测事实，不列为强制待办，详见 [残留项复核](evidence/O11-residual-check-2026-11-04/report.md)。

2026-11-04 已修正 PT-6 测试：真实指导 native tool-call、当前 terminal_open/list/read 等工具、正确终端 ID、双指导隔离、原生结果卡和清理均已接入。默认 workspace-write 完整矩阵中 PT-1～PT-5 passed、PT-6 failed（terminal_open 的 Windows 沙箱／PTY 启动失败）；用户明确授权的无沙箱隔离对照中 PT-6A／PT-6B／cleanup 45/45 passed。现有结果卡足以核对，无需新增查看器；未改真实 profile 或生产 preset。旧报告“工具注入默认关闭”的归因撤回。用户随后决定暂缓 PT-6 的进一步实现与宿主排障，保留现有原生结果卡设计、测试和历史失败事实；恢复时再保持沙箱约束修复并重跑。PT-5 实际 resize 重排继续保留。详见 [本轮报告](evidence/O11-validation-2026-11-04/pt6/report.md)。

2026-11-03 已执行 P2 真实模型小样：`deepseek-official` / `deepseek-chat`，1 次普通对话 + 6 轮 goal + 3 指导并行 + goal pause/resume；RM-1/RM-2/RM-4/RM-6 `passed`，RM-3（compaction）/RM-5（provider 错误）/RM-7（长时/token 指标）`blocked`。实际耗时 22.9 秒，30 分钟/200k 预算上限未达到，token 用量未从 session events 取得；详见 [P2 报告](evidence/O11-validation-2026-11-03/p0-real-model-soak/report.md)。不能把本轮写成“30 分钟长时 soak 通过”。

2026-11-04 已完成 RM-3／RM-5／RM-7 源码研究及验收范围调整：用户优先首轮指导，接受继承主会话上下文和成本，RM-3 采用宿主 persona／压缩，RM-5 采用同一宿主重试机制，不再要求本轮完整故障／长压门禁；RM-7 的复制／成本策略已接受，长时资源趋势验证暂缓为可选非阻塞项。保留首轮指导 persona、任务边界和 skill 可用性要求；源码确认装配路径，本轮没有新增模型行为实测，也不承诺绝对遵循。历史 blocked 是未实测记录，不改写为 30 分钟／故障注入通过。本轮无外部模型调用。见 [当前验收决定](docs/RM-ACCEPTANCE-DECISIONS.md)；[原研究的有效摘要](docs/HISTORY-AND-MAINTENANCE-NOTES.md) 转为可选后续。

2026-11-03 G0 基础门禁与 fake-host 矩阵完成：`npm test`/`build:check`/默认浏览器回归通过；13/13 矩阵检查通过。C-1～C-10 全部通过：C-1 已补 `assertSingleDriver` 的 disabled 原 goal-driver 检查，冷启动 smoke 仍 ready；C-3 原失败是夹具缺少 `this.ctx.fiber.runtime`，修正后 projection 保持 active；C-9 完成 guide-panel bundle 1.1.0→1.1.1 冷更新；C-10 完成 DSH 0.2.1-rc.5 升级尝试——launcher 在挂载前拒绝 rc.3-pinned guide bundles，`/guide/api/state` 404，回滚 rc.3 后 panel/goal/shield 恢复 ready/active。**注意**：C-10 证明的是“不支持版本明确拒绝 + 回滚”，不是成功的 rc.5 升级；受支持升级仍需未来重跑 §6.3。详见 [G0 报告](evidence/O11-validation-2026-11-03/p0-compat-baseline/report.md)、[C-9 报告](evidence/O11-validation-2026-11-03/p0-cold-update/report.md) 与 [C-10 升级/回滚结果](evidence/O11-validation-2026-11-03/c10-upgrade/result.json)。

O19/O7/R1 本轮浏览器 11 项功能通过；reload/unload 期间记录 `agent-opens` WebSocket 提前关闭和 `Session reference ... is released` 两条 sidebar 诊断，见 [实施记录](evidence/O19-production-2026-11-03/report.md)。保留后续定位，不声称零错误，也不直接归因于准入门。

### R5：浏览器同源 SSE 排队

历史 M3/M4 的同源 HTTP/1.1 SSE 排队仍保留为历史事实。初次隔离组合的一页／两页／刷新 9 次请求未复现；2026-11-04 已扩展为同上下文四页 + 独立上下文一页、六次刷新、六次 adapter 重挂，最终观察 123.797 秒，660 次请求均 HTTP 200、最长 47 ms。当前文档每页保持 1 SSE + 3 WebSocket，关闭其他页面后 Host TCP 资源数从五页 19 降到单页 5；见 [补测报告](evidence/O11-residual-check-2026-11-04/report.md)。没有修改连接协议；原生多窗口、任意源码 HMR 和长期泄漏仍不由本次约两分钟观察担保，后续在真实使用重现时继续定位。

### O17：名额语义的独立复测（可选）

运行占槽、结算释放、闲置不占已有用户实验报告和源码依据；专门的 `maxActiveSubagents=1` 独立脚本复测尚未补齐。O7/R1 的零预算和容量 1/2/8 已验；本专项仍为可选，不重复设一项产品决策。

## 2. 已定产品取舍索引

本节没有新增待决策项；当前决定保持，完整边界见 [范围决定](docs/SCOPE-AND-ACCEPTED-LIMITS.md)。

| ID | 决定 | 当前默认行为 |
|---|---|---|
| Q4 | 用户决定保持现状 | 沿用宿主显示；主会话可独立回复，转圈不代表主会话被锁住 |

O5 与 Q7 已于本轮决定：O5 保留自动归档能力但默认关闭；Q7 专区采用“本会话 + 根会话其他指导”的混合分组。落地状态见 [PROJECT-STATUS](PROJECT-STATUS.md) 的 D27/D28。Q7 的**底部独立滚动区已确认并实现**，折叠和批量操作仅为可选后续，未形成必须实施的需求。接受“运行中占一个槽”的名额语义也已经确定，不再询问是否追求完全不占。

## 3. 工程维护与分发

本机自用六包已统一为 1.1.0，具备本地 Git、最小 CI、生成物检查、真实 client 加载测试、卸载与回退流程，见 [本机维护流程](docs/LOCAL-MAINTENANCE.md)。本机已执行与 CI 相同的 Node 命令；已创建私有 [GitHub 仓库](https://github.com/PreLuna/dsh-guide-mode)，托管 CI 的实际状态以 Actions 记录为准。

用户现决定先以私有 GitHub 仓库维护；市场发布、公开仓库、公开许可与作者／命名空间留到稳定或再次检查后决定。仓库收录与本地快照见 [仓库准备](docs/REPOSITORY-PREPARATION.md)。需要持续维护的是两个 adapter 的兼容边界，而不是重新开启 fork 维护；旧 fork PR、build+copy 和其全量 vitest 已退出生产维护路径。

## 4. 已移出本清单

| 原条目 | 收口结论 |
|---|---|
| O12 / O20 / O21 / R4 / R7 / R8 / R9 / O10 | 1.1.0 本机实现、验证和冷部署完成；见 [实施记录](evidence/O12-O21-engineering-2026-11-03/report.md) |
| O5 | 自动归档保留能力，默认关闭；`archive.auto: true` 才启动客户端调度，手动归档不变 |
| O11 重复视图归档清理 | 正常归档流程通过；同 child 强制双 pane 留一个视图接受现状，不继续深入清理 |
| 原生 Git／编辑器业务 | 原生组件职责，不列为指导插件开发／修复任务；Git 提交 UI 已通过，草稿关闭行为仍保留为原生路径观察，自有集成回归仍负责 |
| Q4 | 沿用宿主转圈显示，维持现状，不再待决策 |
| Q7 | 专区改为“本会话 + 根会话其他指导”混合分组；面板仍按当前 seat |
| O19 / O7 / R1 | 43 项生产 Host 断言、44 项核心检查、按池 scan 集成、O2/R6 回归及 desktop 冷部署完成；核心采用冷更新，见 [实施记录](evidence/O19-production-2026-11-03/report.md) |
| O2 / R6（含 O8 部署确认） | 实现、隔离矩阵及实际 desktop 迁移闭环；见 [收尾结论](docs/HISTORY-AND-MAINTENANCE-NOTES.md) |
| O6 / O8 | BP-1～3 修复与 34 组 Runtime、86 项 Host、11 项浏览器验收完成；见 [修复报告](evidence/B-prime-fixes-2026-11-02/report.md) |
| O18 / O3 | 支持基线下 goal 等待指导已修复；保守等待边界写入归档方案 |
| O11 核心任务页 | 官方树/图、计数、auto-open、专区、重挂与刷新已验；仅扩展回归留在上文 |
| R2 / R3 / O9 | 官方产物已核对；旧 fork 测试/PR 不再阻塞运行 |
| O13 | 用户接受完整 seed 成本，不优化、不省 token |
| O14 | v1 不专门支持嵌套 |
| O15 | 接受归档后其他 UI 仍可能可见/可输入，不补菜单项 |
| O4 | 编号作为历史别名保留，当前按具体 ID 追踪，不再为定义 M5 追加产品问题 |
| O16 | 文档重新分工；过时原文已归档，见 [历史资料索引](docs/HISTORY-AND-MAINTENANCE-NOTES.md) |

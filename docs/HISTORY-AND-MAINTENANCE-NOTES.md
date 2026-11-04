# 历史设计与维护经验摘要

整理：2026-11-04（Asia/Shanghai）。本文件提炼已完成或已放弃方案中的参考价值，替代旧 fork、重复台账、旧任务全文及一次性部署脚本。当前行为以 [架构](ARCHITECTURE.md)、[已定边界](DECISIONS.md) 和 [项目状态](../PROJECT-STATUS.md) 为准。

## 1. 去 fork 与 goal 等待根因

早期 M4 实验中，指导运行未冻结父会话：普通消息约 0.94 秒能回复，被推迟的是 goal 的下一轮。原 driver 会显式调用子会话 join，不能继续采用“只因 idle／flush 延迟”的旧解释。

曾比较公开 exclude API、服务包装、driver 源码副本及文档接受等待等路线。最终采用两个独立 adapter：导入原 driver／join 与官方 sidebar 组件，只在私有作用域提供局部服务视图。没有上游源码副本、全局原型替换或 250ms 静默窗口；未知产物回退明确状态，driver 导入失败不可静默遗漏调度。

已退役 fork 基于官方 v0.28.2，包含两个本地提交：`3217785` 添加任务过滤器与底部专区注册 seam，`df4ae61` 使计数只包含消费者可见后代。前者主要修改 service／tasks-model／SubagentView／auto-open，后者修正 lineage 计数。旧 fork 工作树在删除前无未提交改动；这两项能力已转由自有 sidebar adapter 实现，不再依赖旧仓库、其 Git 历史或构建脚本。

维护要点：任务树、图、计数与 auto-open 必须读取同一过滤结果；按 ID 直接读取会话仍完整可用。UI 标题前缀只用于显示过滤，不能用来判断调度、准入或结算身份。指导可写且与 goal 并行，不新增跨会话文件锁。

## 2. O6：工具投影为何采用注册前装饰

早期仅包装 `tools.execute` 或依赖 pre／post hook，会漏掉真实 scheduler、native tool-call 或 PTC 的工具入口。单靠 agent/created 事件扫描也存在合法首调早于扫描的窗口。

最终 B′ 在目标定义进入 `tools.register` 前装饰 execute，保持 registering context、scope、schema、render、通知及 disposer；已有定义从原模块 live fiber 的精确注册层 bootstrap。global／live-agent 可见视图按定义对象去重，隐藏工具不算覆盖缺口，共享定义不能因一个 agent 释放而提前还原。

十项决定的有效部分：

| 要点 | 保留的维护约束 |
|---|---|
| 来源 | 核对安装产物、真正注册者 runtime、首次接受的 execute 指针；不能用工具名或 `execute.toString()` 模板哈希证明实际语义。 |
| 状态 | 区分 off／pending／idle／active／partial／unsupported；没有暴露目标工具可为 idle，不等于失败。 |
| 取消 | caller 取消优先于身份 unknown；查询前、每次 await 后、派发副作用前都复查，不能把取消误当查询失败而放行。 |
| 卸载 | 先失活，再只还原仍属于自己的指针；第三方外层保留，旧闭包直通；await 后也复查 epoch。 |
| 未知 | 身份合法查询失败可沿原授权路径处理；缺必需契约则 unsupported。未知替换报告 partial，不重新信任或覆盖第三方。 |
| 保证 | 只保证支持产物和正常注册／事件顺序，不防任意 JS 无事件改写；不新增定时轮询或每调用磁盘哈希。 |
| 开关 | hideGuidance=false 整体关闭，blockControl=false 只保留列表装饰；不自动切换另一套架构。 |
| 验收 | 必须包含真实 native 和实际 PTC 最小链路；fake scheduler／直接便捷调用不能替代。 |

BP-1 注册生命周期、BP-2 取消／卸载交错、BP-3 execute 来源变更均已整改。历史验收为真实 Runtime 34 组、Host 86 项、浏览器 11 项；证据仍保留本机 `evidence/B-prime-fixes-2026-11-02/`，这些数字不代表未来版本自动通过。

## 3. O2／R6：结算防护与生命周期收尾

已在 DSH 0.2.1-rc.3／Cordis 4.0.5 基线内关闭：scoped closing 后 inject、普通兄弟阳性对照、父重建、两进程恢复、持久化 observation、panel HMR apply 门控与卸载所有权均已验收，且已完成实际 desktop 冷部署。

独立 guide-shield 持有结算防护，panel 的 provider／API／O6 重挂不卸载该服务。身份读取只取子会话自身继承边界之后的首个 continuable／guide-fork descriptor（first-wins）；不能拿继承的父 descriptor 或最后一个 descriptor 替代。

Runtime 会先释放 child 再通知父会话，故采用按精确父对象分组的一次性结算凭据；同 ID 新生命周期、父释放和服务卸载必须清理。父重建后的旧 activation 仍受原 Runtime 的 exact-parent guard 限制，不补偿投递。失活 wrapper 不覆盖第三方外层。

历史 prepare 122 次断言（其中 O2 32 项）、restart 98 次（其中 O2 8 项）含重复基线，不能宣称 220 个独立场景。原始报告保留在本机 `evidence/O2-R6-2026-11-02/`、`evidence/O2-R6-desktop-migration-2026-11-03/`，包含实际部署与只读哈希复核。

保留边界：panel HMR 连续保护不延伸到 shield 自身卸载、整个服务图任意关闭顺序、硬崩溃或未知宿主。同步 snapshotEvents API 的 deprecated 依赖仍需升级时复核。

## 4. O19／O7／R1：准入与容量口径

旧 panel 的请求起点检查无法覆盖 prepare 内部 await 后的抢占或 coldResume；catalog.running、标题与跨根 summary 求和也不等于原生占槽。最终独立 guide-admission 在原 materialize 同步 reserve 边界检查后立即交给原生占槽，不另造 slots 或信号量。

- C 跟 Host 当前有效容量；R 按原生池；M 为 profile 全局指导上限。支持 M=0／R>=C 的零预算，不能偷偷抬成 1。
- S 取原生 pool.slots，包含 creating／closing／external／尚未 release 的 idle parked；同一工作不能被 pending 和 slot 重复计数。
- 池沿精确 live-parent／resident 连续链解析；读状态不能调用会创建池的方法，也不能只按历史 parent header 猜池。
- 未知容量／身份／全局计数阻止新增指导；普通工作保持原路径。活动工作后代计入 S，不因继承 guide preset 就计为指导 G。
- 自动归档按同源按池快照计算压力，不能以所有根的总占用除以一个池容量。归档不额外释放已 release 的槽。

O19 生产验收及部署证据保留本机 `evidence/O19-production-2026-11-03/`。准入核心采用冷更新，不承诺核心卸载空窗连续执法。

## 5. PT-6／RM：暂缓方案中的可复用知识

PT-6 原错误包括检查旧工具名、用父身份调用、将对话 ID 当终端 ID。有效验证须由真实指导创建并复用同一终端，跨调用核对随机变量／PID／目录，浏览器展开实际工具结果卡；不能只匹配输入回显。最终已有原生结果卡足够核对，无需新增查看器。默认 Windows workspace-write 启动失败、授权隔离无沙箱对照 45/45 通过的事实分别保留；进一步实现暂缓。

如以后恢复：继续用指导 owner 和返回的 terminal ID；不要把主界面新建进程冒充原进程。模型终端 backend 与用户 xterm attach 不是自动等价。`terminal_read` 的 newest-relative offset/count 是有界快照，不是追加游标；只读查看不可悄悄创建 agent 或关闭终端。

RM 当前接受宿主默认机制，详见 [已定边界 §3](DECISIONS.md)。旧扩展研究仅保留如下复测经验，不构成必须实施的新任务：

- 压缩 fixture 必须提供有效 contextWindow／输出上限并匹配 headroom；工具结果裁剪不等于摘要压缩。摘要也会调用模型，离线测试须连摘要一起用本地 fixture。
- 普通模型回合重试与直接摘要 stream 入口不同。normal 的额外重试次数、always 的持续重试、provider 有效策略和 caller 取消需分别考虑，不靠错误文本判断。
- 旧 soak 固定 6 轮、约 22.9 秒的小样不能称长时测试；maxTokens 写入报告不等于实际执行预算控制。
- 累计用量须按 session 自有事件／attempt／compaction 去重，fork 继承前缀不可重复求和；上下文估算不等于计费。缺失 usage 记 unknown，不能默认为零。
- 如再做长测，先补统一截止、清理期限、资源快照及结果失败传递；按观测底座 → 离线故障 → 离线压缩 → 本地长测推进，外部模型另依用户授权范围执行。

## 6. 安装、恢复与删除边界

当前入口为 [维护手册](MAINTENANCE.md) 和 `scripts/workspace.mjs`／`scripts/apply-profile.ps1`。过时的 O19／O2 一次性 prepare／apply／verify／rollback 脚本按固定日期、固定哈希和旧计划结构工作，不适合作为新版本升级入口，现已退役删除。

仍保留两阶段的 adapter 安装／恢复脚本：它们负责官方 sidebar 文件恢复、driver 配对选择及原路径回执，与纯增加六包依赖的统一入口不完全等价。相关 `evidence/LI-stage*/desktop-before`、`official/package` 和 tarball 仍被回退或集成测试引用，不能按“历史缓存”整体删除。

历史回退必须同时恢复匹配的源码版本和 profile 选择；单卸载 shield 会有意解除防护。先停止目标 Host，核对目标文件现状及备份哈希，只改本轮拥有的文件／链接；不递归删除 registry 包或会话，不把旧日期备份当作新格式 plan 直接交给统一脚本。旧脚本的恢复经验保留于此，原始备份／计划仍在本机证据目录。

删除范围与删除前哈希见本机 `evidence/repository-prep-2026-11-04/cleanup-plan.json`；仓库不收录运行 profile、凭据、会话、官方包缓存或旧 fork。历史报告保持执行时语义，删除旧文档后的链接更新只迁移参考入口，不改写原始实验结果。

# RM-3 / RM-5 / RM-7 当前验收取舍

日期：2026-11-04（Asia/Shanghai）。依据用户“重视首轮指导、接受上下文复制和宿主默认机制”的决定，收窄当前产品验收范围。本轮仅源码核对，无外部模型调用、无新运行测试、无生产代码或真实 profile 改动。

**设计项可以按下述口径收口；历史测试未执行的项目不改写成运行测试 passed。**

## 1. 原生四个预设与指导的关系

本机安装版 DSH 0.2.1-rc.3 的四个原生预设是 standard、ptc、minimal、cordis；均通过 dsh-agent-preset 注册、dsh-persona 贡献身份提示，使用同一 agent-loop。

| 部分 | standard / ptc / cordis | minimal | 当前 guide |
|---|---|---|---|
| 预设装配 | dsh-agent-preset | 相同 | 相同 |
| 身份提示 | dsh-persona | 相同组件，但 complete=true，关闭 runtime context | 相同组件，配置指导专用 prefix |
| 压缩后端 | dsh-compaction-basic | 相同后端 | 相同后端 |
| 工具输出裁剪 | tool-result-pruner | 未挂该 pruner | 与前三个相同组件及 8192/4096/1024 参数 |
| 模型回合重试 | Host 的 llm-retry + provider retryPolicy | 相同机制 | 相同机制，未另写指导专用重试器 |

“同一组件”不等于四种预设的所有工具、提示或行为相同。guide 与 standard／ptc／cordis 的压缩组定义一致；minimal 的组合更精简。

来源快照位于 [原生 standard](../evidence/O11-validation-2026-11-04/rm-research/sources/official-preset-standard.patch.yml)、[ptc](../evidence/O11-validation-2026-11-04/rm-research/sources/official-preset-ptc.patch.yml)、[minimal](../evidence/O11-validation-2026-11-04/rm-research/sources/official-preset-minimal.patch.yml)、[cordis](../evidence/O11-validation-2026-11-04/rm-research/sources/official-preset-cordis.patch.yml)。本地 guide 定义见 `guide-preset/cordis.patch.yml`。

## 2. RM-3：接受宿主压缩，重点保留首轮约束

用户理解的“对话过长后可能偏离指导”是相关风险之一。原 RM-3 还包括上下文溢出、压缩失败、压缩后不能继续等机制风险，不仅是角色偏移。

四种原生预设也没有绝对防止长对话语义偏移的机制。它们与 guide 均依靠 persona／system prompt 和宿主压缩，不能把语义偏移说成插件独有问题。persona 来自预设的系统提示装配，而非只在第一条普通消息说一次；普通摘要压缩不等于删除预设或取消 persona。

当前首轮有两层源码上可确认的约束：

1. guide 专用 persona：用户询问技能、命令或下一步时，加载可用的 guide skill，按卡给建议，不执行所建议的工作；skill 缺失时明确降级。其他请求允许按普通编程助手处理。
2. 指导首条消息的边界提示：继承的主会话历史是参考上下文，新的用户问题才是指导当前任务；由 guide-fork 配合独立 guide preset 送入真实子会话。

这些是模型指令约束，不是禁止执行的权限闸门。源码可以确认约束的装配路径，不能据此保证任何模型在任何输入下百分之百遵守；本轮没有新增真实首轮行为测试。

首轮也可能继承已经很长的主会话并触发压缩，因此“只重视首轮”不等于首轮永远没有上下文压力。当前接受宿主对此的默认处理，不新增插件专用长对话记忆、摘要或抗漂移策略；保留首轮 persona、任务边界与 skill 可用性作为产品约束。

**当前验收：采用宿主默认机制，设计已接受；完整 RM-3 压缩压力测试不再是本轮交付门禁。**

## 3. RM-5：采用同一宿主重试机制

普通主会话、普通代理和 guide 的模型回合都进入宿主 agent-loop 的 agent/request-error，再由 Host llm-retry 与选中 provider 的 retryPolicy 决定重试。guide 没有独立的网络请求或重试实现。

使用同一 provider route／有效配置时适用相同策略；换 provider 或修改策略后次数和退避可能不同。这种差别不来自 guide preset。

压缩摘要的直接 ctx.llm.stream 调用与普通模型回合不同：它不经过普通步骤重试器。这是宿主原有的入口差别，也不是指导插件额外引入的规则。

**当前验收：共享机制已由源码核对，按用户口径接受宿主默认恢复行为，本轮不再追加完整故障注入门禁。** 历史 RM-5 故障测试未执行的事实保留。

## 4. RM-7：接受成本／上下文取舍，长时资源验证改为可选

已接受的产品取舍：

- 以 fork seed 继承主会话已完成轮次的上下文，不为首轮额外设计一套摘要优化。
- 接受这一路径的上下文体积和模型成本；本轮不要求 token 硬预算、新费用账本或为了 RM-7 单独做上下文优化。
- 优先首轮指导质量，持续 30 分钟的真实模型 soak 不作为当前产品交付条件。

成本／复制策略与资源泄漏属于不同问题：接受前者并不能证明 slots、监听器、标签页或内存长期没有累积。当前把长时资源趋势验证列为**可选、非阻塞观察**，若后续真实使用出现累积、卡住或性能退化，再针对具体复现排查。已有关闭／归档／名额等生命周期回归与修复继续保留，不撤销基本资源管理。

**当前验收：成本／上下文设计已接受；RM-7 完整长时资源测试暂缓，不宣称“长时稳定性实测通过”。**

## 5. 状态口径

| 项目 | 当前设计验收 | 历史测试事实 | 是否阻塞当前首轮指导方案 |
|---|---|---|---|
| RM-3 | 接受宿主压缩与 persona 机制 | 未进行完整压缩压力验收 | 否 |
| RM-5 | 接受共享宿主重试机制 | 未进行完整 provider 故障注入 | 否 |
| RM-7 | 接受复制／成本；长时验证暂缓 | 仅有 22.9 秒样本，未做完整长测 | 否 |

PT-6 仍按既有决定暂缓。旧报告／原始 result.json 的 blocked／failed 保留为当时的实测记录，本文件记录新的产品验收边界。先前 [研究方案](HISTORY-AND-MAINTENANCE-NOTES.md) 中的矩阵与预算实现转为可选后续方案，不自动执行。

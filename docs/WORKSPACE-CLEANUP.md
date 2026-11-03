# 两阶段完成后的工作区整理

> 最新执行：用户本轮授权回收，18 项、约 725.05 MiB 已成功移入 Windows 回收站，未永久删除。见 [审计](../evidence/B-prime-audit-2026-11-02/report.md) / [逐项回执](../evidence/B-prime-audit-2026-11-02/recycle-receipt.json)。下文保留上一轮仅归档的历史操作记录，原“0 回收”属于上一轮；当前以新回执为准。

日期：2026-11-02（Asia/Shanghai）。本轮只整理资料与 Markdown，没有修改插件运行代码、真实 profile、会话数据或安装回退状态。

## 已执行

1. 保存根 README、PROJECT-STATUS、OPEN-ITEMS、LOCAL-INJECTION-PLAN 的原文快照及哈希到 [before-cleanup](archive/2026-11-02/before-cleanup/)。
2. 重写当前 README、交付/决策台账和真正剩余事项；新增当前架构及 evidence 索引，减少旧实验细节在多份台账之间复制。
3. 将根 O18-GOAL-WAIT.md 移至 [历史方案](archive/2026-11-02/O18-GOAL-WAIT.md)，调整该文可点击的相对链接；当前方案入口已更新。
4. 将阶段二的 failure.png、browser-diagnostic.json、browser-errors.json、browser-body.txt、modules-client.js、modules-index.js 移入 旧 debug-history（后续已按授权回收）。保留原文件内容与哈希，不混入最新通过结果。
5. 保留四个自有包、旧 fork 仓库、所有原始实验与安装恢复资料。本轮回收站操作数量为 **0**；逐项操作见 [file-actions.json](archive/2026-11-02/file-actions.json)。

## 保留、归档与可回收分类

容量由本轮实测，单位 MiB（按 1024² 字节）；目录统计跳过 symlink/junction 目标，避免把外部目录重复计入。

| 路径 / 材料 | 去留 | 理由 |
|---|---|---|
| guide-panel / guide-preset / 两个 adapter | 当前保留 | 实际 profile link 指向这些目录；入口、生成 client.js、patch 和 package 元数据都属于当前运行文件 |
| 根 README / PROJECT-STATUS / OPEN-ITEMS | 重写后保留 | 分别维护使用、已交付/已定、真正未完成；不再把历史“待定”反复带回 |
| LOCAL-INJECTION-PLAN.md | 修订后保留 | 已确认工程约束和交付对照；不是下一轮待办 |
| docs/ARCHITECTURE.md | 新增保留 | 提炼原长 README 中仍有效的 provider、身份、隔离作用域与 shield 机制 |
| 两份 LI-stage 报告、最新 result、测试日志、tasks.png、delivery-audit | 当前证据保留 | 证明支持基线、结果、限制和最终安装状态 |
| 两阶段 desktop-before，合计约 18.80 MiB | 保留原路径 | 恢复脚本依赖原配置、文件级备份、files.json 与 lockfile 记录 |
| 阶段二 official，约 23.05 MiB | 暂保留原路径 | 安装脚本、官方消费者测试及隔离 smoke 的基线依赖；不是可以随手删除的下载残留 |
| M2/M3/M4/M5-A、O18 两项研究 | 历史证据保留 | 结论各有边界；保留对照、原始日志和勘误来源，无需持续维护其上游提取件 |
| 旧 O18 方案、整理前长文 | 已归档 | 选择分支和旧时态过时，但决定过程有追溯价值，不需要丢入回收站 |
| 早期失败现场、模块提取件 | 已归档 | 可用于诊断，非生产依赖；也不应与最新通过结果并列当作“当前失败” |
| better-sidebar-fork 的 .git / src / tests / docs 等 | 冻结保留 | 本地两项历史提交和原始来源仍有追溯价值；不再构建、安装或升级它 |
| better-sidebar-fork/node_modules，约 675.20 MiB | **已于 B′ 复核移入回收站** | 可再生的旧 fork 开发依赖，不属于当前运行/构建；删除后历史 fork 开发环境需重装 |
| better-sidebar-fork/lib，约 48.98 MiB | **已于 B′ 复核移入回收站** | 旧 fork 生成产物，未被 Git 跟踪；已保存实际安装恢复副本，不再用于当前构建 |
| 两阶段 isolated-home，合计约 3.27 MiB | **可选回收，本轮未执行** | 可重建测试环境；回收会失去未另行导出的测试 session 细节，保留成本较小 |

优先回收旧 fork 的 node_modules 和 lib 可释放约 **724.18 MiB**；若同时回收两个 isolated-home，则约 **727.45 MiB**。容量不包含链接目标，不能把整个 fork、desktop-before 或 official 当作同一类可再生缓存。

当前 desktop 的 sidebar 实际路径及 ws/yaml 依赖均位于用户 profile，自有包 link 指向四个当前目录；已核对不指向 fork。Git 也未跟踪 fork 的 lib/node_modules。归档和保留不影响现有安装。

## 已经过时的内容

- “必须构建 fork 并覆盖 lib”“升级后重新覆盖”的生产流程已退出。
- “goal driver 不感知后代、只因 idle/flush 推迟”的早期猜测已推翻；原 driver 会显式等待 join。
- “局部注入还没导入真实 Host / 还未实施”的研究阶段时态已被两份实施报告替代。
- “用 250ms 静默窗口”及 driver 源码副本是旧方案，不是当前生产实现。
- “官方任务页没验收”“installed index 是旧 fork 哈希”已由官方安装审计与浏览器结果替代。
- seed 是否优化、嵌套是否支持、归档后平台可见性是否接受等已拍板项不再标待定。
- M5 编号歧义保留历史别名即可；旧 fork PR/全量测试不再是交付前置条件。

## 仍未解决的内容

真正待办已统一到 [OPEN-ITEMS.md](../OPEN-ITEMS.md)；本轮新增 O19–O21、R7–R9，O6/O8 的实现设计与可执行任务见 [O6/O8 设计](O6-O8-DESIGN.md) / [任务清单](O6-O8-TASKS.md)。本轮不通过文件整理替这些事项做产品决定，也不把 goal/sidebar 的通过结果算作 shield、模型工具过滤或完整平台回归已经完成。

本轮不通过文件整理替这些事项做产品决定，也不把 goal/sidebar 的通过结果算作 shield、模型工具过滤或完整平台回归已经完成。

# O2 / R6 收尾结论

复核日期：2026-11-03（Asia/Shanghai）。**结论：O2/R6 在 DSH 0.2.1-rc.3 / Cordis 4.0.5 支持基线内已完成，可以关闭；没有剩余的 O2/R6 实现、矩阵或本机部署待办。**

收尾对象是“shield 身份、重载与父生命周期”，完成标准沿用原 OPEN-ITEMS：已有与新建指导在重载/重建后结算不污染父历史，普通工作仍正常结算，卸载只清理自己持有的包装。未把整个平台的所有故障顺序扩大为本条的关闭条件。

## 完成标准与证据

| 原要求 | 收口依据 |
|---|---|
| 真实 closing → inject 窗口 | 原 Runtime scoped teardown 实际触发 closingTeardownFor；子 agent/Session 已释放后仍拦指导，普通兄弟保留在 inbox |
| 普通 idle 兄弟、非面板创建 | 使用真实 startActivation 创建 delivery:parent 指导；idle followup / busy steer 分支被观察到；普通工作正常进入父历史 |
| 父重建、Host 重启 | 同 durable ID 的新父对象恢复已有指导并立即结算；真实旧 activation 的 exact-parent guard 生效；另一 Host 进程恢复已有指导、新建指导及普通工作均通过 |
| 运行中 panel HMR | 真实 HMR 事务更换 panel fiber，新 apply 用显式门控暂停；指导在门控放行前结算，独立 shield 和父 wrapper 保持不变；HMR 后新指导继续受保护 |
| 冷恢复立即结算 | 父重建及第二 Host 进程都执行立即完成的冷恢复；父 seq/inbox/结算 source 检查无污染 |
| sessionQuery 异步回退 | 无 live Session 时使用真实持久化 observation，身份/父关系正确且 lease 释放；取消、超时、clear/forget、对象替换和迟到回写有回归 |
| 卸载所有权 | 真实 Host 卸载 shield 服务时保留第三方外层 inject，旧闭包失活直通；单元覆盖两实例交叠的两种释放顺序、精确父释放和调用参数/receiver |
| 实际 desktop 部署 | 独立 bundle/link/两个 lock importer 已登记；冷启动 shield=active、inject=true；正常桌面组件显示运行中；既有 M3 指导可识别且父/指导日志哈希未变 |

实现证据见 [O2/R6 基线报告](../evidence/O2-R6-2026-11-02/report.md)，部署与备份见 [desktop 迁移报告](../evidence/O2-R6-desktop-migration-2026-11-03/report.md)。父重建后的新建 caller 准备轮不单独作为拦截证明；新父上新建 delivery:parent 指导的结算证明来自第二 Host 进程用例。旧 activation guard 是使用保留的真实 activation 对象调用原 Runtime 方法的定向探针，不宣称旧 activation 自然跨过重建仍在运行。

## 验证口径

- prepare：122 次断言，其中 O2/R6 32 项；restart：98 次断言，其中 O2/R6 8 项；两个阶段 errors=[]。基线断言存在重复，不把它们合计为 220 个独立场景。
- 已有回归：panel 8 个脚本、官方 Runtime 34 组、goal driver/join 12 项通过。
- desktop O6 为 idle/no-target-tools，registeredDefinitions=12、wrapperRecords=12；说明当前代码已加载，不代表本轮执行过用户真实模型 list/control。
- 本次收尾复核只读比对原始结果、16 个源码/测试入口哈希、当前 profile/junction 与备份，均通过；未重启 Host、未重跑模型或改写生产代码。复核记录见 [closeout-audit.json](../evidence/O2-R6-desktop-migration-2026-11-03/closeout-audit.json)。

## 当前所有权与保留边界

`@local/dsh-guide-shield` 独立 Host 服务持有结算防护。panel/provider/O6 的 HMR 或禁用不释放该服务；卸载服务自身时才失活和还原其仍持有的包装。子释放后的身份使用按精确父对象分组的一次性结算凭据，而非模块级 ID 集合；同步与异步均取首个自身 continuable / guide-fork descriptor。

以下仍在 [OPEN-ITEMS](../OPEN-ITEMS.md)，但不继续以 O2/R6 的未完成状态重复追踪：

| 事项 | 归属与边界 |
|---|---|
| 整个 Host 任意关闭/服务整体重建顺序、真实模型长时和多插件组合 | O11。当前真实 scoped closing 通过，不等于整个 Host graceful shutdown 的任意顺序均已验收 |
| shield 服务自身核心 HMR/卸载、未知宿主版本及 deprecated 同步 Session API 的替代/状态预检 | O21 兼容性与升级维护，并与 O11 服务图回归衔接。panel HMR 连续保护不延伸到保护服务自身被卸载的窗口 |
| 硬崩溃后的数据耐久性 | O11 平台故障范围；本次两进程恢复不等同于任意崩溃耐久性保证 |

profile 备份仅恢复本次登记状态。当前 panel 已依赖独立服务，完整行为回退还须配套迁移前 panel 版本；单独卸载 shield 会有意解除防护。

## 文档收口

本文件是 O2/R6 的单一收尾结论；`PROJECT-STATUS.md` 记录“已关闭”与入口，`OPEN-ITEMS.md` 只保留 O11/O21 等实际剩余事项。O6/O8 设计改用当前服务所有权和配置位置，任务清单消除旧的未部署/first-last 待办。历史报告、日志、JSON 和归档继续保留，不重写当时结论，不删除恢复资料。

# B′ 十项设计问题：代码核验与建议选择

> 实施复核更新：十项决定仍有效；原审计 BP-1～3 已修复，34 组 Runtime、86 项 Host、11 项浏览器通过，见 [整改验收](../evidence/B-prime-fixes-2026-11-02/report.md)。下文保留决定时的研究记录，“尚未验证”按当时范围阅读；旧研究脚本已退役回收，结果 JSON 保留。

日期：2026-11-02（Asia/Shanghai）。状态：Q1–Q10 已由用户确认并据此实施 B′；T4.1 真实 Host 44 项通过。本文保留研究建议与确认结论，当前实现见 [O6/O8 设计](O6-O8-DESIGN.md) §4.8 / [任务](O6-O8-TASKS.md) T4.1。关联 [执行边界研究](../evidence/O6-enforcement-boundary-2026-11-02/report.md)、[O6/O8 报告](../evidence/O6-O8-2026-11-02/report.md)。

## 总体建议

采用加强后的 B′：**注册时装饰原工具定义 + 启动/事件补扫 + 明确来源与兼容检查 + 取消终止 + native/PTC 最小端到端验收**。

只操作 list_agents、send_message、interrupt_agent 的原定义 execute；注册观察层转发其他工具。原 schema、render、标记和调度继续复用，不复制上游工具、不替换整套 tools 服务，不改全局 subagents/sessions，不依赖上游 PR。

新增复杂度集中在“安装、来源、生命周期和验证”，不重新引入可被覆盖的结果 hook 路径。

## 本轮实证

- [真实 Host 时序结果](../evidence/B-prime-decisions-2026-11-02/timing-results.json)：7 项断言。custom preset 在 agent/created 时已有工具；create resolve 后立即调用可被同步扫描覆盖。但 setup 可在发布前调用，另一个更晚注册的 prepend 串行 creation listener 也可先调用。注册时装饰覆盖了 setup 首调。
- [实际运行时探针](../evidence/B-prime-decisions-2026-11-02/decision-probes.json)：6 项。三个官方 execute 的函数文本相同；注册上下文能识别原模块 runtime 并保留 scope；原插件 runtime 的 fibers 可帮助识别已有定义；identity 会吞掉 caller abort；普通 Error 取消原因没有规范 ABORTED code；宿主 HarnessError 可保留取消语义并避免控制副作用。
- 使用安装包原 Cordis/ToolRuntime/Agent 注册与工具模块；模型为隔离的本机确定性适配器，不调用外部模型。时序探针只验证安装位置，不是 B′ 策略完整实现。
- 原 Agent.announce 用 serial 分发 agent/created；AgentLoop 先 await preset/setup，再 enter/announce；ScopedLayers 在插入后同步通知 tools/change。当前 identity.withObservation 的 catch 返回 undefined；ToolRuntime 仅对 HarnessError 提取结构化 name/code。

## Q1：枚举与共享定义

接受 global view + 所有 live agent 的可见视图，tools.get(name, agent)，按定义对象去重；agent/created 补扫，tools/change 重扫。被 restrict 隐藏的定义不计覆盖缺口，未暴露某个工具不代表失败。

agent/disposed 不能直接还原共享定义。覆盖统计按当前可见视图更新；记录释放还需看注册所有者/服务生命周期，不能维护无界的历史 agent ID 或定义集合。来源识别可读取原工具插件的 runtime/fibers，不需枚举 preset registry 或重新挂载各 revision。

## Q2：安装时序——事件扫描之外增加注册前装饰

不接受 A 的已知首调漏包作为正常保证；不把 B 的 pre-execute fallback 作为主要保障；暂不需要转 C。

探针证明仅给 agent/created 加 prepend 不能覆盖所有合法同进程调用：

1. setup 中挂好新 preset 后、agent 尚未进入 live registry，就可以直接执行工具。此时 tools/change 扫描 live agent 看不到它。
2. agent/created 是串行、可 await 的监听链。后来的 prepend listener 可在我们的扫描前 await tools.execute。

建议在 tools.register 的窄包装中，在三个目标定义进入 registry **之前**同步装饰，再调用原 register。tools/change 此后即使触发扫描，看到的也已经是包装定义。原 registering context/scope、返回 disposer 和其他工具必须保持；原注册失败时回滚本次新增装饰。

启动顺序为：装上注册观察层 → 对已有定义建立来源映射 → 同步扫描 global/live agent → 发布首轮状态。以后保留 created/change 作重扫、状态刷新与第三方更换的诊断。

这只接入一个注册方法，不接管 scheduler 或整个执行链；但它仍是需版本核验、所有权和卸载恢复的适配边界。研究探针验证了注册调用上下文与 scope，正式实施仍需完整事务/HMR测试。

未知/不可包装的定义显式降级，不能悄悄漏过且仍报 active。支持基线的 normal preset 必须闭合首调窗口才能完成验收。直接调用未注册函数、无事件篡改等不包含在保证中。

## Q3：状态——缺少能力不等于适配失败

接受 pending/partial 与面板提示，并建议再增加 **idle**，避免把“目前没有暴露任何目标工具”误报成 unsupported 或永远 pending。

| mode | 含义 |
|---|---|
| off | hideGuidance=false，整体关闭 |
| pending | 必需服务尚未就绪或首轮扫描尚未完成 |
| idle | 宿主契约有效、扫描完成，但没有当前可见且启用的目标定义 |
| active | 至少一个目标可见，当前全部可见且启用的定义均已支持并包装 |
| partial | 存在可见但来源未知、形状不支持、冻结或包装失败的定义；可包括 wrapped=0 |
| unsupported | tools/identity/注册或来源映射的必需契约不支持，无法可靠建立适配 |

list 存在而 send/interrupt 全部未暴露，仍可 active；缺少的控制工具标记 not-exposed，不算 partial/unsupported。一个 agent 的 preset 没有暴露 send_message 也不算缺口；如果有“原应存在却未加载”的额外证据，另报加载诊断，而非从缺失本身推定失败。

每个工具建议记录 enabled、visibleScopes、visibleDefinitions、wrappedDefinitions、unsupportedDefinitions 和 reason；按唯一对象统计定义，scope 单独计数。blockControl=false 时控制工具不计 required。

状态描述**最近一次扫描的包装覆盖率**，不等于保证所有身份均可判定、更不等于任意第三方输出绝不覆盖。面板只显示初始化/暂不可用/部分兼容等简明提示；内部来源、指纹和细分计数留 API/诊断。建议附 scanRevision，便于判断状态来自哪一轮扫描。

## Q4：来源与支持判据——不以 execute 文本哈希代替来源

不选“按名字一律包装”；单纯 name/function/render/schema 存在也不足以声称是官方受支持定义。

三个不同官方工具的 execute.toString 完全相同：defineTool 返回公共验证包装，真正实现藏在 userExecute 闭包里。给这段函数文本加哈希，只能识别公共包装模板，不能识别 list/send/interrupt 的实际语义；第三方调用 defineTool 也可得到同样文本。

建议三层核验：

1. 启动/服务重建时核验支持的 ToolRuntime、原 control 模块、原 list-agents 子路径产物版本/哈希；不每次调用读盘或重算哈希。
2. 注册观察层记录 definition 对象及真正注册者。可用 registering ctx 的 fiber.runtime 与 registry.get(导入的原模块) 比较；不要仅比较可伪装的 plugin name。探针已验证 runtime 身份与 scope 可取得。
3. 继续验证工具名、schema、执行/渲染契约和原 symbol 标记。已识别对象按身份缓存，不用长期增长的全局 ID 表。

已有定义的 bootstrap：通过原模块 runtime 的 live fibers，读取该 fiber scope 的可见目标定义，建立对应关系；探针已在 global + preset scope 验证。它不是对任意插件的安全鉴别，更不能检测过去无事件篡改的所有情况；这些仍受 Q7 边界约束。

第三方同名覆盖/克隆默认作为未知定义报告 partial，不因结构相似自动信任；确有兼容需求时添加显式适配判据。若未来决定支持“兼容形状即接管”，应作为独立模式明确命名，不能和原工具已核验混用。

来源映射/登记观察层不受支持时明确 unsupported；不把结构检查悄悄当作严格来源检查的回退。

## Q5：取消优先于未知身份

继续保留身份 undefined/内部查询超时/合法读取失败的 fail-open：未知条目保留，未知控制关系交原工具授权。但要区分三种情况：

- 缺少 identity 方法是接线/契约错误，应在预检时 unsupported，不属于运行时“身份未知”。
- identity 查询自己的超时、caller 仍活跃，按既定 unknown 处理。
- exec.signal 已取消，**终止调用**，绝不当 unknown 放行。

控制工具在查询前、每次 await 后、调用原 execute 前复查 signal；取消期间不得调用原 send/interrupt。原工具已经开始产生副作用后的取消沿用宿主收尾，不能宣称能撤回已发送消息。

list 原执行已完成而过滤期间取消，也返回取消结果，不把未经过滤的原数组作为成功值返回。无需撤销已经完成的读取，但不继续成功提交 value/content。

当前 identity.withObservation 会 catch caller abort 并返回 undefined，包装层必须独立复查；建议身份层也保留 caller cancellation 与自身超时的区别。不能 catch 全部异常后无条件执行原工具。

规范取消：单独 throwIfAborted 可能抛出任意 caller reason（如普通 Error），ToolRuntime 不会自动给它 ABORTED code。使用宿主 HarnessError 和已验证的 ABORTED 码/AbortError 名称，或等价的宿主公开转换方式；不复制整套 result materialization。核心在实际派发前取消仍负责 ABORTED_BEFORE_DISPATCH；包装已进入工具体后不能伪称尚未派发。

身份 observation lease、abort listener 和并发查询必须最终释放；不能为了更快返回而留下无主 promise/lease。

## Q6：单一路径，卸载与在途调用都处理

接受单一路径、明确 state；移除用于过滤/拒绝的 post/pre hooks，不保留临时运行时 fallback。host-hooks.js 仅在确认无消费者后删除；已有研究 fixture 可保留为历史。

wrapper/注册观察层都记录所有权与 active epoch。关闭时先失活，再只还原自己仍持有的指针；不覆盖第三方外层。**在 identity await 后也要复查 active/epoch**，不能只在函数入口判断：旧策略不能在配置关闭后恢复执行。caller 已取消仍优先终止。

反复 HMR 要验证旧 inactive 包装不会继续施策，也不会无界积累；对第三方包裹导致无法剥离的情况，用可失活的委托和明确边界处理，而不是强行覆盖第三方。

## Q7：保证边界

接受“支持宿主/原工具 + 正常注册/事件顺序”，不保证无事件直接改 execute 或任意后置 value/content 篡改。注册接入修复正常注册与首调窗口，不把它扩张为任意 JS 的隔离系统。

不新增定时轮询，不每次调用做磁盘/函数哈希；状态带最近扫描 revision。正常事件中发现未知替换时刷新 partial；没有事件、没有执行到我方代码的突变，不能承诺实时检测或面板即时准确。

## Q8：开关

保持已确认的主从关系：hideGuidance=false 整体 off；blockControl=false 只装饰 list；继续暴露 blockControl。当前没有新增需求要求把控制与目录过滤独立，不为状态重构改变产品语义。

## Q9：开发可分层，正式完成必须包含 native 与 PTC 的最小链路

不把真实 native tool-call 和实际 PTC 子调用都推到 O11。上一轮已经发现 tools.execute 探针可通过而 scheduler 绕过它，这正是只测便捷入口会漏掉的错误。

建议完成门槛分为：

1. 工具包装实现与直接/staged 管线测试通过，可称“实现完成”。
2. 最小真实 native agent loop：确定性模型发出 tool-call，检查写入 session 的 tool/result.content、不含指导、普通工作保留，以及控制拒绝前无副作用。
3. 最小实际 PTC runtime/sandbox：程序通过 tools.list_agents/send_message/interrupt_agent 子调用走真实 scheduler，检查 value、日志 content 和拒绝行为。不能只提供 fake scheduler 或直接注册探针工具来替代。
4. custom/default/guide、已有/新建/冷恢复、tools/change、卸载重载、开关关闭、冻结/未知定义、第三方替换、身份取消和结果/通知一致性通过，才能称“B′ 在声明支持范围内验收完成”。

native 使用本机确定性模型，不需要付费/外部模型；PTC 执行只做最小工具调用，不执行用户项目命令。运行环境确实不能测试某入口时，明确该入口未验证或不在本次支持范围，不能记为已通过。

真实外部模型长时、终端/文件/Git 全功能、多 pane 穷举、长时压力可留 O11。B′ 本轮不需要完成所有平台回归，但两个主要工具入口不能同时作为“以后再测”。

## Q10：不自动切换 C

只实现加强 B′，C 保留研究记录，不做运行时切换。未知第三方 scope 可明确 partial/unsupported；若已声明支持的 normal preset 仍漏包，应修复接入/验证或缩小支持声明，不能一边标 partial 一边宣称对应验收已完成。

若后来证明确实无法稳定拿到注册/来源边界，再单独讨论 C；不在一次失败后悄悄更换整套架构。

## 尚未验证的新增设计

当前探针没有交付完整来源管理、注册失败回滚、冻结定义克隆、tools 服务重建、注册观察层在第三方外层下的 HMR 清理，也没有运行本轮 proposed B′ 的完整 native/PTC 端到端策略。这些都是上述实施/验收要求，不能把本轮 7 + 6 项研究结果当作 B′ 已完成。

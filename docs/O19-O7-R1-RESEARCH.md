# O19 + O7/R1：名额门与容量口径研究

生产实现后续：生产实现、隔离验收及 desktop 冷部署已完成，O19/O7/R1 在约定支持边界内关闭，见 [实施记录](../evidence/O19-production-2026-11-03/report.md)。以下保留接入点研究当时的事实与决策，不作为当前生产代码状态。

日期：2026-11-03（Asia/Shanghai）。研究阶段状态：**用户已接受路线 B 与维护成本，两池快照/原生准入接入点验证通过；生产实现与迁移尚未进行，待办未关闭。** 本轮只新增隔离研究原型和证据，未修改生产代码或 desktop profile/配置。依据 [OPEN-ITEMS](../OPEN-ITEMS.md)、当前 panel/client、O2/R6 身份实现与已安装 DSH 0.2.1-rc.3 Runtime；最新实测见 [43 项真实 Host 接入点验证](../evidence/O19-O7-R1-seam-2026-11-03/report.md)。

## 已核实事实

已安装 `dsh-subagent/lib/index.js` 的 SHA-256 为 `9a9572e70fffdb100deb63326167f32bbf63016ce49c0017495dabcb95b44168`，与现有 [研究快照](../evidence/O18-driver-replacement-2026-11-02/sources/subagent.js) 字节一致。以下 Runtime 结论针对该产物，不扩展到未知版本。

| 项目 | 事实与影响 |
|---|---|
| 边界值 | resolveLimits 的 2/2、1/2 都得到 effectiveMaxGuides=1；maxGuides=0 被抬成 1。当前配置表达不了零指导预算 |
| 标签分类 | countRunningChildren 把改名指导计为 guides=0，把带“指导: ”的普通工作计为 guides=1；自身 descriptor classifier 已具备，可复用 |
| 查询失败 | catalog 抛错被当成空数组；探针得到 children=0、guides=0。这不是可信的“空闲” |
| 根范围 | panel 对所有 live durable 根的 descendants 求和；Runtime 用 resident 父的 pool，否则使用精确父对象的 rootPools。池沿连续 resident 运行链共享，不应仅按历史 header.parentSession 回溯来推定 |
| 实际占槽 | ActivationPool.slots.size 是原生占槽数；materialize 在重建之前 reserve，之后才发布 resident。包含创建中、closing 未释放、external 等占用 |
| catalog 的 running | listDescendants 用 sessions.get(childId) 是否存在生成 activity，而不是读取 pool。external 可无 Session 却占槽；创建中尚无 catalog；独立打开的旧子会话也不能据其历史父关系断言仍属于原池 |
| 客户端压力 | client 用所有 summary 的 origin=subagent、running=true 且未归档作为分子，除以单个 capacity；同样是跨根/加载视图，和原生槽位不是一个数据源 |
| 请求并发 | pendingStarts 是模块级全局数；请求跨根混算，进入 native 占槽后仍可能与 slot 重复计数，HMR 新模块也无法可靠继承旧请求状态 |
| 准入入口 | panel 只在 startThread 检查首次创建。原生 prompt 的 coldResume 直接进入 Runtime materialize，不经过面板门；只改首次入口无法保证续问遵守 reserve/maxGuides |
| 取样时机 | startLocal 在原生 reserve 之前还会 await resolveDirectory、prepareContinuable 等步骤。面板检查与实际占槽间存在普通工作抢占窗口 |

边界值、标签分类、查询失败三项已用当前生产函数的进程内假服务探针核对。后续新增真实 Host 实验已验证独立两池、创建中/closing/external/idle parked、跨池争 M、准备期间普通工作抢占及原生 coldResume；具体数值和未覆盖范围见 [接入点报告](../evidence/O19-O7-R1-seam-2026-11-03/report.md)。这些实测针对研究原型，不表示 panel 旧逻辑已修复。

容量数值目前能确认 panel 文件及既有 API 为 8/2/4，Runtime schema 的 maxActiveSubagents 默认 8，当前 desktop profile patch 未见覆盖。隔离 Host 已核对 service volatile getter 与 manager 均为 8，并验证 8→4→8 动态更新；**没有读取当前 desktop 进程的 volatile 配置或获得可核验的设置页读数，三方核对仍未完成。** 先前 UI 定位遇到输入几何不可用后已停止；后续实验仅另起隔离 Host，没有改桌面设置。

## 推荐口径

建议把三种限制分开：

- `capacity`：跟随 Host 当前有效 maxActiveSubagents，表示每个原生池的容量，不再由 panel 的固定 8 冒充权威值。
- `reserve`：按同一原生池约束指导占槽，普通工作可使用这些保留额度。
- `maxGuides`：建议暂保留“本 profile 全局活跃指导数上限”，与当前注释“一个用户最多四个”及全局统计方向一致；改为每池上限属于产品变化，需要明确决定。

设 C 为当前 Host 容量，R 为预留，M 为全局指导上限，S 为目标原生池的实际占槽，G 为全 profile 指导占槽（含已接纳的创建中指导，按唯一 token 去重）：

```text
B = max(0, C - R)
指导占槽前须满足：S + 1 <= B 且 G + 1 <= M
```

例如 A 池有 6 个普通工作、B 池为空，C=8/R=2/M=4：B 新建一个指导应可通过。当前跨根求和会用 6+1>6 拒绝 B。两个池各 4/8 时，各自压力应是 50%；把 8 个工作除以一个 8 会误报 100%。

“硬预留”不表示任何时刻必定空闲 R 槽——普通工作允许消费它。准确承诺应是：**指导不能在原生占槽的那个时刻把目标池推入最后 R 个额度。** 仅在 HTTP 请求起点读一次快照无法严格保证这条承诺。

## 实现路线与代价

| 路线 | 能做到什么 | 局限/建议 |
|---|---|---|
| A：只修 panel 门 | 零预算、descriptor 身份、目标池预检查、请求队列与状态诊断；改动相对小 | 可作为阶段一，但冷恢复与内部 await 后抢占窗口仍在，不能宣布全生命周期硬预留完成 |
| B：支持基线下的原生准入适配 | 在实际同步占槽边界识别 guide-fork，统一新建/非面板创建/冷恢复；普通工作保留原路径 | 推荐作为完整目标。需窄适配层、产物/函数及形状预检；验证同步调用契约、错误/取消、实例所有权与卸载，维护成本高于 A |
| C：Host 提供公开 admission/snapshot API | 权威计数和原子准入由宿主提供 | 长期最清晰，但需要上游接口，不能当作当前已可调用能力 |

当前 `manager`、`rootPools`、`resident`、`pool.slots` 和 `materialize` 都属于私有边界。读取时应选择 resident 父的 pool，或只读 rootPools.get(parent)，不能为读状态而调用会创建池的 rootPool()。不建议修改 slots Set、复制上游调度器或另建一套假信号量。

路线 B 的原 materialize 同步 reserve 边界已由真实 Host 验证：同一无 await 的临界段检查并交给原生占槽可关闭准备阶段的抢占窗口。活动/创建中指导的归属需要 token 和阶段转换，不能简单使用“resident + 所有 pending 请求”相加；原生 materializations 当前只保存 lineage、settled、controller，没有直接 provider 字段。跨池全局 M 的统一接纳记录已在原型验证，启动时已有 creating 的安全接管仍需实现。

策略的 Host 生命周期应独立于 panel UI/路由 HMR。可用独立 admission 组件或明确扩展稳定 Host 策略层；是否新增 bundle 是工程选择。不要未经决定把容量调度塞进已收尾的 settlement shield，也不要把异步 observation 放进同步占槽方法。

## 身份、未知状态与零预算

复用 O2/R6 的 origin、继承边界、首个自身 continuable/guide-fork descriptor。可直接利用原生入口中由官方新建/冷恢复逻辑导出的可信 provider/descriptor，但必须证明其与 classifier 等价，不按 label 或 guide preset 猜。

O6“隐藏整个指导后代分支”的结果不能拿来计数：指导派生的普通工作仍占 S，但不增加 G；归档记录、非运行指导和继承 guide preset 的普通孩子也不能误计为活跃指导。使用原始 Host 数据，避开工具/UI 已过滤的投影视图。

建议 C 为正整数，R/M 为非负整数；支持 M=0 禁止指导。R>=C 时有效预算为 0，以 admission blocked/reason 显示，保留 panel 查看能力、普通工作和 O2/R6 防护。R>C 可加配置诊断；不偷偷把预算抬为 1，也不自动改写用户 reserve。

不确定容量、查询失败或身份无法确定时，建议拒绝新增指导并说明“无法核实名额”，普通工作不受额外限制。所有未知仍计入已知原生 S；全局 M 不能核实时也不能当作 0。未知版本下应明确 unsupported/blocked；如果选择退回原生上限，则必须标明 reserve/maxGuides 暂不能保证。

## 压力与状态 API

建议为准入和自动归档提供同一 Host 容量快照，至少包含容量来源、目标池身份、used/reserved、创建中数量、指导数量/计数范围、unknown、更新时间和拒绝原因。state 对具体会话查询；不能继续只返回静态 8/2/4，再由各客户端重算实际占用。

归档压力推荐按该指导对应的当前运行池计算，不让 A 的负载导致 B 的闲置指导加速归档。若产品仍希望全局清理，应明确选择全局加权压力或最拥挤池压力；不能用全局分子除以一个池的容量。闲置指导无法映射当前池时，建议不因猜测压力而归档。

O7/R1 本轮可以改压力来源和分组，O20 的候选发现、主视图打开状态和扫描集成问题仍独立保留。归档仍不额外释放已经结算的槽；归档正在停止的工作，在 native release 前继续计入 S。

## 已接受方向与执行顺序

用户已接受建议和高维护成本，并授权先做两池权威快照及原生准入接入点验证：C 跟 Host；R 按池；M 保持 profile 全局；零预算可用且禁入；未知状态阻止新增指导；完整目标覆盖首次与 coldResume；归档按池压力。本轮已完成接入点验证，不将这项授权扩展为已完成生产改造或部署。

执行顺序：两池快照、隔离 Host volatile 值、原子准入接入点已验证（43 项通过）→ 实现稳定 Host 容量/身份/状态模块及 unknown/启动接管 → 覆盖指导 activation 入口与并发/取消/manager 替换/HMR → 接入 client 按池压力并回归 O2/R6 → 核对实际桌面设置/volatile/文件或 API，保存证据、迁移配置、回填台账。原型目前不覆盖服务 HMR 空窗，不能直接部署。

最小矩阵应包括：2/2、1/2、M=0、8/2/4；两根 A 满 B 空；设置值从 8 动态降为 4；创建中/closing/external/idle parked；改名与伪标签；指导的普通后代；同时两个 panel 请求、panel+普通工作、两池争全局 M；原生 coldResume/非面板创建；查询失败/未知版本；取消与 HMR 后无漏记/重复释放；归档前后与立即冷恢复。降容时建议不杀已有工作，超过新预算时阻止新指导，待占用自然回落。

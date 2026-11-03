# 当前未完成事项

更新：2026-11-03（Asia/Shanghai）。本文件只保留仍有实际后续工作的事项；已完成、已接受的限制及旧方案已从待办移到 [PROJECT-STATUS.md](PROJECT-STATUS.md)。原始问题、选项和用户决定完整保留在 [整理前清单](docs/archive/2026-11-02/before-cleanup/OPEN-ITEMS.md)。

O2/R6（含 O8 本机部署确认）已于 2026-11-03 在支持基线内关闭，最终判定见 [收尾结论](docs/O2-R6-CLOSEOUT.md)。O6 的 BP-1～BP-3 与支持基线验收也已完成。当前剩余工作继续按下表追踪；完整平台回归与版本兼容不能由单项关闭推定完成，建议顺序不代表授权实现全部项目。

## 1. 已定方向，尚未实现

| ID | 事项 | 当前事实 | 完成标准 |
|---|---|---|---|
| O12 | 旧布局提示 + 一键清理 | 用户已选择提示条与点击清理；当前仍只能手动关闭/清理旧 kind:guide 页签 | 只处理确认的旧指导项，保留其他 tab；检测、点击、异常与重复操作有验证 |

**O6 支持基线内验收完成**：34 组真实 Runtime、86 项 Host、11 项浏览器通过；BP-1 首调、BP-2 取消/卸载、BP-3 来源状态均有修复与正向回归。O6/O8 实际部署确认已完成；O11/O21 独立工作仍保留，范围见 [修复报告](evidence/B-prime-fixes-2026-11-02/report.md)。

O8 与 O6 共用可信身份判据，但隐藏目录不会自动拦住 inject。识别按 settlement source/sender，不能只按任意正文包含“指导”或结算文案来丢弃消息。

## 2. 仍需验证或调整的技术问题

O19 / O7 / R1 已于 2026-11-03 在约定支持基线和准入核心冷更新边界内完成生产实现、隔离验收及实际 desktop 部署，见 [实施与关闭证据](evidence/O19-production-2026-11-03/report.md)。C 跟 Host、R 按原生池、M 按 profile 全局；设置页与实际 Host getter/API 均为 C=8，策略 R=2/M=4。旧 panel label/catalog/pendingStarts 门已移除，client 接入同源按池压力。以下 O20/O21/O11 独立范围继续保留。

### O20：自动归档的发现范围与集成验证

当前事实：

- 客户端 `scan()` 只从 `list.projectionsBySession` 里的 `subagentCatalog` 枚举指导，没有用面板 `records` 兜底；父会话 projection 未加载时，该指导不会进入自动归档。
- `threadOpen()` 只检查 `sidebarRight.tabsIn(seat)`；通过主视图 fallback 打开的指导可能被判为未打开。
- O7 已新增真实 `scan()` 的可控时钟/stores 集成，覆盖按池压力、峰值保持、busy/unknown 与查询失败；候选发现/主视图 fallback/归档失败重试等完整矩阵仍未覆盖。

待做：

- 明确“只归档当前已加载会话”是否是产品选择；若不是，用 `records` 补全，并处理 localStorage 过期、父会话删除和记录与 catalog 不一致。
- `threadOpen()` 覆盖主视图 fallback；运行中、已归档、未知状态仍不归档。
- 给 `scan()` 加可注入 stores/clock 的集成测试：压力档、打开 tab、归档失败重试、重复扫描不重复归档。

完成标准：在“父会话已加载/未加载、tab 打开/主视图打开、运行/闲置/已归档”组合下行为符合文档；README 不再承诺未覆盖的范围。

### O21：guide-panel / guide-shield 宿主契约预检与兼容状态

当前事实：

- 两个 adapter 有产物哈希/版本检查；O6 已对 `tools.register`/精确注册层/来源/identity 做 5 个源码哈希与契约预检，状态为 `modelProjection: unsupported/partial`。升级须重验精确注册层的存活/注销语义。
- `guide-panel` 仍直接使用 `prepareContinuable`、`startActivation`、`sessionTitle.rename`、`sidebarRightTabs`、`slots` 等私有形状，没有统一预检。
- DSH 升级后这些形状变化时，表现是运行时通用错误，而不是明确“不支持/回退”状态；README 的“未知产物回退原行为”覆盖 driver/join/sidebar 和 O6 工具来源，但不覆盖整个 panel。

待做：

- 纳入独立 guide-shield 的官方 descriptor fold、deprecated 同步 Session 读取与服务自身核心 HMR/重建边界；panel HMR 已验收，不把它扩写成保护服务自身被卸载时也连续生效。
- 在 host 半启动时做统一的最小契约预检（必需服务/函数/关键字段），不通过时给出 `panelCompat: { mode: 'unsupported', reason }`；不注册半套 tab/路由。
- `/guide/api/state` 暴露兼容状态；面板显示简明提示；已知支持基线通过。
- 明确“只能降级到面板不可用/只读”还是“引导用户重启/回滚”，并写入 README 升级段。

完成标准：支持基线通过；模拟缺少服务/函数变化时，面板给出可诊断状态而不是静默失败；测试覆盖。

### R5：浏览器同源 SSE 排队

M3/M4 曾观察多个 plugins/events SSE 占满同源 HTTP/1.1 连接，使 guide API 在浏览器排队，而直接 Host 请求正常。最新隔离浏览器通过不能证明多插件/长时环境已修复。

待做：在当前真实插件组合复核能否再现，记录连接和请求时间线，再决定合并连接或其他改法。历史现象不应直接归因于名额门或 shield。

### O11 / LI 后续平台回归

核心验收已通过；剩余覆盖范围：真实模型长时使用、原生各 Stop 入口、真实 PTY 命令交互、文件编辑/保存、Git 提交、多 pane/多 tab 组合、第三方后续包装、服务整体重建及所有加载顺序/导入失败/不兼容组合。自动归档 low 600 秒档未做完整计时实测，high/mid/C3 已有历史实测。

O2/R6 已覆盖真实 scoped closing 与 panel HMR；整个 Host graceful shutdown 的任意服务关闭顺序、shield 服务整体重建及硬崩溃耐久性继续在此归口，不作为 O2/R6 残留重复追踪。

这是覆盖范围，不表示上述功能均存在缺陷。优先补真实使用中出现的具体问题；版本升级后必须重新审查私有边界与指纹。

O19/O7/R1 本轮浏览器 11 项功能通过；reload/unload 期间记录 `agent-opens` WebSocket 提前关闭和 `Session reference ... is released` 两条 sidebar 诊断，见 [实施记录](evidence/O19-production-2026-11-03/report.md)。保留后续定位，不声称零错误，也不直接归因于准入门。准入核心自身更新使用冷重启；连续 HMR 执法不在已接受支持边界内。

### O17：名额语义的独立复测（可选）

运行占槽、结算释放、闲置不占已有用户实验报告和源码依据；专门的 maxActiveSubagents=1 独立脚本复测尚未补齐。O7/R1 的零预算和容量 1/2/8 已验；本专项仍为可选，不重复设一项产品决策。

## 3. 尚未决定的产品取舍

| ID | 仍需要决定的部分 | 当前默认行为 |
|---|---|---|
| O5 | 自动归档调度器保留、默认关闭还是简化 | 保留既有 A1/B1/C3；归档只清理列表，不释放已归还的槽 |
| Q7 | 指导专区跟当前 scope 还是根会话 | 保持当前 scope；原任务树以根会话为根，在子会话主画布里可能出现专区为空 |
| Q4 | 核心会话行“子智能体运行中”转圈是否调整 | 沿用宿主显示；主会话可独立回复，转圈不代表主会话被锁住 |

Q7 的**底部独立滚动区已确认并实现**，不再追问布局高度这一轮选择；折叠和批量操作仅为可选后续，未形成必须实施的需求。接受“运行中占一个槽”的名额语义也已经确定，不再询问是否追求完全不占。

## 4. 工程维护与分发

| ID | 当前缺口 | 后续 |
|---|---|---|
| R4 | 工作区根及六个自有包尚无统一 Git 历史；测试没有 CI | 确定版本管理范围、忽略依赖/fixture/恢复记录的策略；加最小 CI 跑现有测试；本轮文档快照不是完整代码版本库 |
| O10 | 六个自有包没有通用安装、升级、发布与版本策略 | 当前 adapter 有本机安装/恢复脚本；补升级 runbook（升级后重算哪些 driver/join/sidebar 指纹、如何回退）、panel/preset 完整卸载路径、peer 范围与支持矩阵、license/author/repository/changelog；是否自用、统一打包或发布市场仍待决定 |
| R7 | sidebar adapter 的 `client.js` 由 `build.mjs` 手工生成；安装不 build；`core.test.mjs` 只测 core | 加 `build --check` 或 CI diff 检查；测试加载生成后的 client；README 明确构建步骤 |
| R8 | `guide-preset` 依赖用户级 `guide` skill，未随自有包分发，README 包清单未列 | 声明依赖并在安装脚本/文档中检查；或让 persona 在技能缺失时降级；补测试 |
| R9 | 面板 locale 里 `showArchived` / `hideArchived` / `noArchived` / `archivedTag` 等 key 已不再使用；README 已改为当前“始终显示归档项”的行为 | 删除无用 key，或恢复“显示/隐藏已归档”开关；补渲染断言，避免文案与 UI 再次漂移 |

旧 fork PR、build+copy 和其全量 vitest 已退出生产维护路径。需要维护的是两个 adapter 的兼容边界，而非重新开启 fork 维护。

## 5. 已移出待办的内容

| 原条目 | 收口结论 |
|---|---|
| O19 / O7 / R1 | 生产代码、43 项生产 Host 断言、44 项核心检查、按池 scan 集成、O2/R6 回归及 desktop 冷部署完成；核心采用冷更新，见 [实施记录](evidence/O19-production-2026-11-03/report.md) |
| O2 / R6（含 O8 部署确认） | 实现、隔离矩阵及实际 desktop 迁移闭环；支持基线内已关闭，见 [收尾结论](docs/O2-R6-CLOSEOUT.md)；O11/O21 独立范围仍保留 |
| O18 / O3 | 支持基线下 goal 等待指导已修复；保守等待边界写入方案 |
| O11 核心任务页 | 官方树/图、计数、auto-open、专区、重挂与刷新已验；仅扩展回归留在上文 |
| R2 / R3 / O9 | 官方产物已核对；旧 fork 测试/PR 不再阻塞运行 |
| O13 | 用户接受完整 seed 成本，不优化、不省 token |
| O14 | v1 不专门支持嵌套 |
| O15 | 接受归档后其他 UI 仍可能可见/可输入，不补菜单项 |
| O4 | 编号作为历史别名保留，当前按具体 ID 追踪，不再为定义 M5 追加产品问题 |
| O16 | 文档重新分工；过时原文已归档，见整理记录 |

建议后续顺序：O12 → O20/O21；R4/R7/R8/R9/O10 作为工程基线并行。R5 按能否复现推进。产品取舍和发布不阻塞本次两阶段交付，也没有在本次文档整理中被擅自改成新行为。

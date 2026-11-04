# O11 验证缺口与补测脚本计划

更新：2026-11-04（Asia/Shanghai）。状态：**P0 已完成本轮基线（MP-1～MP-7 通过；GF-1～GF-6 功能断言通过，整体 `known-diagnostic`）；P1 PTY 的 PT-1～PT-5 通过、PT-6 用户决定暂缓（保留历史 workspace-write `failed` 与无沙箱隔离对照 45/45 通过）；P2 历史 RM-1/2/4/6 小样通过；当前 RM-3/5 接受宿主默认机制，RM-7 接受复制成本、长时资源验证改为可选；扩展实测未执行；G0 的 C-1～C-10 通过（C-10 为 rc.5 不支持版本拒绝 + rc.3 回滚）**。执行记录见 [P0 多 pane 报告](../evidence/O11-validation-2026-11-03/report.md)、[P0 Git/文件编辑报告](../evidence/O11-validation-2026-11-03/p0-git-file-edit/report.md)、[P1 PTY 报告](../evidence/O11-validation-2026-11-03/p0-pty/report.md)、[P2 真实模型报告](../evidence/O11-validation-2026-11-03/p0-real-model-soak/report.md) 与 [G0 基线报告](../evidence/O11-validation-2026-11-03/p0-compat-baseline/report.md)。本文件把 O11 中“版本/第三方兼容”和“多 pane、真实模型、PTY、Git”两类覆盖缺口拆成可执行的补测项；不代表 P1/P2 已经整体通过，C-10 也仅证明“不支持版本明确拒绝 + 回滚”而非成功的 rc.5 升级。

关联：[OPEN-ITEMS](../OPEN-ITEMS.md) 的 O11、[架构说明](ARCHITECTURE.md)、[本机维护](LOCAL-MAINTENANCE.md)、[证据索引](../evidence/README.md)。

## 0. 范围与约定

### 范围

1. **兼容门禁**：支持基线内源码/形状/所有权检查；合成第三方包装与不支持版本的降级行为。
2. **运行场景**：多 pane/多 seat、Git/文件编辑保存、PTY、真实模型长时使用。

### 非目标

- 不追求“任意 DSH 版本、任意第三方包装”都自动兼容；只验证“该降级时明确降级”。
- 不恢复 v1 明确不做的嵌套指导、跨会话文件锁。
- 不在普通 CI 中调用外部真实模型；真实模型 soak 为本地、显式启用、成本受控。
- 不修改真实 desktop profile；所有测试使用隔离 DSH_HOME / Edge profile。

### 证据与结果

每个补测项输出到新目录：

```text
evidence/O11-validation-<YYYY-MM-DD>/
  report.md
  result.json
  logs/
  screenshots/
  fixtures/          # 临时仓库、终端脚本等可重建输入
```

`result.json` 至少包含：`status`（passed/failed/blocked/known-diagnostic）、`scenario`、`sourceVersions`、`startedAt`、`finishedAt`、`assertions[]`、`errors[]`、`knownDiagnostics[]`、`evidence[]`。

### 结果分级

- `passed`：断言全部通过。
- `known-diagnostic`：出现已登记诊断（如 reload 期间 sidebar WebSocket 提前关闭），功能断言仍通过并保留日志。
- `failed`：功能断言失败，必须记录复现步骤和最小现场。
- `blocked`：环境/凭据/夹具不具备，不能记为通过。

---

## 1. 现有覆盖（避免重复补测）

| 已覆盖 | 证据 |
|---|---|
| 真实 Host 生命周期：closing、panel HMR、父重建、两进程恢复 | [O2/R6 报告](../evidence/O2-R6-2026-11-02/report.md) |
| 真实 Runtime 34 组，Host 86 项，浏览器 11 项（1.1.0 为 90 项、11+2 项） | [B′ 整改报告](../evidence/B-prime-fixes-2026-11-02/report.md) / [1.1.0 实施](../evidence/O12-O21-engineering-2026-11-03/report.md) |
| 官方任务页树/图、多指导、计数、auto-open、归档/恢复、文件列表、Git/sidechat 组件渲染、适配器卸载重启 | [阶段二报告](../evidence/LI-stage2-2026-11-02/report.md) |
| 准入 C/R/M、closing/external/idle parked、零预算、冷恢复 | [O19 生产实施](../evidence/O19-production-2026-11-03/report.md) |
| 终端 tab 描述符/实现保持、服务转发、直接会话查找 | [阶段二报告](../evidence/LI-stage2-2026-11-02/report.md) 的验证边界 |
| Git/sidechat 只验证原组件渲染，**不是** Git 提交/完整编辑 | 同上 |

**仍未覆盖**：多 pane 组合、真实 PTY、Git/文件编辑端到端、真实模型长时、任意第三方包装/任意版本。

---

## 2. 优先级

你给的顺序是“先多 pane + Git，再 PTY，再真实模型 soak”。我保留这个顺序，并把“版本/第三方兼容”列为**升级触发的门禁**，不占用一次性场景顺序：

| 轨道 | 优先级 | ID | 项目 | 触发时机 |
|---|---|---|---|---|
| 场景 | P0 | MP / GF | 多 pane + Git/文件编辑 | 当前即可执行 |
| 场景 | P1 | PT | 真实 PTY | P0 完成后 |
| 场景 | P2 | RM | 真实模型 soak | 前两项稳定后，按需 |
| 门禁 | G0 | C | 版本/第三方兼容矩阵 | 每次宿主升级、或每次新增第三方插件 |

G0 可以在 P0 之后、P1 之前并行做；它不是“功能场景”，而是“换版本前必须过的检查”。

> **执行进展（2026-11-03）**：P0 已完成本轮基线。多 pane（A1）MP-1～MP-7 **7/7 `passed`**（36 项断言，0 条浏览器 console error）；Git/文件编辑（A2）GF-1～GF-6 **6/6 功能断言通过**，整体因 2 条已登记 sidebar 诊断记 `known-diagnostic`。结果见 [P0 多 pane 报告](../evidence/O11-validation-2026-11-03/report.md) 与 [P0 Git/文件编辑报告](../evidence/O11-validation-2026-11-03/p0-git-file-edit/report.md)。P1/P2/G0 未开始。

---

# 3. P0：多 pane + Git/文件编辑（已完成本轮基线）

> **当前任务范围**：用户决定保留归档设计，接受同 child 强制重复视图的清理边界；Git 业务及原生编辑器关闭保护不列为指导插件整改项。后续测试计划不自动升级为必须实施的任务，详见 [任务边界决定](SCOPE-AND-ACCEPTED-LIMITS.md)。历史 failed／未测仍按原事实保留。

> **补测进展（2026-11-04）**：Git tab 原生 stage/commit UI 通过；真实 25%／50%／75% 压力下，自动归档短延迟三档及打开视图保护通过。同 child 强制双 pane 后归档，实测只关闭一个页签；原生右栏编辑器未保存关闭无确认弹窗。本轮检查未修复，不能把两个 UI 边界记为通过。当前结果与 R5 扩展观察统一见 [残留项复核](../evidence/O11-residual-check-2026-11-04/report.md)；下文 2026-11-03 的未测说明保留为当时记录。

## 3.1 缺口清单

### 多 pane / 多 seat（MP）

| ID | 当前状态 | 缺口 | 风险 | 验收条件 |
|---|---|---|---|---|
| MP-1 | 浏览器只覆盖单 seat 的任务页 | 两个 pane 同时打开任务页/指导页 | 重复页签、错误 seat、布局溢出 | 两个 pane 独立渲染；各自 tab 列表正确 |
| MP-2 | 未验证同一指导多 seat 打开 | 同一 child 在两个 pane 打开 | 关闭/归档一个影响另一个 | 关闭一个页签后另一个仍可用；归档行为有明确断言 |
| MP-3 | 面板归档只按 `sessionId` 找 tab | 归档时另一个 pane 仍打开 | 死页面、会话状态不一致 | 归档不破坏另一 pane 的可见状态；`archivedSessionIds` 正确 |
| MP-4 | Q7 C 混合专区刚实现，未覆盖多 seat | 子会话/根会话分组在不同 seat 的表现 | 分组错 seat、根组重复 | 各 seat 的分组和按钮作用域正确 |
| MP-5 | 刷新/HMR 只验证单页 | 多 pane 刷新、tab 恢复、适配器重挂 | 丢失页签/悬空引用 | 刷新后可从持久化记录恢复；无重复注册 |
| MP-6 | 自动归档的 `threadOpen` 有跨 seat 检查，但未真实组合 | 一个 pane 打开时自动归档是否跳过 | 误睡仍打开的指导 | 打开于任一 pane/主视图时 auto archive 跳过 |
| MP-7 | 未覆盖 2-pane 上限/关闭重开 | 打开上限、关闭顺序、空 pane | 状态泄漏、无法重新打开 | 达到上限后行为可解释；关闭后能重新打开 |

> **MP 执行结果（2026-11-03）**：MP-1～MP-7 全部 `passed`。已验证两个 pane 独立渲染、关闭隔离、强制同 child 双实例的关闭隔离、双 pane 下归档、Q7 C 根会话分组、适配器重挂与整页刷新、`threadOpen` 守卫、2-pane 上限与空 pane 重开。重要边界：宿主不提供 pane 级 `tabsIn`，pane 归属从 `data-dockkit-*` DOM 读取；同 child 双 pane 需要 `revealIfOpened:false`，正常打开会去重；归档空 pane 会收起该栏（宿主布局行为）。详见 [报告](../evidence/O11-validation-2026-11-03/report.md)。

### Git / 文件编辑（GF）

| ID | 当前状态 | 缺口 | 风险 | 验收条件 |
|---|---|---|---|---|
| GF-1 | 测试 workspace 不是 Git 仓库 | 指导修改文件后主会话看到内容 | 用户看到的仍是旧内容 | 文件内容与磁盘一致；编辑器刷新可见 |
| GF-2 | 无并行写测试 | 主会话与指导同时修改同一文件 | 最后写入覆盖/未提示 | 当前无锁行为被记录；不谎称冲突已解决 |
| GF-3 | 仅渲染 Git 组件 | diff/stage/commit/branch | Git 状态未验证 | diff 内容正确；提交成功；branch 状态正确 |
| GF-4 | 文件编辑/保存未端到端 | 编辑器保存、EOL、草稿保护 | 保存丢失/EOL 改变 | 保存后磁盘内容正确；EOL 保持 |
| GF-5 | 未覆盖多 pane 同文件 | 同一文件在两个 pane 打开 | 旧内容覆盖新内容 | 明确当前行为并记录风险 |
| GF-6 | 未覆盖 Git 状态刷新 | 文件变更后 Git tab 刷新 | 状态过期 | 变更后状态刷新到一致 |

> **GF 执行结果（2026-11-03）**：GF-1～GF-6 功能断言 6/6 通过，整体 `known-diagnostic`（2 条已登记 sidebar 连接诊断）。关键实际行为：无锁并行写时宿主以 `FS_STALE_VERSION` 拒绝过期写，没有静默覆盖；原生编辑器保存保留 CRLF；同一文件双 pane 保存后另一 pane 仍是旧内容；Git tab 在重新可见时刷新。GF-3 用 Git CLI 核对 diff/commit/branch，未走 Git tab 提交 UI；GF-4 的未保存草稿关闭确认未测。详见 [报告](../evidence/O11-validation-2026-11-03/p0-git-file-edit/report.md)。

## 3.2 脚本 A1：多 pane 浏览器矩阵

**建议位置**：扩展 [browser_test.py](../guide-sidebar-adapter/test/browser_test.py)，增加 `scenario: "multi-pane"`，不复制一套 Playwright 启动代码。

**执行状态（2026-11-03）**：已按此位置实现并运行。入口为现有 [smoke.mjs](../guide-goal-adapter/scripts/smoke.mjs)（`--sidebar --integration`）加 `DSH_SMOKE_SCENARIO=multi-pane`；结果写入 `evidence/O11-validation-2026-11-03/p0-multi-pane/`，精选结果为 [result.json](../evidence/O11-validation-2026-11-03/result.json)。实际实现仍由 smoke 传 `entryUrl`/`parent`/`output`/`scenario`；`guides` 由 `/li-runtime/add-guide` 创建，不依赖示例里的 `guides`/`panes` 字段。

**入口约定**：继续使用 stdin JSON：

```json
{
  "entryUrl": "http://127.0.0.1:<isolated-port>/",
  "output": "evidence/O11-validation-2026-11-XX/p0-multi-pane",
  "parent": "parent-session-id",
  "guides": ["guide-a", "guide-b"],
  "panes": 2,
  "scenario": "multi-pane"
}
```

**步骤**：

1. 打开隔离 Host 的 Edge 页面，等待 `window.__liFixture`。
2. 打开任务页，确认 `[data-guide-tasks-adapter]` 和 `[data-task-section="guide:threads"]`。
3. 在第一个 pane 打开 `guide-a` 的 subagentchat；在第二个 pane 打开同一指导或 `guide-b`。
4. 检查两个 pane 的 tab inventory、地址、可见性。
5. 在 pane 1 关闭页签；检查 pane 2 不变、`right.openTabs` 与 `tabsIn(seat)` 一致。
6. 从面板归档 `guide-a`；检查 `archivedSessionIds`、另一 pane 的状态、页签残留。
7. 在子会话主画布打开任务页，检查 Q7 C 的“本会话 / 根会话其他指导”分组。
8. 刷新一个 pane，检查另一个不受影响；必要时重挂适配器后再检查。
9. 打开第三个 pane（达到上限），记录拒绝/替换行为。

**断言**：

- 无重复 tab、无重复任务区；
- 关闭一个 pane 不影响另一个；
- 归档只处理目标会话，不误关其他指导；
- `threadOpen` 打开中的指导不被自动归档；
- 控制台只允许已登记诊断（记录为 `known-diagnostic`）。

**证据**：`multi-pane-result.json`、`pane-1.png`、`pane-2.png`、`console.json`、`tab-inventory.json`。

## 3.3 脚本 A2：Git / 文件编辑

**建议位置**：新增 `scripts/validation/git-file-edit.mjs`，复用 `guide-goal-adapter/scripts/smoke.mjs` 的隔离 profile 启动方式。

**执行状态（2026-11-03）**：已用现有隔离 Host 链路实现，未单独新建 `scripts/validation/git-file-edit.mjs`。core 段在 `guide-goal-adapter/test/host-fixture.mjs` 的 `POST /li-runtime/gf` 中执行（真实 parent/guide、真实 `read`/`write`/`edit`、临时 Git 仓库）；UI 段由 `browser_test.py` 的 `scenario: "git-file-edit-ui"` 执行（原生编辑器/Git tab）。结果目录 `evidence/O11-validation-2026-11-03/p0-git-file-edit/`，精选结果 [result.json](../evidence/O11-validation-2026-11-03/p0-git-file-edit/result.json)。

**夹具**：

- 临时目录初始化 Git 仓库；
- 初始文件 `notes.txt`（LF 与 CRLF 各一份）；
- 隔离 DSH_HOME，不触碰真实 profile；
- 确定性 fixture 模型负责触发指导的 fs 工具；主会话只读检查；
- 如需要 UI 刷新，再通过 `browser_test.py` 的 `entryUrl` 打开同一隔离 Host。

**场景**：

1. 指导写 `notes.txt`，主会话读取：内容一致。
2. 指导追加中文/多字节内容，检查编码。
3. 指导修改 CRLF 文件，检查 EOL 保持。
4. 主会话与指导并行写同一文件：记录最终内容；明确“无锁、最后写入者胜”或实际行为。
5. `git diff` 显示指导改动；`git add` + `git commit` 成功；`git status` 干净。
6. 主会话打开编辑器，指导再次修改，检查刷新（若有自动刷新）。
7. 多 pane 打开同一文件，记录刷新/覆盖行为。

**证据**：`git-file-edit-result.json`、`git-log.txt`、`diff.txt`、文件哈希/EOL 记录。

## 3.4 P0 退出条件

> 2026-11-03：MP-1～MP-7 已完成（7/7 `passed`）；GF-1～GF-6 已完成（6/6 功能断言通过，整体 `known-diagnostic`）。本轮 P0 退出条件已满足；P1/P2/G0 未开始。

- MP-1～MP-7 全部有结果（pass / known-diagnostic / fail / blocked）；
- GF-1～GF-6 全部有结果；
- 失败项有最小复现和影响说明；
- 不把“没有崩溃”当作通过，必须有内容/状态断言；
- 更新本文件与 [OPEN-ITEMS](../OPEN-ITEMS.md)。

---

# 4. P1：真实 PTY（PT-1～PT-5 通过；PT-6 暂缓）

## 4.1 缺口清单

| ID | 当前状态 | 缺口 | 风险 | 验收条件 |
|---|---|---|---|---|
| PT-1 | 只验证终端 tab 描述符/服务转发 | 真实 PTY 创建与命令输出 | 命令无法执行/输出丢失 | 命令退出码与输出正确 |
| PT-2 | 无交互 stdin | 向终端发送输入 | 交互式程序卡住 | stdin 可达，程序响应 |
| PT-3 | 未验证终端取消 | Ctrl-C / Stop / 关闭终端 | 进程孤儿、无法中断 | 进程退出，无残留 |
| PT-4 | 未验证多终端 | 两个终端/pane 切换 | 输出串台/焦点错误 | 各自输出独立；关闭互不影响 |
| PT-5 | 未验证 resize/ANSI/长输出 | 窗口尺寸、颜色、截断 | 渲染错乱/截断 | 关键内容可见，resize 后仍可用 |
| PT-6 | 用户决定暂缓；现有设计保留 | 历史 Windows 沙箱启动失败待后续恢复处理 | 未覆盖默认沙箱可用性 | 恢复时保持 sandbox policy，核对指导输出/状态 |

> **PT 最新结果（2026-11-04）**：默认 workspace-write 的 PT-1～PT-5 passed，PT-6 failed，terminal_open 报 shell 启动退出。真实指导已获得六个当前工具。用户授权的隔离无沙箱对照中 PT-6A／PT-6B／cleanup 共 45/45 通过，原生工具结果卡足以展示命令、输出和当次状态，无需新增按钮。旧测试的旧工具名、错误 ID、parent 身份问题已修正；旧报告“工具注入默认关闭”的归因撤回。PT-5 实际重排限制保留。详见 [PT-6 实施报告](../evidence/O11-validation-2026-11-04/pt6/report.md)。

> **本日后续决定**：用户决定暂缓 PT-6 的进一步实现和宿主排障，保留现有原生结果卡与测试，作为阶段性设计。历史失败不改写为通过；本轮转入 RM-3／RM-5／RM-7 研究，不以 PT-6 为前置。

## 4.2 脚本 B1：PTY 矩阵

**建议位置**：`scripts/validation/pty-matrix.mjs`，或扩展 `browser_test.py` 的 `scenario: "pty"`。

**执行状态（2026-11-04）**：browser_test.py 支持完整 `pty` 和独立 `pt6` 场景。PT-1～PT-5 使用 webTerminals；PT-6 使用真实指导 native tool-call 与用户可达的原生结果卡。smoke 显式传播 failed／blocked 和非零退出码。结果与模式限定见 [本轮汇总](../evidence/O11-validation-2026-11-04/pt6/result.json)。

**前置**：隔离 profile 需包含真实 terminal bundle（使用当前 desktop 组合的隔离副本）；不修改真实 profile。

**步骤**：

1. 在临时目录启动隔离 Host。
2. 打开终端 tab；运行 `pwsh -NoLogo -Command "Write-Output 'pty-ok'"`（Windows）。
3. 运行等待输入的程序，发送文本，检查回显/输出。
4. 发送 Ctrl-C；检查退出码/提示，`Get-Process` 确认无残留。
5. 再开一个终端，运行不同命令，切换 pane，检查输出独立。
6. resize 终端；检查提示符与输出仍正常。
7. 让指导执行一个命令；在主会话/终端页核对结果。

**证据**：`pty-result.json`、终端输出文本、进程列表快照、截图。

## 4.3 P1 退出条件

> 2026-11-04：PT-1～PT-5 通过；PT-6 默认 workspace-write failed，P1 未关闭。无沙箱对照 45/45 通过只证明限定模式下的指导调用和原生展示链路，不能替代沙箱验收。

- 所有 PT 项有结果；
- 无孤儿进程；
- 跨 pane 输出不串台；
- 终端取消/关闭行为可解释。

---

# 5. P2：扩展真实模型验证（当前首轮方案接受默认机制，长测可选）

> **2026-11-04 研究更新**：本轮只作静态研究，无外部模型调用。已确认宿主具备压缩／重试／token 投影，旧 soak 的预算与指标采集仍需修正。推荐顺序：观测与预算底座 → RM-5 离线故障 → RM-3 离线压缩 → RM-7 本地长测 → 另行授权真实模型验收。机制通过与真实模型通过分别记录，RM-3/5/7 当前仍 blocked。详见 [研究方案](HISTORY-AND-MAINTENANCE-NOTES.md)。

> **本日后续验收取舍**：用户优先首轮指导。经源码确认，guide 使用原生预设的 persona／compaction 组件和共享 Host 重试；接受继承上下文与成本，不追加本轮长时优化。RM-3／RM-5 的设计验收按宿主默认机制收口，RM-7 的成本／复制策略接受，长时资源趋势验证为非阻塞可选项。历史测试 blocked 保留，不宣称运行测试通过；首轮装配要求保留。详见 [验收决定](RM-ACCEPTANCE-DECISIONS.md)。

## 5.1 缺口清单

| ID | 当前状态 | 缺口 | 风险 | 验收条件 |
|---|---|---|---|---|
| RM-1 | 只使用确定性 fixture 模型 | 真实 provider 首次对话 | 认证/模型不兼容 | 能正常创建/回复 |
| RM-2 | 未覆盖长 goal + 指导并行 | 多轮 goal 与 2–3 指导 | 死锁、无限轮、资源泄漏 | 达到预定轮次/时限后正常结束 |
| RM-3 | 当前设计接受宿主 persona／压缩 | 完整长上下文验证可选 | 语义漂移或压缩失败未实测排除 | 保留首轮装配约束；扩展压测不作本轮门禁 |
| RM-4 | Stop 只覆盖部分路径 | 任意时刻 Stop/冷恢复 | 卡死、状态损坏 | Stop 后能恢复/继续 |
| RM-5 | 当前设计接受共享 Host 重试机制 | 完整故障注入可选 | 实际故障恢复未新增实测 | 采用所选 provider 的宿主策略，不作插件独立重试承诺 |
| RM-6 | 未覆盖多指导并发 | 3 个指导 + goal | 名额竞争/调度错乱 | C/R/M 行为符合预期 |
| RM-7 | 复制／成本取舍已接受；长测可选 | slot/tab/内存/日志长时趋势 | 长时退化未实测排除 | 非阻塞观察，实际出现累积时针对复现排查 |

> **RM 执行结果（2026-11-03）**：真实 `deepseek-official` / `deepseek-chat` 在隔离 Host 中完成 1 次普通对话、6 轮 goal、3 个指导并行和 goal pause/resume；3/3 指导 resolved ok。RM-1/RM-2/RM-4/RM-6 `passed`；RM-3（长上下文/compaction）、RM-5（provider 错误）、RM-7（长时/token 指标）`blocked`。实际耗时 22.9 秒，30 分钟/200k 预算上限未达到；token 用量未从 session events 取得，不能声称长时 soak 通过。详见 [P2 报告](../evidence/O11-validation-2026-11-03/p0-real-model-soak/report.md)。

## 5.2 脚本 C1：真实模型 soak

**建议位置**：`scripts/validation/real-model-soak.mjs`。

**执行状态（2026-11-03）**：未单独新建脚本；在 `host-fixture.mjs` 增加 `soak` 路由（后台启动真实模型场景，浏览器只轮询小状态），由 `browser_test.py` 的 `scenario: "soak"` 驱动。凭据从桌面 DSH home 复制到隔离 home，未打印；结果目录 `evidence/O11-validation-2026-11-03/p0-real-model-soak/`。

**启用方式**：仅本地、显式环境变量；不进入 `npm test`、不进入 CI。

```text
DSH_GUIDE_SOAK=1
DSH_GUIDE_SOAK_PROVIDER=<provider>
DSH_GUIDE_SOAK_MODEL=<model>
DSH_GUIDE_SOAK_MINUTES=30
DSH_GUIDE_SOAK_MAX_TOKENS=<budget>
DSH_GUIDE_SOAK_OUTPUT=evidence/O11-validation-<date>/p2-real-model
```

**场景**：

1. 真实模型一轮普通对话，确认鉴权/流式/tool-call。
2. 启动 goal，创建 2–3 个指导；让它们并行、追问、Stop、冷恢复。
3. 在预定时点 Stop 一个指导，再继续；记录 slot/G 变化。
4. 让上下文接近压缩阈值，确认 compaction 后对话仍连贯。
5. 注入/等待 provider 超时或限流（若可控），确认错误可见且不会无限重试。
6. 结束前记录 `/guide/api/state`、slot 数、打开的 tab 数、日志大小。

**指标**：

- 轮次、延迟、token 使用、错误数；
- `admission.used` / `globalGuides` 是否回到基线；
- 打开 tab 数、监听器/包装记录是否增长；
- 是否出现死循环、卡死、未处理拒绝。

**证据**：`real-model-result.json`、状态快照（脱敏）、日志摘要；不保存用户凭据/完整隐私内容。

## 5.3 P2 退出条件

> 2026-11-03：真实 provider 的 goal+3 指导+pause/resume 通过，23 秒内结束；未达到 30 分钟/200k 的预算上限，也未执行 compaction/provider 错误/长时指标。P2 未整体关闭。

- 在预算内完成或明确中止；
- 无卡死、无未处理拒绝、无持续增长；
- Stop/恢复可用；
- 失败有分类（模型、网络、插件、宿主），不归因于未验证项。

---

# 6. G0：版本 / 第三方兼容门禁（C-1～C-10 通过；C-10 为不支持版本拒绝 + 回滚）

## 6.1 缺口清单

| ID | 当前状态 | 缺口 | 验收条件 |
|---|---|---|---|
| C-1 | 源码/函数/形状 pin 已实现 | 没有统一跑完全部 pin 的矩阵脚本 | 每个 pin 缺失都得到预期状态 |
| C-2 | 各包有 unsupported 分支 | 没有系统化验证“不支持的版本” | panel 只读、admission blocked、shield off、goal native、sidebar native |
| C-3 | 第三方外层包装部分覆盖 | 没有合成 wrapper 的固定用例 | 正确组合时功能仍生效；绕过时状态可解释 |
| C-4 | execute 替换/无事件篡改有已知边界 | 缺可重复 fixture | 记录 `partial`/unsupported，不假装 active |
| C-5 | materialize 所有权变化有检查 | 缺真实 manager 替换组合 | 返回 unsupported/blocked，不静默放行 |
| C-6 | shield 只还原自己指针 | 缺冻结/外层替换用例 | partial/off 明确，旧 wrapper 失活 |
| C-7 | 单 sidebar adapter 冲突有检查 | 缺第二 adapter 用例 | 拒绝重复接管，官方侧栏可用 |
| C-8 | 单 goal driver 有检查 | 缺后置 patch 重新启用 | 启动明确失败，不双 driver |
| C-9 | 冷更新有流程 | 缺一次可重复的升级演练 | 停 Host → 更新 → 冷启动 → 状态核对 |
| C-10 | 指纹只保证基线 | 缺“升级时必须重验”的清单 | 每次升级有证据，不直接改 pin 过关 |

> **G0 执行结果（2026-11-03）**：基础门禁 `npm test`、`build:check`、默认浏览器回归通过；fake-host 矩阵 **13/13 检查通过**。**C-1～C-10 全部 passed**：五类不支持路径、execute 无事件替换、materialize ownership、冻结/外层 wrapper、第二 sidebar adapter、单 goal driver、panel bundle 冷更新；C-1 已补 disabled 原 driver 检查（冷启动 smoke 仍 ready），C-3 原失败是夹具缺少 `this.ctx.fiber.runtime`（修正后 active）。**C-10**：DSH 0.2.1-rc.5 launcher 在挂载前拒绝 rc.3-pinned guide bundles，`/guide/api/state` 404；回滚 rc.3 后 panel/goal/shield 恢复 ready/active。**注意**：C-10 验证的是“不支持版本明确拒绝 + 回滚”，不是成功的 rc.5 升级；受支持升级仍需未来重跑。详见 [G0 报告](../evidence/O11-validation-2026-11-03/p0-compat-baseline/report.md)。

## 6.2 脚本 D1：兼容矩阵

**建议位置**：`scripts/validation/compat-matrix.mjs`，可用 Node 直接构造 fake host，不必启动完整浏览器。

**执行状态（2026-11-03）**：已实现部分矩阵 [compat-matrix.mjs](../scripts/validation/compat-matrix.mjs)（13 项 fake-host 检查，11 通过、2 失败）；另有 [C-9 冷更新演练](../evidence/O11-validation-2026-11-03/p0-cold-update/result.json)（guide-panel bundle 1.1.0 → 1.1.1，同隔离 home 冷启动，panelCompat 仍 ready）。C-1/C-3 仍有缺口，C-10 仍缺 DSH/Cordis/better-sidebar 升级与 pin 重验/回滚。

**用例**：

| 用例 | 注入 | 期望 |
|---|---|---|
| baseline | 当前官方包 | 各包 ready/active |
| panel source mismatch | 临时复制 panel + 改一个哈希 | `panelCompat.unsupported`，不挂半套 |
| model source mismatch | 改 `dsh-tools` 副本 | `modelProjection.unsupported`，不假装 active |
| admission materialize mismatch | 改 materialize 函数 | `guideAdmission.unsupported/blocked`，面板拒绝新增 |
| shield source mismatch | 改 dsh-subagent 副本 | shield `unsupported`，不安装包装 |
| goal driver mismatch | 改 driver 副本 | `native`，仍可启动 |
| sidebar version mismatch | 改 better-sidebar 副本 | adapter `native`，原侧栏可用 |
| tools.register outer wrapper | 外层包裹 register | 仍能包装三个工具；卸载不破坏外层 |
| execute replaced w/o event | 注册后直接替换 execute | `partial`/unsupported；记录可绕过点 |
| materialize outer wrapper | 外层包裹 materialize | 若调用链经过我们仍生效；owner 变化则 unsupported |
| parent method frozen | 冻结 followup/steer/inject | shield `partial`；不强行改写 |
| second sidebar adapter | 注册第二个 ownership | 明确拒绝/降级 |
| duplicate goal driver | 后置 patch 重新启用 | 启动失败，提示恢复配置 |
| cold update | 隔离 profile 停/启 | 新 bundle 加载；旧 wrapper 不残留 |

**要求**：

- 每个用例断言“状态 + 是否放行 + 是否半挂载”，而不只是进程退出码；
- 对无法保证的第三方行为，记录为已知边界，不写成通过；
- 不通过修改哈希值让预检通过。

## 6.3 G0 升级门禁清单

每次 DSH/Cordis/better-sidebar/client-modules 变化：

1. 记录新版本、构建号、安装路径、关键文件 SHA-256。
2. 对照当前 `SUPPORTED_SOURCE`、contracts、materialize/driver/join、sidebar client hash。
3. 在隔离 profile 运行 `npm test`、`build:check`、`doctor`。
4. 运行真实 Host、真实 Runtime、浏览器回归；保存新证据目录。
5. 停 Host，冷更新准入/shield 核心；不要用 HMR 代替。
6. 检查 `/guide/api/state`：`panelCompat`、`guideAdmission`、`settlementShield`、`modelProjection`、`goalAdapter`。
7. 保存回滚组合；失败则停在旧基线。
8. 不在未重验的情况下只改 pin。

## 6.4 G0 退出条件

> 2026-11-03：C-1～C-10 通过（C-1 已补 disabled 原 driver 检查；C-3 为夹具上下文修正；C-9 为 panel bundle 冷更新；C-10 为 rc.5 不支持版本拒绝 + rc.3 回滚）。**成功升级仍需未来受支持版本重跑 §6.3**；本结论不承诺 rc.5 可用。

- 所有 C 项有结果；
- 不支持版本四个组件都明确降级；
- 正确组合的第三方 wrapper 不破坏核心行为；
- 升级演练有回滚证据。

---

# 7. 脚本与目录规划

| 脚本 | 用途 | 复用 |
|---|---|---|
| `guide-sidebar-adapter/test/browser_test.py`（扩展 multi-pane 场景） | 多 pane UI | 现有 Edge/Playwright fixture |
| `scripts/validation/git-file-edit.mjs` | Git/文件编辑 | 隔离 Host + `smoke.mjs` 启动方式 |
| `scripts/validation/pty-matrix.mjs` | PTY | 隔离 Host + 当前 desktop 组合 |
| `scripts/validation/compat-matrix.mjs` | 版本/第三方 | panel/goal 的隔离 fixture |
| `scripts/validation/real-model-soak.mjs` | 真实模型 | 隔离 profile + 真实 provider |

**不要**把多 pane/Git/PTY/真实模型加进 `npm test` 默认集合；`npm test` 保持无外部依赖的确定性回归。

---

# 8. 执行顺序与工作量

| 阶段 | 内容 | 预计 |
|---|---|---|
| 1 | 多 pane 浏览器矩阵（2026-11-03 已完成） | 0.5–1 天 |
| 2 | Git/文件编辑（2026-11-03 已完成） | 1–2 天 |
| 3 | 兼容矩阵（C-1～C-10 通过；C-10 为不支持版本拒绝 + 回滚） | 1–2 天 |
| 4 | PTY 矩阵（PT-1～PT-5 完成；PT-6 用户决定暂缓） | 保留现状，恢复时再定位 |
| 5 | 扩展真实模型 soak（当前默认机制设计已接受，完整长测可选） | 非本轮交付前置 |

P0 完成后先更新一次状态；不要等全部场景做完才回填证据。

---

# 9. 完成定义与保留边界

- 每个缺口有 `passed / known-diagnostic / failed / blocked` 记录。
- 失败项有最小复现、日志、影响说明；不以“未复现”代替“已通过”。
- 已知诊断（如 reload 期间 WebSocket 提前关闭）单独分类，不混入失败或通过。
- 不在本计划中承诺：任意版本、任意第三方包装、所有加载顺序、硬崩溃耐久性、嵌套指导、跨会话文件锁。
- 本计划执行后，更新 [OPEN-ITEMS](../OPEN-ITEMS.md) 的 O11；仍未被覆盖的组合继续保留，不因本计划整体移动为“已完成”。
- 2026-11-03 关闭 P0 的 A1 多 pane 与 A2 Git/文件编辑；P1 PTY 的 PT-1～PT-5 完成，PT-6 blocked；P2 的 RM-1/2/4/6 完成，RM-3/5/7 blocked；G0 的 C-1～C-10 通过（C-10 为 rc.5 不支持版本拒绝 + rc.3 回滚）。多 pane 的后续窄项：同一 child 强制双 pane 后再归档、`archive.auto` 短延迟档下的压力调度。GF 的后续窄项：GF-3 的 Git tab 提交 UI、GF-4 的未保存草稿关闭确认、GF-2 的失败方重读重试。PTY 的后续窄项已更新：PT-6 在无沙箱隔离对照中完整通过，默认 workspace-write 的 Windows 模型终端启动仍失败；真实 xterm 尺寸下的 resize 重排仍待验证。RM 的后续窄项：真实 30 分钟/200k 长时、compaction、provider 错误注入、冷重启。G0 的后续窄项：§6.2 合成矩阵与冷更新演练。

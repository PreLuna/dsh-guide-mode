# 工作区地图

更新：2026-11-04（Asia/Shanghai）。本文只描述**本机工作区**的目录职责与去留规则，不重复产品语义；产品行为见 [架构](ARCHITECTURE.md)、[状态台账](../PROJECT-STATUS.md)、[待办](../OPEN-ITEMS.md)。

## 0. 一句话结论

工作区 = **一个 Git 仓库（102 个文件、源码约 0.6 MB）** + **三个被 .gitignore 排除的本机目录**（`evidence/` 72.1 MB、`dist/` 1.0 MB、`docs/archive/` 4 KB）。

全工作区 2367 文件 / 74.8 MB：`evidence/` 1827 文件 72.1 MB（96%）、`.git` 327 文件 0.9 MB、其余工作树 213 文件 1.8 MB。

源码侧已经很干净：没有 `node_modules`、没有 `__pycache__`、没有临时文件。**体积和文件数的压力全部来自 `evidence/`**，把它排除后整个工作区不到 2 MB。

> 2026-11-04 本轮整理：删除 `dist/.npm-cache/`（18 个文件）与全部 `evidence/*/isolated-home/`（57 个目录、4927 个文件、64.45 MB、660 个内部链接）。`evidence/` 从 6754 文件 / 136.6 MB 降为 1827 文件 / 72.1 MB；整理后 `npm test` 与 `npm run repo:check` 仍通过。

## 1. 顶层一览

| 路径 | 文件数 | 体积 | 入 Git | 作用 |
|---|---|---|---|---|
| `guide-panel/` | 27 | 0.24 MB | 是 | 主插件：`guide-fork` provider、`/guide/api`、面板与专区、自动归档 |
| `guide-sidebar-adapter/` | 21 | 0.16 MB | 是 | 官方 better-sidebar 的局部数据视图与任务组件装饰；`client.js` 为生成物 |
| `guide-goal-adapter/` | 13 | 0.12 MB | 是 | 在私有 subagents 作用域复用原 driver/join |
| `guide-shield/` | 8 | 0.03 MB | 是 | 独立 Host 结算防护；`contracts.js` 记录契约哈希 |
| `guide-admission/` | 6 | 0.02 MB | 是 | 原生同步准入、容量／身份／按池快照 |
| `guide-preset/` | 3 | 0.01 MB | 是 | `guide` persona 与工具面 |
| `docs/` | 9 | 0.07 MB | 8 个 | 当前设计文档（见 §2.2） |
| `scripts/` | 7 | 0.04 MB | 是 | 维护入口脚本（见 §2.4） |
| `.github/workflows/test.yml` | 1 | 0 | 是 | Windows/Node 24 最小 CI：`repo:check` + `test` |
| `evidence/` | 1827 | **72.1 MB** | 否 | 本机原始验收证据（见 §2.3） |
| `dist/` | 110 | 1.0 MB | 否 | 1.1.0 离线发布快照（见 §2.1） |
| `docs/archive/` | 1 | 4 KB | 否 | 旧入口占位，仅指向历史摘要 |
| 根 4 个 md + `LICENSE` + `package.json` 等 | 8 | — | 是 | 入口文档与工作区脚本定义 |

## 2. 四个重点目录

### 2.1 `dist/` — 离线发布快照（可整目录重建）

**不是杂物，但也不是源码。** 由 `npm run pack:local`（[package-local.mjs](../scripts/package-local.mjs)）生成，输出到 `dist/<版本>-<commit>/`：

```text
dist/1.1.0-0f5b302404d0/
├── local-dsh-guide-*.tgz          6 个自有包的 npm 包（336 KB 合计）
├── dsh-guide-mode-1.1.0-0f5b302404d0.zip   该 commit 的源码 ZIP（264 KB，122 条目）
├── source-for-verification/dsh-guide-mode/  ZIP 解出的 101 个文件，用于核对 ZIP 未损坏
├── manifest.json                  版本、commit、逐文件 sha256/integrity
└── SHA256SUMS.txt                 7 个归档的 sha256
```

**为什么看起来"重复了三遍"**：同一棵源码树在这里以 ZIP、解包副本、6 个 tgz 三种形态各存一份，而它们的源头 `0f5b302` 本身又在 `.git` 里。这是**刻意的**——[REPOSITORY-PREPARATION](REPOSITORY-PREPARATION.md) 要求 tgz 从 Git ZIP 的字节生成，以避开 Windows 换行转换，解包副本用来独立复核。

**整理规则**：
- 整个 `dist/` 可以随时删除，重新 `npm run pack:local` 即可再生；删除前确认 `git status` 干净，否则快照与 commit 不再对应。
- `.npm-cache/`（npm 临时缓存，18 个文件）已于本轮清理；下次打包会重新生成，可再删。
- 这里保留它是因为它让"换台机器、不 clone 也能装"成立。**体积可以忽略（1.1 MB），不建议为省空间删掉整份。**

### 2.2 `docs/` — 当前设计文档（8 篇跟踪 + 1 个本机占位）

| 文件 | 回答什么问题 |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | 当前代码怎么实现：provider、seed、adapter、准入、shield |
| [SCOPE-AND-ACCEPTED-LIMITS.md](SCOPE-AND-ACCEPTED-LIMITS.md) | 哪些是原生组件的事、哪些是已接受的设计边界 |
| [RM-ACCEPTANCE-DECISIONS.md](RM-ACCEPTANCE-DECISIONS.md) | RM-3/5/7 的验收取舍与理由 |
| [O11-VALIDATION-PLAN.md](O11-VALIDATION-PLAN.md) | 验证缺口清单与补测口径（31 KB，最长的一篇） |
| [LOCAL-MAINTENANCE.md](LOCAL-MAINTENANCE.md) | 本机安装／升级／卸载／回退流程与必须重验的边界 |
| [REPOSITORY-PREPARATION.md](REPOSITORY-PREPARATION.md) | 私有仓库范围与本地打包规则 |
| [HISTORY-AND-MAINTENANCE-NOTES.md](HISTORY-AND-MAINTENANCE-NOTES.md) | 已退役方案提炼出的可复用经验（替代已删的旧 fork 与旧台账） |
| [WORKSPACE-MAP.md](WORKSPACE-MAP.md) | 本文：目录职责、体积构成与回收边界 |
| `archive/README.md` | 仅 3 行占位；`docs/archive/` 被 .gitignore 排除，不上 GitHub |

**整理规则**：`docs/` 按"当前事实 / 已接受边界 / 历史经验"三分，不再新增同主题的第二篇；新的阶段性说明先写进 `evidence/<日期>/report.md`，稳定后再提炼到本地。

### 2.3 `evidence/` — 原始验收证据（72.1 MB，**不能按缓存删**）

24 个按日期／事项命名的目录，每个是一次隔离验收的现场。**索引在 [evidence/README.md](../evidence/README.md)**，那里逐条写了"有效保留内容 / 阅读边界"和清理规则。

当前两阶段交付相关（下表为 `evidence/README.md` 中的主表）：

| 目录 | 用途 |
|---|---|
| `O12-O21-engineering-2026-11-03` | 1.1.0 本机实施、Git/CI/生成物/六包装卸回退 |
| `O19-production-2026-11-03` | 生产准入实现 + desktop 冷部署（C/R/M=8/2/4 的出处） |
| `O19-O7-R1-seam-2026-11-03` | 两池快照与原生准入接入点原型 |
| `LI-stage2-2026-11-02` | 官方包核验、局部 UI、完整 Host/浏览器验证 |
| `LI-stage1-2026-11-02` | goal 局部注入与回退 |
| `O2-R6-desktop-migration-2026-11-03` | shield bundle 实际部署与差异审计 |
| `O2-R6-2026-11-02` | 结算防护生命周期验收 |
| `B-prime-fixes-2026-11-02` / `B-prime-audit-2026-11-02` | B′ 整改验收 / 修复前审计 |
| `O6-O8-2026-11-02` / `O6-enforcement-boundary-2026-11-02` | 工具投影与注册观察层研究 |
| `O11-validation-2026-11-03` | P0 多 pane、Git/编辑、PTY、真实模型补测 |
| `O11-live-check-2026-11-04` | 当前工作区插件组合确认 |
| `O11-residual-check-2026-11-04` | 多 pane／Git 残留与 R5 补测 |
| `O11-validation-2026-11-04` | PT-6 诊断（无顶层 report，正文在 `pt6/report.md`） |
| `repository-prep-2026-11-04` | 旧文件清理清单／回执、私有仓库与快照验证 |
| `M2`/`M3`/`M4`/`M5-A-2026-11-01` | 早期运行、冷恢复、goal 推迟根因、自动归档实测 |
| `O18-*` / `B-prime-decisions` | 启动替换、局部注入研究、决策探针 |

**体积构成（这决定了什么能删、什么不能删）**：

| 类别 | 文件数 | 体积 | 占比 | 能否回收 |
|---|---|---|---|---|
| `LI-stage2/official/package`（官方 0.28.2 解包副本） | 479 | 23.0 MB | 32% | 可从同目录的 4.6 MB tarball 重新解包；本机重装/官方消费测试依赖它 |
| `LI-stage2/desktop-before`（安装前桌面备份） | 498 | 19.4 MB | 27% | **不可删**，回退脚本依赖 |
| 截图 `.png`（多个日期目录） | 118 | 13.4 MB | 19% | 有 10 余组 sha256 完全相同的副本可去重 |
| 结果 JSON（`result.json`／`runtime-result.json`／…） | 311 | 11.0 MB | 15% | 同一探针多次运行会有近似副本，保留最终版即可 |
| 其余报告、日志、源码快照 | 421 | 5.3 MB | 7% | 不建议删 |
| `*/isolated-home/`（隔离 profile 与会话日志） | 0 | 0 | 0% | **已于本轮回收**（原 4927 文件 / 64.5 MB / 660 个内部链接） |

单个目录体量：`LI-stage2-2026-11-02` 41.8 MB（58%）、`O11-validation-2026-11-04` 6.6 MB、`O11-validation-2026-11-03` 5.7 MB、`O11-residual-check-2026-11-04` 4.9 MB、`M2-2026-11-01` 3.2 MB，其余均小于 3 MB。

**两条硬约束（不要对 `evidence/` 执行 `Move-Item` 或整体压缩）**：
1. 目录里仍有 **7 个软链接／junction**，其中 5 个是**绝对路径**（`official/package/node_modules` → `C:\Users\wang\.dsh\profiles\desktop\node_modules`；三处 `@local/dsh-guide-shield` → 工作区的 `guide-shield/`；一处 `staged/evidence/LI-stage2-2026-11-02` → 同级真实目录）。移动或改名会让它们一次性失效。本轮清理前这里有 667 个，其中 660 个已随 `isolated-home` 一并移除。
2. 文档与 `report.md` 之间用相对路径互相引用（`evidence/README.md`、`docs/O11-VALIDATION-PLAN.md`、`PROJECT-STATUS.md` 都有链接指向具体日期目录），目录名即路径。

**整理规则**（与 [evidence/README.md](../evidence/README.md) 一致）：`report.md`、最终 result/audit JSON、关键截图保留；`desktop-before/`、`official/` 保留原位；`isolated-home/` 属可重建状态。`scripts/check-repository.mjs` 已明确跳过 `evidence/` 的链接校验，所以它天然不入库、也不会影响 CI。

### 2.4 `scripts/` — 维护入口（7 个文件，全部入库）

| 文件 | 对应命令 | 作用 |
|---|---|---|
| [workspace.mjs](../scripts/workspace.mjs) | `npm run doctor` / `npm run profile:prepare` | 校验六包元数据与 guide skill；生成安装/卸载/回退计划 `plan.json` |
| [apply-profile.ps1](../scripts/apply-profile.ps1) | 手动调用 | 执行 `plan.json`；再核对停机、junction、候选哈希，失败恢复 |
| [package-local.mjs](../scripts/package-local.mjs) | `npm run pack:local` | 产出 §2.1 的离线快照 |
| [check-repository.mjs](../scripts/check-repository.mjs) | `npm run repo:check` | 拦截不该入库的产物，并校验文档内相对链接 |
| [test.mjs](../scripts/test.mjs) | `npm test` | 汇总运行各包回归 |
| [validation/compat-matrix.mjs](../scripts/validation/compat-matrix.mjs) | — | 兼容矩阵（16 KB，最大的一支） |
| [r5-browser.py](../scripts/r5-browser.py) | 手动调用 | R5 浏览器连接问题的复现脚本 |

`doctor`／`prepare` 都要求提供新的输出目录，从不覆盖既有 `plan.json`；这是有意的安全设计，整理时不要"顺手"改成固定输出路径。

## 3. 六个代码包的分工

按依赖方向：`guide-preset`（人格）→ `guide-panel`（会话与 UI）→ `guide-admission` / `guide-shield`（准入与结算，独立 Host）→ `guide-goal-adapter` / `guide-sidebar-adapter`（复用原 driver 与官方 sidebar）。

`guide-sidebar-adapter/client.js` 是**生成物**，由 `core.js` + `client.entry.js` 生成；改完后 `npm run build --prefix guide-sidebar-adapter`，否则 `build:check` 会失败。

## 4. 根目录四个 Markdown

| 文件 | 定位 |
|---|---|
| [README.md](../README.md) | 产品说明、安装、能力与边界（对外入口） |
| [PROJECT-STATUS.md](../PROJECT-STATUS.md) | 当前交付与已定决定台账（对内，14 KB） |
| [OPEN-ITEMS.md](../OPEN-ITEMS.md) | 未完成事项（11 KB） |
| [CHANGELOG.md](../CHANGELOG.md) | 版本变更，含 Unreleased 中的本地未发布改动 |

## 5. 保留与回收一览

| 可以做 | 不要做 |
|---|---|
| 删 `dist/` 后重新 `npm run pack:local` | 删除 `evidence/LI-stage2/desktop-before` 或 `official/package` |
| 删 `dist/.npm-cache/`（每次打包重生） | 移动／改名 `evidence/` 下任何目录 |
| 删 `evidence/*/isolated-home/`（已执行：-64.5 MB，会丢 session 细节） | 把 `evidence/` 打成压缩包后删除原目录（可读性归零） |
| 删 sha256 重复的截图副本（约 1 MB） | 删 `docs/*.md`（CI 会校验链接目标） |
| 在 `evidence/<新日期>/` 下记录新一轮验收 | 复用旧日期目录写新结果 |
| 需要时重新解包 `LI-stage2/official/package` | 删 `LI-stage2/desktop-before` |

## 6. 常用命令

```powershell
npm test                 # 无需安装 DSH 的回归
npm run repo:check       # 入库边界 + 文档链接
npm run doctor           # 六包元数据与 guide skill
npm run build:check      # client.js 生成物一致性
npm run pack:local       # 重建 dist/ 离线快照
```

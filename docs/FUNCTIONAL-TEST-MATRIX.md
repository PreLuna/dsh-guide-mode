# 功能核对与测试清单

更新：2026-11-16。当前交付/待办以 [项目状态](../PROJECT-STATUS.md) 为准。功能主体已完成；本表第 1 节记录**按现有实现生效**的能力，第 2 节只列真正未实现的扩展能力，第 3 节列实现已有但覆盖仍需扩展的验证。5A～5E 与 manager 1.3.0 已发布并完成独立 Electron E-07；真实 Edge 浏览器 UI 仍未单独验收。

## 1. 已完成的能力（按现有实现）

| 能力 | 当前实现 | 验证 / 证据 |
|---|---|---|
| 指导会话与上下文 | 独立 `guide-fork` provider；seed 取父会话最后一个 completed turn 之前的事件，同时指定 `guide` preset；首次 delivery:caller，后续可冷恢复 | [架构](ARCHITECTURE.md) / panel 测试 |
| goal 并行与准入 | 独立 goal adapter 复用原 driver/join；可信直属指导不阻挡续轮，普通工作、pending、external、closing、身份未知仍等待 | [goal 报告](../evidence/LI-stage1-2026-11-02/report.md) / [生产准入](../evidence/O19-production-2026-11-03/report.md) |
| 名额与容量 | C 跟 Host、R 按原生池、M 按 profile 全局；原生同步占槽前检查；零预算禁入 | [O19 实施](../evidence/O19-production-2026-11-03/report.md) |
| 模型工具面 | `list_agents` 隐藏指导及其后代；模型 `send_message`/`interrupt_agent` 到指导分支被拒；普通工作与孩子回报放行 | [O6 修复](../evidence/B-prime-fixes-2026-11-02/report.md) / `guide-panel/test/model-projection.test.mjs` |
| 结算防护 | 独立 Host shield 包装父 `followup`/`steer`/`inject`，丢弃已登记指导的 settled 通知；panel HMR 不卸载 | [O2/R6 验收](../evidence/O2-R6-2026-11-02/report.md) |
| sidebar 局部视图 | 官方 0.28.2 + 独立 sessions facade；树/图/计数/auto-open 共用过滤结果，底部独立专区混合分组 | [阶段二报告](../evidence/LI-stage2-2026-11-02/report.md) |
| 归档 | 手动归档停止执行、保留历史、可取消并重新打开；自动归档保留能力、默认 `auto:false`，显式开启后按 25%/50%/75% 压力扫描 | [O12/O20/O21](../evidence/O12-O21-engineering-2026-11-03/report.md) / `guide-panel/test/scheduler*.test.mjs` |
| 管理页基础 | 官方插件页「指导」tab；六组件、依赖边、宿主 BOM/产物、`guide` skill 与 skills manager 深链；兼容门禁、热/冷切换、reload 与 patch 回滚 | [Phase 1–4 验收](../evidence/O23-four-phase-acceptance-2026-11-05/report.md) |
| 5A 首次安装 | 可信本地发布目录、推荐组合、依赖闭包、精确计划、停机安装、失败恢复与会话运行核对 | [5A 验收](../evidence/phase5-acceptance-2026-11-07/report.md) |
| 5B 升级与版本恢复 | 有限兼容组合、最小联动、稳定缓存、四文件与旧 tgz 备份、失败修复、显式恢复 | [5B 证据](../evidence/phase5b-2026-11-07/report.md) |
| 5C 卸载、修复、自升级 | 依赖卸载与 preset 保护、goal 原生 driver 恢复、SHA 原包修复、独立控制器自升级与外部恢复 | [5C 证据](../evidence/phase5c-2026-11-07/report.md) |
| 5D 发布与公开源 | schema 4 发布清单、固定提交七包、草稿/正式发布；默认公开源检查、按闭包下载、SHA/tar 校验、缓存与离线恢复 | [发布格式](PHASE-5D-RELEASE-FORMAT.md) / [真实 5D-4](../evidence/phase5d4-2026-11-09/report.md) |
| 5E link 来源迁移 | 七包 link 清点、源码内容差异、目标 tgz 准备、精确迁移计划、停机执行器、四文件/源码快照、旧 importer 清理、失败回源、快照恢复、`/migration` API 与 MigrationCard；真实 pnpm 隔离迁移及独立 Electron E-07 通过 | [5E 方案](PHASE-5D-5E-IMPLEMENTATION-PLAN.md) / `guide-manager/test/migration.test.mjs` / [隔离证据](../evidence/migration-acceptance-2026-11-16/report.md) / [E-07](../evidence/migration-e07-2026-11-16/report.md) |
| 管理页自动执行 | manager 1.3.0 首次安装、独立/联动升级、版本恢复、修复、卸载及同协议管理器升级；确认后自动停机执行、重启、返回指导页并核对 | [面板执行](PHASE-5-PANEL-EXECUTION.md) / [执行证据](../evidence/one-click-2026-11-09/report.md) |
| 本机来源切换与升级 | 2026-11-10 切到网络 tgz；2026-11-16 升级到 manager 1.3.0、六组件 1.1.0 | [早期安装](LOCAL-ONLINE-INSTALL-2026-11-10.md) / [manager 升级](../evidence/live-manager-upgrade-2026-11-16/live-manager-upgrade-result.json) |
| 工程与文档 | 32 个 Node 检查进程、manager 145 用例、生成物检查、公开源 doctor、仓库边界与文档链接检查、最小 CI 与 tag/manual 发布 workflow | `npm test` / `npm run build:check` / `npm run doctor` / `npm run repo:check` |

## 2. 仍需后续施工的能力

| 项目 | 当前事实 | 剩余工作 |
|---|---|---|
| registry/git 与任意跨 schema 迁移 | 只支持可信本地/远端包与数据 schema 1；开发 link 受保护，不隐式替换 registry/git 来源 | 出现真实 schema 变化时设计迁移与逆向恢复边界；`registry`/`git` 来源单独定义 |
| 缓存损坏与配置语义修复 | 可修复安装文件损坏；原包缓存丢失/损坏时阻断；不重置用户配置或会话 | 从可信目录按旧 SHA 找回缓存；配置诊断与用户选择性重置另做 |
| 中断任务恢复 | 普通异常自动修复、写锁、失败回执与 `recovery-required` 已实现；硬中断可识别并阻止错误重启 | 扩展“只读诊断 → 选择事务 → 恢复”的外部工具，逐个断点验证；不盲删 pending |
| 外部依赖一体化分发 | 展示 `guide` skill、skills manager、better-sidebar 并给出技能设置入口；不代替其安装/升级逻辑 | 为目标渠道写清安装指引；若要一键代装，先定义外部来源与责任 |
| 可选产品交互 | Q7 折叠、批量操作未实现；跨会话文件锁、嵌套指导不在 v1 范围 | 依实际需求排序；不把已接受边界误列为缺陷 |
| npm/市场发布 | 仅通过 GitHub Releases 分发；七包 `private:true`、`UNLICENSED`，未发布 npm/市场 | 需要时再决定命名空间、许可证、市场元数据与发布渠道 |

## 3. 已实现但仍需扩展的验证

| 覆盖缺口 | 测试方式与通过条件 |
|---|---|
| 新 DSH/Cordis/better-sidebar 构建 | 按维护手册 G0：核对新产物/契约、隔离 Runtime/Host/UI，再允许更新 pin |
| 原生 Stop 的所有入口、任意服务关闭顺序、第三方后续包装 | 分别从原生对话、面板、父停止与 Host 退出触发；不得泄漏包装、误投递结算或阻断普通工作 |
| O17 独立容量语义 | capacity=1，指导运行占槽、结算释放、idle 不占；检查 native used 与 admission 同源快照 |
| 长时资源与多窗口 SSE | 固定窗口数和操作频率，至少记录稳定期基线与长时趋势；关闭窗口后连接/内存可回落，无排队增长 |
| 自动归档 low 600 秒完整实测 | 显式开启 `archive.auto`，保持相应压力与 idle 条件到期；确认只归档符合条件的会话 |
| PT-6 Windows 沙箱 PTY | 仍为用户暂缓事项；保留沙箱失败与无沙箱对照事实，不以对照结果覆盖失败 |
| 5E 真实 Edge 浏览器 UI | 独立 Electron 桌面 E-07 已通过；仍需在真实 Edge 中复跑 MigrationCard 的准备/确认/重连链路，并补写锁争用和迁移后普通升级的真实链路 |
| 真实模型长压/故障 | 可选的 30 分钟以上真实模型 soak 与 provider 故障注入；不阻塞当前首轮方案 |

这些是覆盖缺口或已定边界，不表示已发现相应功能缺陷；不要重复开启已完成的 O2/R6/O6/O8/5A～5D 基线整改。

## 4. 每次改包管理的可重复测试

先运行确定性工程检查：

```powershell
npm test                  # 32 个 Node 进程，含 manager 145 用例
npm run build:check
npm run doctor
npm run repo:check
git diff --check
```

再生成**新目录**的本地发布包，在安装了受支持 DSH 的 Windows 上运行实际包测试。Electron 必须使用安装目录的真实 exe，设置 `ELECTRON_RUN_AS_NODE=1`；PowerShell 调用 GUI exe 时使用 `Start-Process -Wait -WindowStyle Hidden` 或等待其管道完成。不要把用户当前 profile 填入隔离测试命令。

```powershell
npm run manager:release -- --output dist/test-new/base
node guide-manager/test/prepare-maintenance-fixtures.mjs dist/test-new/fixtures
npm run manager:release -- --source dist/test-new/fixtures/good --output dist/test-new/good
npm run manager:release -- --source dist/test-new/fixtures/broken --output dist/test-new/broken
node scripts/prepare-manager-catalog.mjs --release dist/test-new/good/manager-catalog.json --release dist/test-new/broken/manager-catalog.json --output dist/test-new/manager-catalog.json
```

`setup-acceptance.mjs` 参数为 `<新证据目录> <5A目录> <profile名> [5B目录] [manager.tgz] [5C目录]`；选 desktop 时 profile 名必须是 `desktop`。5B 目录可用 `manager:upgrade-catalog` 由明确的测试版本生成，过程见 [manager README](../guide-manager/README.md)。本轮真实运行命令与结果另存证据。夹具中的 broken manager 是故意无法加载的版本，**只用于隔离测试，不用于用户安装**。

```text
Electron --expose-internals guide-manager/test/setup-acceptance.mjs <上述参数>
python guide-manager/test/acceptance.py <新证据目录> web --maintenance
python guide-manager/test/acceptance.py <另一份新证据目录> desktop --maintenance
Electron --expose-internals guide-manager/test/run-maintenance-host.mjs <独立故障profile/setup.json>
```

manager 1.2.0 的面板自动执行另用真实 UI 验收：`guide-manager/test/one-click-acceptance.py <新验收目录> web|desktop`，从实际面板点击发起，测试程序不代为执行包操作，也不在重启后手动导航到指导页。公开源后端可先运行 `node guide-manager/test/remote-live.mjs <新目录> --public`。

| 场景 | 断言 |
|---|---|
| manager-only、首次安装 | 官方插件页有指导 tab；依赖闭包正确；刷新保留准备；重启六组件就绪 |
| 独立/联动升级及 5B 恢复 | panel 单升仅变一包；shield 必需联动可见；恢复精确旧锁/配置，原目录丢失也可恢复 |
| 卸载保护 | preset 不可卸载；只移除 shield 被拒绝；正确闭包可卸载，goal 原生驱动恢复 |
| 原版本修复 | 删除 panel manifest/入口后 manager 可打开；重装修复全部文件；四 profile 哈希不变 |
| 桌面客户端无法启动 | 宿主合并加载因缺失 manifest 失败时，运行独立 repair-components.ps1；重启后面板恢复并核对原包 |
| 自升级/外部恢复 | 升级前恢复命令可见；正常版本新进程核对；故障版无 API 时仍可由独立副本恢复；删除新 tgz/cache 后仍可恢复 |
| 面板自动执行 | 确认前不执行；准备/执行指纹漂移拒绝；重启后返回可见指导页并核对新 Host 的实际版本与运行状态；启动失败保留计划与恢复入口 |
| 冲突/失败 | 过期计划、校验失败、官方写锁争用拒绝；卸载后注入故障恢复旧包与配置；恢复再次失败不自动重启 |
| 无旁路影响 | sentinel 会话文件、外部依赖保留；用户 live 四文件 SHA 和既有 DSH PID/创建时间不变 |

删除/损坏 pnpm 安装文件时先 `unlink`，不要写穿 hardlink 修改共享 store。测试 profile 与数据写在证据目录；进程按 launcher PID + 创建时间清理，禁止按同名进程全停。

## 5. 包管理通过后，业务功能冒烟

以下应在独立测试 workspace/profile 上执行；记录 Host 状态、操作前后文件、截图与断言。需要真实模型调用的项保留为显式测试轮次并记录费用/时长，包管理验收不发起模型任务。

| 功能 | 操作 | 通过条件 |
|---|---|---|
| 创建/seed | 父会话完成两轮，打开指导并询问既有事实 | 使用 guide preset；上下文截止点符合最后一个 completed turn 的 seed 规则 |
| goal 并行/准入 | capacity 1/2/8、R/M 边界、零预算；运行 goal 时开指导 | 普通工作遵守等待/硬预留；可信指导按规则并行；不超额 |
| 投影与控制 | 普通工作调用 list/send/interrupt，指导分支含后代 | 隐藏指导分支；模型控制被拒；普通工作、孩子回报仍正常 |
| 结算 shield | 指导完成、冷恢复后再次完成，panel 重挂 | 不向父误注入指导结算；普通子代理结算正常；核心采用冷更新 |
| sidebar 与多 pane | 普通任务/指导并存，切树/图、计数、反复打开 | 普通计数/auto-open 正常；指导仅在专区；已接受重复视图边界保持明确 |
| 文件/Git/权限 | 指导读写测试文件并查看差异、提交 UI | 遵守原生权限；文件和 Git 结果正确；不承诺跨会话锁 |
| 关闭/归档/恢复 | Stop、关闭页签、归档、重启再打开 | Stop 取消执行；关页保留数据；归档休眠可恢复，不污染父结算 |
| 外部技能降级 | skills manager 安装/缺失、guide ready/disabled/missing | 状态真实；技能设置深链可达或明确降级；不伪称六包就绪即技能就绪 |

每次记录 `status=passed|failed|blocked|known-diagnostic`、版本/产物 SHA、断言、错误、日志/截图路径。未运行的项写“未运行”，不要用已有单元测试或早期验收替代本轮事实。

2026-11-09：5D-4 已补真实公开 Release、官方 pnpm 与两端完整链路；错误响应、取消、限流、损坏包等保持默认确定性测试，不人为破坏实际远端。真实证据见 [报告](../evidence/phase5d4-2026-11-09/report.md)。2026-11-10 本机来源切换已单独记录；它验证的是这次运维操作，不是通用 5E 能力。

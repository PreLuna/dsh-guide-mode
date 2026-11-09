# 功能核对与测试清单

更新：2026-11-08。当前交付/待办以 [项目状态](../PROJECT-STATUS.md) 为准；本表区分“已有实现”“未实现的后续能力”和“实现已有、覆盖仍需扩展”。5A/5B/5C 的本地包管理不等于公共 npm 产品化，也不等于所有业务功能重新做过真实模型验收。

2026-11-08 用户已同意优先实施 **5D 远端发布/下载 → 真实隔离验收 → 5E 当前 link 来源迁移**，具体施工与 D-01～D-07、E-01～E-07 验收见 [方案](PHASE-5D-5E-IMPLEMENTATION-PLAN.md)。截至 2026-11-09，5D-0～3 的发布工具、后端下载与 HTTP/UI 已本地实现；实际发布、真实私有远端整体链路与迁移尚未完成。D-01 的本地代码验证与模拟发布验证见 [报告](../evidence/phase5d-2026-11-08/report.md)，不得替代 D-02/06/07 的真实远端验收。

## 尚未实现或需要完善的能力

| 项目 | 当前事实 | 建议下一步 |
|---|---|---|
| 跨机器分发与更新发现 | 发布工具、消费端查询下载缓存、安装器适配与 HTTP/UI 已本地实现，隔离 Edge 页面交互通过；网络为测试夹具 | 接着做 5D-4 真实私有远端、官方冷操作和 Edge/独立桌面整体验收；不以公开或 npm 发布为前提 |
| 现有 link/registry 组件迁移 | 开发 link 可重载；5B/5C 不会隐式替换它们，组件维护要求 SHA 固定来源 | 5D 验收后按 5E 实现已安装 link 自有包的差异预览、源码/配置备份和外部恢复；registry/git 通用迁移仍延期 |
| 任意版本与数据迁移 | 仅有限验收组合，同宿主/契约和 schema 1；无迁移执行或逆向迁移框架 | 新版本出现真实 schema 变化时设计迁移与恢复边界；不能只加版本号 |
| 缓存损坏与配置语义修复 | 可修复安装文件损坏；原包缓存丢失/损坏时阻断；不重置用户配置或会话 | 后续可从可信目录按旧 SHA 找回；配置诊断与用户选择性重置另做 |
| 无助手的安装体验 | 当前确认准备后需保存工作并运行外部助手 | 若继续改善便利性，做宿主批准的启动器/进程协调入口；保留外部恢复能力 |
| 中断任务恢复 | 普通异常自动修复、写锁与失败回执已实现；硬中断可识别并阻止错误重启 | 扩展“只读诊断 → 选择事务 → 恢复”的外部工具，逐个断点验证；不盲删 pending |
| 外部依赖一体化分发 | 展示 guide skill、skills manager、better-sidebar，并提供技能设置入口；不代替其安装/升级逻辑 | 为目标分发渠道写清安装指引；若要一键代装，先定义外部来源和责任 |
| 可选产品交互 | Q7 折叠、批量操作没有实现；跨会话文件锁、嵌套指导不在 v1 范围 | 依实际需求排序，不将已接受边界误列为缺陷 |

## 已实现但仍需扩展的验证

| 覆盖缺口 | 测试方式与通过条件 |
|---|---|
| 新 DSH/Cordis/better-sidebar 构建 | 按维护手册 G0：核对新产物/契约、隔离 Runtime/Host/UI，再允许更新 pin |
| 原生 Stop 的所有入口、任意服务关闭顺序、第三方后续包装 | 分别从原生对话、面板、父停止与 Host 退出触发；不得泄漏包装、误投递结算或阻断普通工作 |
| O17 独立容量语义 | capacity=1，指导运行占槽、结算释放、idle 不占；检查 native used 与 admission 同源快照 |
| 长时资源与多窗口 SSE | 固定窗口数和操作频率，至少记录稳定期基线与长时趋势；关闭窗口后连接/内存可回落，无排队增长 |
| 自动归档 low 600 秒完整实测 | 显式开启 archive.auto，保持相应压力与 idle 条件到期；确认只归档符合条件的会话 |
| PT-6 Windows 沙箱 PTY | 仍为用户已暂缓事项；保留沙箱失败与无沙箱对照事实，不以对照结果覆盖失败 |
| live 包来源切换 | 本轮没有切换 live 的依赖、lock 或 patch；隔离验收通过后，部署仍须保存用户工作和回退资料 |

这些是覆盖缺口或已定边界，不表示已发现相应功能缺陷；不要重复开启已完成的 O2/R6/O6/O8 基线整改。

## 每次改包管理的可重复测试

先运行确定性工程检查：

```powershell
npm test
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

| 场景 | 断言 |
|---|---|
| manager-only、首次安装 | 官方插件页有指导 tab；依赖闭包正确；刷新保留准备；重启六组件就绪 |
| 独立/联动升级及 5B 恢复 | panel 单升仅变一包；shield 必需联动可见；恢复精确旧锁/配置，原目录丢失也可恢复 |
| 卸载保护 | preset 不可卸载；只移除 shield 被拒绝；正确闭包可卸载，goal 原生驱动恢复 |
| 原版本修复 | 删除 panel manifest/入口后 manager 可打开；重装修复全部文件；四 profile 哈希不变 |
| 桌面客户端无法启动 | 宿主合并加载因缺失 manifest 失败时，运行独立 repair-components.ps1；重启后面板恢复并核对原包 |
| 自升级/外部恢复 | 升级前恢复命令可见；正常版本新进程核对；故障版无 API 时仍可由独立副本恢复；删除新 tgz/cache 后仍可恢复 |
| 冲突/失败 | 过期计划、校验失败、官方写锁争用拒绝；卸载后注入故障恢复旧包与配置；恢复再次失败不自动重启 |
| 无旁路影响 | sentinel 会话文件、外部依赖保留；用户 live 四文件 SHA 和既有 DSH PID/创建时间不变 |

删除/损坏 pnpm 安装文件时先 `unlink`，不要写穿 hardlink 修改共享 store。测试 profile 与数据写在证据目录；进程按 launcher PID + 创建时间清理，禁止按同名进程全停。

## 包管理通过后，业务功能冒烟

以下应在独立测试 workspace/profile 上执行；记录 Host 状态、操作前后文件、截图与断言。需要真实模型调用的项保留为显式测试轮次并记录费用/时长，本轮包管理验收没有发起模型任务。

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

2026-11-09 进度：5D-2 后端及 5D-3 HTTP/UI 已完成本地验证，见 [后端说明](PHASE-5D-CONSUMER-BACKEND.md) / [接口与页面测试](PHASE-5D-HTTP-UI.md)。模拟 GitHub 配真实 tgz 覆盖异步查询/准备/取消/重试、围栏、16 KiB/字段限制、准确计划确认和 pending 桥接；隔离 Edge 实际页面验证刷新保留选择与任务、取消重试和助手展示。实际私有 Release、官方 pnpm 与 Edge/桌面整体链路继续按 5D-4 验收，不以夹具结果替代。

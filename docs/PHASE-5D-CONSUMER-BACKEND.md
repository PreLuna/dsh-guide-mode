# Phase 5D-2：消费端后端

更新：2026-11-09。后端与 5D-3 HTTP/UI 已完成；5D-4 已补真实公开源、官方冷操作与 Edge/独立桌面整体验收，见 [报告](../evidence/phase5d4-2026-11-09/report.md)。进度见 [项目状态](../PROJECT-STATUS.md)，依据见 [施工方案](PHASE-5D-5E-IMPLEMENTATION-PLAN.md)。

## 配置与服务

2026-11-09 公开源补充：manager 1.1.2 内置 `PreLuna/dsh-guide-mode`、`access:public`，未指定配置且无 profile source.json 时使用该默认值。新用户无需 token 或手写来源文件。公开查询使用 latest 附件直链，固定 tag 附件下载配合 Git 智能 HTTP 的 tag/commit 核验，不走 REST API；私有/API 路径保留。

manager Host 配置可提供 `source` 对象或 `sourcePath`；默认读取目标 profile 的 `.guide-manager/source.json`。格式为 5D-0 定义的 schema 1：

```json
{"schema":1,"provider":"github","owner":"PreLuna","repo":"dsh-guide-mode","channel":"stable","tokenEnv":"DSH_GUIDE_GITHUB_TOKEN"}
```

私有来源 token 只从后端环境读取。公开模式不发送凭据。来源配置损坏/显式路径不可用时 state.distribution 显示 configured=false，本地安装、升级、维护仍工作；默认公开来源可用时显示 configured=true。GET state 不发起网络请求。

`guideManager` 增加服务方法，供后续 HTTP/UI 层使用：

| 方法 | 参数 / 返回 |
|---|---|
| `checkSource()` | 立即返回 taskId；后台访问仓库并检查稳定发布清单 |
| `prepareSource(request)` | kind=install/upgrade/manager-upgrade，snapshotId，加 components/targets/version；立即返回 taskId |
| `sourceTask(taskId)` | 等待任务结束并读取持久结果；HTTP 层不应拿此方法阻塞 GET state |
| `cancelSourceTask(taskId)` | 请求取消当前任务 |
| `planPreparedSource(taskId)` | 仅对 ready 准备生成既有安装/升级/维护计划 |
| `stagePreparedSource({taskId,planId,confirm:true})` | 再次核对后写既有 pending；不执行 pnpm 或停 DSH |

state.distribution 返回配置仓库与最近任务的状态/进度/结果；没有凭据值。任务及清单保存在 profile `.guide-manager/remote/`，同一 profile 的准备使用独占任务锁。其他实例仍持锁时拒绝并发准备；死进程遗留任务标记 interrupted，可重新准备。PID 已复用、锁损坏或不完整时保守拒绝，不自动删除无法核实的锁。

## 查询、下载与缓存

1. 查询先探测仓库访问权限，再扫描最多 100 个发布，忽略 draft/prerelease，读取首个稳定产品清单。鉴权/权限或隐藏 404 不能当作空发布；真正空频道返回 available=false。
2. 完整验证 schema 4、仓库、release/tag/提交，保存按清单哈希命名的快照。查询只下载元数据，不下载所有包。
3. 安装按依赖闭包准备；panel 涉及 preset/shield/admission，goal 可单独准备。组件升级准备选中完整兼容组合和已安装旧版本：已有缓存直接复用，新字节只为缺失包下载。manager 升级只准备指定 manager。
4. 校验实际来源 tag/commit、附件名、长度、SHA、tar 路径/类型及实际 name/version/contract/schema；manager 另核对控制 schema、宿主和维护入口。既有冷执行器继续核对安装版本、peer、宿主和配置。
5. 包通过临时文件提交到已有 SHA 缓存；取消/错误不留下可用的半包。已有损坏缓存明确拒绝，不静默覆盖事务引用的文件。响应体有大小上限，网络/5xx 最多尝试三次；权限和限流不盲目重试，取消通过 AbortSignal 传播。
6. 只向官方 API/upload 主机发送凭据；跨域下载不转发 Authorization。错误回执只保存受控错误码，不记录远端正文、token 或签名链接。

网络阶段不改变 package.json、lock、patch 或 workspace 文件。缓存和任务文件可保留；失败任务不能进入 stage。任务绑定配置指纹、清单快照和 profile 四文件，来源配置/profile 变化后重新准备，不自动改用最新发布。

## 与本地安装器的接口

准备结果在 `remote/prepared/<taskId>/` 生成不可变目录：

- 安装：schema 1 完整元数据，文件映射到 SHA 缓存；只验证本次依赖闭包的文件。`readCatalog` 增加 requiredKeys 选项，默认仍严格验证六包；冷安装执行器根据已绑定的计划 entries 校验必需包，因此单独安装 goal 不要求其余五包已下载。
- 升级：schema 2，保留选中完整组合及已安装旧版本产物；继续使用原严格 readUpgradeCatalog、createUpgradePlan 和包事务。
- manager：schema 3 单目标目录，继续使用原 readManagerCatalog 和独立维护执行器。

目录哈希、准备状态、配置和 profile 再核对后才可生成/确认计划。首次安装仍受当前 manager BOM 限制；开发 link 仍受 5B/5C 保护。本阶段不会借远端准备隐式实施来源迁移。

已 stage 的冷操作只依赖本地目录与包缓存，执行和已有事务恢复不需要 token/网络。不能把“准备完成”当作已安装或运行就绪，仍须既有停机助手执行及新 Host 健康核对。

## 验证与后续

本地测试使用真实离线 tgz、Node Response 和注入传输，覆盖查询不全量下载、单包/闭包、缓存、错 SHA、取消、重试、限流/鉴权、漂移拒绝、三类目录及离线冷安装计划验证；发布工具继续使用抽出的共享传输并保留回归。证据见 [本轮报告](../evidence/phase5d-2026-11-09/report.md)。

5D-4 已实际发布并验证公开源、官方 pnpm 与 Edge/Electron 安装/升级/恢复；无 token/source.json 的默认引导通过。没有实施 live 来源迁移或模型推理；后续为独立的 5E。

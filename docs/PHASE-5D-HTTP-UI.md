# Phase 5D-3：HTTP 接口与管理页

更新：2026-11-09。HTTP/UI 已实现；5D-3 的夹具验证记录见 [原报告](../evidence/phase5d3-2026-11-09/report.md)，5D-4 已补真实公开 Release、官方冷操作与 Edge/独立桌面整体验收，见 [真实报告](../evidence/phase5d4-2026-11-09/report.md)。当前进度见 [项目状态](../PROJECT-STATUS.md)。

## 使用流程

1. 通过官方插件页安装 manager 1.1.2 后，默认使用本仓库公开来源，无需 token/source.json。其他或私有来源按 [后端说明](PHASE-5D-CONSUMER-BACKEND.md) 显式配置；页面不接收 token、仓库修改或任意下载地址。
2. 在“远端发布来源”点击“检查更新”，查看仓库、Release 和来源提交。检查只查元数据，打开/刷新页面不会自行联网。
3. 选择“安装缺失组件”“升级已装组件”或“升级管理器”。安装按依赖补齐，升级选择各组件精确版本；manager 单独选择目标版本。
4. 点击“下载并准备”。页面显示完成包数及当前传输字节，可取消；鉴权、隐藏 404、限流、网络、完整性、兼容组合或旧版本缺失分别提示。失败、中断、取消后可按原选项重试。
5. 准备成功仅表示包已下载校验。点击“预览已准备计划”，查看精确版本、联动条目、警告与阻断项，再“确认准备执行”。确认绑定该任务与计划指纹，服务器重新核对当前状态。
6. 页面展示现有安装/升级/维护助手命令。保存工作后运行助手，重启后检查下方运行状态；manager 升级同时显示独立恢复命令。页面不自动执行命令。

刷新恢复持久任务、版本清单和该任务的组件/版本选择；运行时约每秒轮询本机 state，空闲约十秒，避免重叠查询。计划预览不持久化，刷新后重新预览再确认。已提交任务标记 staged，不能再次复用为准备成功的任务；取消 pending 之后若要再操作，重新准备。

既有本地安装、包版本恢复、修复、卸载、源码重载和技能管理入口保留。未配置来源时展示配置指引，本地功能继续可用。已有开发 link 仍受原来源保护，需要 5E 迁移，不能借本界面隐式替换。

## HTTP 契约

所有接口位于 `/guide-manager/api/`，沿用宿主 connection 围栏。成功响应为 `{ok:true,value}`，失败为 `{ok:false,error:{code,message}}`；source 错误仅返回受控代码，不包含上游正文、凭据或签名链接。

| 方法与路径 | 请求体 | 返回 / 效果 |
|---|---|---|
| `GET state` | 无 | 增加 distribution：配置仓库、最近 task 与 catalog；不发起远端请求 |
| `POST source/check` | `{}` | 立即返回 taskId，后台检查发布 |
| `POST source/prepare` | `{kind,snapshotId,components}` 或 `{kind,snapshotId,targets}` 或 `{kind,snapshotId,version}` | kind 分别为 install / upgrade / manager-upgrade；立即返回 taskId |
| `POST source/task` | `{taskId}` | 立即读取持久任务，不等待下载结束 |
| `POST source/cancel` | `{taskId}` | 请求取消当前运行任务；任务最终为 cancelled |
| `POST source/plan` | `{taskId}` | 对 ready 的准备任务生成既有精确计划 |
| `POST source/stage` | `{taskId,planId,confirm:true}` | 重验后写既有 pending；不执行 pnpm 或停机 |

targets 为 `[{key,version}]`。source 路由仅支持 POST；未知动作 404、错误方法 405、非 JSON/超过 16 KiB/额外字段 400、失效/冲突/缺确认等 409；connection 拒绝沿用宿主状态码。超限请求会终止连接，不保证客户端能读取错误正文。源配置、缓存路径与助手命令始终由后端决定。

## 功能测试与后续

默认 `npm test` 自动发现 `source-http.test.mjs` 和扩展的 `client-installation.test.mjs`。HTTP 用真实 tgz、真实文件系统与模拟 GitHub Response，验证异步任务、鉴权围栏、输入限制、取消重试、计划指纹、刷新状态和原 pending 桥接。客户端测试覆盖三类操作的准确请求及阻断确认。

可选真实 Edge 页面测试：先用 `setup-acceptance.mjs` 在新的证据目录创建隔离 profile，再执行 `python guide-manager/test/source-ui.py <目录>`。它在官方 Host 中加载实际 manager/React，拦截浏览器 source/state 响应以测试页面渲染、轮询、取消重试、刷新与确认；不代替 HTTP 测试或真实 GitHub 验收。只关闭记录 PID/创建时间的自有测试进程，并核对页面操作前后的四文件与既有 DSH 进程。

5D-4 的 D-01～D-07 已按公开源方向分层验收；实际发布与两端操作不再只依赖夹具。来源不可用通过隔离来源故障注入验证，不称为物理断网。5E 未开始，日常 link 来源未切换。

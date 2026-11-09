# Phase 5D-4：真实远端整体验收

更新：2026-11-09，施工中。结果以 [项目状态](../PROJECT-STATUS.md) 和本轮 evidence/phase5d4-2026-11-09/report.md 为准；未通过的项目不因已存在测试脚本而标记完成。

## 为什么 GitHub 和日常面板没有变化

5D-3 完成时改动尚未形成新提交/推送，仓库没有 Release；日常 desktop 使用工作区 link，未配置远端来源。此前验证使用隔离 Host 与响应夹具，不代表已向日常进程部署。前端可能加载新文件，Host 路由仍需要冷重载；来源切换与 live 部署按 5E 单独处理。

## 本轮范围

- 将已授权的 Phase 5A～5D-3 实现纳入正式来源提交，推送私有仓库，固定 tag/commit 编译并回读实际附件。
- 发布基线和有明确历史关系的独立/联动升级版本；不覆盖已发布的同包同版本字节。升级验收系列仅在专用来源分支调整包版本及 peer，日常工作区保持基线。
- `remote-live.mjs` 使用真实 GitHub 网络验证元数据、单包下载、SHA/tar、缓存、漂移及无效凭据。手动只读 Actions 使用 Contents: read 的 job token 运行同一测试。
- `remote-acceptance.py` 在全新隔离 profile 安装真实下载的 manager，通过实际 HTTP/UI 下载六组件，使用官方 pnpm 与生产冷助手验证 Edge 和独立 Electron 的安装、单包升级、联动升级、断开下载权限后的版本恢复，以及 manager 升级/外部恢复。没有请求/响应 mock。
- `lock-live.mjs` 使用已安装官方 withFileLock，在专用文件上验证持锁时拒绝竞争写入，释放后可用。

本地验收可以临时继承 `DSH_GUIDE_GITHUB_TOKEN`，或仅在进程内从已有 gh 登录读取凭据；不会把值写入代码、配置、回执或日志。现有 gh 权限不能被称为专用只读凭据；只读 job token 的实际结果另行记录。跨进程重启由本次验收启动器显式传递环境；不宣称日常桌面已永久配置凭据。

目录必须使用新的 evidence 子目录。保留来源、Release/资产 SHA、冷操作回执、截图和明确失败记录。隔离实例通过 PID、创建时间、profile 与专有 user-data 定位；保留已有 DSH 进程与日常 profile 四文件。外部故障的确定性覆盖仍使用默认测试，真实链路不人为制造 GitHub 限流或篡改已发布附件。

# Phase 5D-4：真实远端整体验收

更新：2026-11-09，**公开源首版实现与隔离整体验收完成**。实际 Edge/独立桌面各 6 组断言通过，关键安装/升级/恢复终态均 verified-running，0 page error。结果与边界见 [项目状态](../PROJECT-STATUS.md) / [完整报告](../evidence/phase5d4-2026-11-09/report.md)。5E 未开始。

本页记录 guide-v1.2.2 / manager 1.1.3 的历史真实远端验收，manager 1.1.2 是公开源功能起始版本，当时确认准备后仍需手动运行助手。后续 manager 1.2.0 增加面板自动执行与重启返回，当前方式见 [面板执行说明](PHASE-5-PANEL-EXECUTION.md)。新用户从 [最新 Release](https://github.com/PreLuna/dsh-guide-mode/releases/latest) 下载 manager tgz，在官方插件页安装后进入“指导 → 远端发布来源”。

用户已将仓库改为公开。本轮当前目标为无 token 公开分发：manager 1.1.2 默认内置本仓库公开来源，读取 Release latest/固定 tag 附件，通过匿名 Git 智能 HTTP 的 refs 广告核对 tag 对应提交；不使用 REST API 查询，避免其匿名配额成为安装门槛。配置仍可显式选回私有/API 来源。公开模式的源码依据为 [GitHub Release 直链](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases) 与 [Git HTTP 协议](https://git-scm.com/docs/http-protocol)。

## 为什么 GitHub 和日常面板没有变化

5D-3 完成时改动尚未形成新提交/推送，仓库没有 Release；日常 desktop 使用工作区 link，未配置远端来源。此前验证使用隔离 Host 与响应夹具，不代表已向日常进程部署。前端可能加载新文件，Host 路由仍需要冷重载；来源切换与 live 部署按 5E 单独处理。

## 本轮范围

- 将已授权的 Phase 5A～5D-3 实现纳入正式来源提交，推送本仓库，固定 tag/commit 编译并回读实际附件。
- 发布基线和有明确历史关系的独立/联动升级版本；不覆盖已发布的同包同版本字节。升级验收系列仅在专用来源分支调整包版本及 peer，日常工作区保持基线。
- `remote-live.mjs --public` 使用真实 GitHub 网络验证元数据、单包下载、SHA/tar、缓存与漂移，记录零 Authorization、零 REST API；原私有参数模式保留，历史只读 Actions 证据单列。
- `remote-acceptance.py` 在全新隔离 profile 安装真实下载的 manager，不提供 token/source.json，通过实际 HTTP/UI 下载六组件，使用官方 pnpm 与生产冷助手验证 Edge 和独立 Electron 的安装、单包升级、联动升级、来源不可用后的版本恢复，以及 manager 升级/外部恢复。没有请求/响应 mock。来源不可用通过仅改隔离 profile 的来源仓库来注入，不能称为物理断网。
- `lock-live.mjs` 使用已安装官方 withFileLock，在专用文件上验证持锁时拒绝竞争写入，释放后可用。

公开安装验收主动移除子进程中的 GitHub 凭据变量；公开下载器也不发送 Authorization，即使用户环境残留无效 token。维护端发布仍使用已有 gh 登录，只在子进程环境中传递凭据。公开前的私有/只读 job token 结果是历史证据，不代替当前公开端整体验收。

目录必须使用新的 evidence 子目录。保留来源、Release/资产 SHA、冷操作回执、截图和明确失败记录。隔离实例通过 PID、创建时间、profile 与专有 user-data 定位；保留已有 DSH 进程与日常 profile 四文件。外部故障的确定性覆盖仍使用默认测试，真实链路不人为制造 GitHub 限流或篡改已发布附件。

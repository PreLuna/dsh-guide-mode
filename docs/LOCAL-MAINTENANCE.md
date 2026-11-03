# 本机工程基线与维护

适用范围：本机自用六包，不对外发布。版本统一为 1.1.0，`private:true`、`UNLICENSED`；维护者为本机工作区用户。本轮不建立公开仓库、不上传代码，也不宣称具备公开分发许可。公共作者/远端仓库/开源许可留到明确对外分发时决定。

## 版本管理与 CI

一个工作区 Git 仓库管理六个自有包、当前文档和测试。依赖、历史 fork、历史文档、evidence、隔离 profile、会话/恢复数据均不纳入 Git；运行与回退依赖的证据目录必须在本机保留，不能据 .gitignore 删除它们。

`npm test` 运行无需安装 DSH 的 Node 回归和生成物一致性检查；`.github/workflows/test.yml` 为 Windows/Node 24 的最小 CI。已在本机执行相同命令；未连接远端，不能称 GitHub 托管 CI 已跑过。真实 Runtime/Host/浏览器验收另行使用已安装 DSH、Electron 与 Python Playwright，不能以 Node CI 替代。

`client.js` 从 sidebar adapter 自有 `core.js` 和 `client.entry.js` 生成。修改后运行 `npm run build --prefix guide-sidebar-adapter`，检查运行 `npm run build:check`；安装脚本也会检查。生成后客户端有独立加载测试，原生任务组件仍由官方包提供。

版本协调：六包使用相同版本；内部 peer 锁定相同版本。当前私有契约仅支持 DSH 0.2.1-rc.3 / Cordis 4.0.5 / better-sidebar 0.28.2，peer 范围收窄到该基线，不表示其他版本一定有缺陷。改动后先隔离验收，再冷升级。

## 安装、升级、卸载与回退

1. `npm run doctor` 检查版本与外部 guide skill。缺技能采用明确降级，不联网安装。
2. 在隔离副本修改，运行 Node、真实 Host 与浏览器回归。运行中的生产 junction 指向工作区，禁止先直接覆盖源码再等停机。
3. 选择新的证据目录，停止目标 profile 的 Host；独立其他 profile 不应被停止。保存原源码、profile、生成物和前后哈希。
4. 安装或升级：`node scripts/workspace.mjs prepare --mode install --output <新的目录>`；可用 `--profile <绝对路径>` 指定目标。
5. 审阅计划后执行：`./scripts/apply-profile.ps1 -Plan <目录>/plan.json`。脚本再核对停机、来源 junction、候选哈希与其他配置；保留 registry 图，失败恢复已改文件及原链接状态。
6. 完整卸载：先 `prepare --mode uninstall`，再 apply。仅移除六个自有依赖、bundle、lock importer 和经核对的 junction；保留官方包、工作区、会话、localStorage 和证据。若有自有 profile override，停止并先准备明确移除方案，不能遗留可执行孤立条目。
7. 回退同一操作：停 Host 后 `./scripts/apply-profile.ps1 -Plan <目录>/plan.json -Restore`。代码版本必须和 profile 选择成对回退；profile 工具不会擅自覆盖源码，代码使用该次备份或 Git 已验证版本恢复。
8. 冷启动检查 `/guide/api/state` 的 `panelCompat.mode=ready`、准入 active、shield active、goal/sidebar 支持状态；正常 UI 确认组件运行。升级不自动重发用户问题或恢复 goal。

完整卸载后，已有指导日志仍保留，但其 guide preset/provider 不再可用；需重新安装配套六包才能按原方式继续，不把卸载当作删除对话。

## 升级时必须重验的边界

- admission：dsh-subagent/Cordis 产物、materialize 函数、manager/resident/rootPools/slots、同步 reserve 与原生取消/closing。
- goal：原 driver 产物、waitForChildren/join 函数与独占调度入口。
- sidebar：官方 client、client-modules、Cordis、树/图/计数/auto-open 与注册的存活/卸载行为。
- panel/shield：官方 descriptor fold、自身 inheritedEventCount + first-wins、deprecated snapshotEvents 同步读；Host 必需服务/方法，以及 sidebarRight/slots/uiWorkspace 原生客户端形状。契约源哈希在 guide-shield/contracts.js。
- O6：tools/register、精确注册层、来源 runtime/execute 指针及现有五个源码哈希。不能只修改哈希让预检通过。

不支持时明确显示不可用/只读，阻止新指导和自动归档，建议重启或恢复已支持版本；不注册半套 provider。缺少客户端注册必需形状时不挂半套 tab，并提供 guidePanelClientCompatibility 诊断。已有对话仍可从宿主原生入口查看，但未知版本不能承诺所有策略持续生效。

panel HMR 的既有保护回归保留；准入和 shield 核心更新采用冷重启，不承诺核心卸载/HMR 空窗连续防护。服务整体任意关闭顺序、真实模型长时、任意第三方包装仍按 O11 跟踪。

## R5 复现口径

复用当前 desktop 的依赖与 bundle 组合，在隔离 DSH_HOME 和无用户凭据的 Edge 测试一页、两页及刷新；记录 SSE/HTTP 时间线。此次 9 次 API 请求成功，未复现排队，因此不擅自更换连接协议。该结论不覆盖长期插件 HMR、多窗口或人为撑满 HTTP/1.1 连接；真实使用再出现时保留网络瀑布继续定位。

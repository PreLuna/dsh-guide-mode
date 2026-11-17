# guide-sidebar-adapter

基于未经修改的官方 `dsh-better-sidebar@0.28.2`，包装其浏览器模块的 `apply()`。在独立 sessions 作用域中：

- 任务枚举和 catalog 过滤指导；
- 按 ID 直接访问会话保持完整；
- 主会话、其他插件与模型工具的 sessions 服务不变。

指导专区位于原任务页底部，使用独立滚动区；原任务图/树组件完整复用。adapter 提供 `guideSidebarAdapter` 版本 1 注册接口，panel 在 active 模式优先使用。

## 构建

没有上游源码副本或依赖 fork 的构建过程。`node scripts/build.mjs` 只拼装本包自己的 vanilla JavaScript；发布文件不包含研究提取件、官方包缓存或测试 fixture。

```powershell
node guide-sidebar-adapter/scripts/build.mjs
node guide-sidebar-adapter/scripts/build.mjs --check
```

修改 core/entry 后先 build，再检查；CI 也执行检查。

## 兼容

同时核验官方 client 产物、宿主 client-modules 产物及 Cordis 版本。未知版本/产物保持原侧栏，panel 提示兼容功能不可用。

装载/卸载兼容层通过宿主 `tearDownEntryFiber()` 刷新一次原侧栏客户端，再交给原 `apply()`；不停止 Host agent、不删除会话或设置。

## 安装与回退

由 manager 六组件流程安装。关闭 DSH 后由 manager 保存文件级恢复信息，登记 adapter 的 link/bundle；回退恢复原官方文件与配置选择，保留其他 profile 配置。替换文件核对 SHA-256，不写穿硬链接。

## 边界

- 不覆盖或重建官方 sidebar；
- 快速页签切换/刷新时原宿主偶有 WebSocket/session released 提示，验收保留日志；
- 未知官方版本不保证装饰效果。

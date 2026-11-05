# Guide manager（Phase 4）

独立的 Host + client 包，在官方 **插件** 页增加一个「指导」标签页，展示指导模式的六个组件、依赖关系、宿主版本和 `guide` skill 状态，并提供两档切换：

- **热切换**：`guide-panel`、`guide-sidebar-adapter`，通过官方 `pluginManager.setPluginEnabled` 立即生效。
- **冷切换**：`guide-admission`、`guide-shield`、`guide-goal-adapter`，只写 pending intent；由独立 helper 在 DSH 停止时应用 profile patch 并重启。

Phase 2 增加兼容门禁；Phase 3 增加本地 link 源码变更检测、reload helper 和冷切换 patch 回滚；Phase 4 接入 `@michengai/dsh-skills-manager` 的状态与设置深链。manager 不 import 六个组件，也不直接写 profile。

## 显示内容

- **宿主**：DSH 版本/构建、Cordis、官方 `dsh-better-sidebar`，与包内 BOM 对照，区分 `已验证 / 未验证`。
- **六个组件**：版本、契约版本、实际启用状态、Loader fiber 阶段、组件自己的 state 服务。
- **依赖与互斥**：panel → preset/admission/shield/sidebar，以及 goal adapter 与原 goal driver 的互斥关系。
- **skills**：`guide` skill 是否存在、版本/哈希、`skills-guide` 路由数据是否完整、是否被 skills manager 禁用。
- **pending**：冷切换已准备的状态、helper 路径和 intent 数量。

状态分级：

| 状态 | 含义 |
|---|---|
| `ready` | 在已验证组合内，组件服务就绪 |
| `ready-unverified` | 技术上可用，但版本/契约/宿主构建不在已验证 BOM 内 |
| `degraded` | 组件可加载，但服务缺失、只读或回退到 native |
| `unsupported` | 必需契约缺失，组件明确不可用 |
| `failed` | Loader fiber 失败 |
| `disabled` / `missing` | 未启用 / 未安装 |
| `unknown` | 无法判断（例如官方 pluginManager 不可用） |

版本不一致不等于不兼容：它显示为 `ready-unverified`。只有契约缺失、服务明确 unsupported 或 fiber 失败才降为失败。

## 操作策略

| 组件 | 策略 | 当前行为 |
|---|---|---|
| `guide-panel` | `hot` | 停用/启用立即生效；停用后 manager tab 仍可用 |
| `guide-sidebar-adapter` | `hot` | 停用/启用立即生效；停用时恢复官方 sidebar |
| `guide-admission` | `restart-required` | 准备启用/停用；写 pending intent，helper 应用后重启 |
| `guide-shield` | `restart-required` | 同上 |
| `guide-goal-adapter` | `paired-restart` | 写 pending intent，成对切换 adapter 与原 driver |
| `guide-preset` | `locked` | 影响已有会话恢复，不提供开关 |
| `guide-manager` | `locked` | 管理器自身受保护 |

规则：

- 热操作只调用官方 `pluginManager.setPluginEnabled`，不自己写 profile。
- 冷操作只写 `profile/.guide-manager/pending.json`，不修改 `cordis.patch.yml`。
- goal 的 pending 必须同时包含 adapter 和原 driver 两项，避免两个都启用或都停用。
- 取消准备：再次触发“准备当前状态”即可清掉该组件的 intent；UI 提供“取消准备”按钮。
- 冷切换不会自动执行；需要用户双击 `helper/restart-guide-manager.cmd`，该 helper 会关闭并重启 DSH。

## 技能管理（Phase 4）

Host 读取 `$DSH_HOME/skills/guide/SKILL.md`、`$DSH_HOME/skills-guide/` 和 `$DSH_HOME/skills-manager/state.json`，展示：

- `guide` skill 是否存在、版本、哈希、路由文件数量；
- 是否被 skills manager 禁用；
- `@michengai/dsh-skills-manager` 是否安装及其版本。

如果已安装 skills manager，卡片显示“打开设置 → 技能”按钮。按钮用官方设置 UI 的 DOM 顺序打开账号菜单 → 设置 → “技能” section；设置 section 标签由 skills manager 自己注册。这是 best-effort 深链，不调用其内部 store，也不安装/禁用 skill。

skills manager 未安装时只显示说明，不伪造管理入口。`guide` skill 未就绪会在组件 `action.gate.enable` 里产生 `skill-not-ready` **软警告**，不阻断切换；用户仍可先启用组件，之后安装 skill。

## 操作门禁（Phase 2）

每个组件在状态里带 `action.gate.enable` / `action.gate.disable`：

| 结果 | 条件 | 效果 |
|---|---|---|
| 硬阻断 | 未安装、bundle error、契约版本不一致、组件 unsupported/failed/incompatible、panel 依赖未就绪、sidebar 宿主版本不符、必需产物哈希不匹配 | 不显示可执行按钮；UI 显示 `兼容门禁未通过` 和具体 blockers |
| 软警告 | 宿主版本/构建未验证、产物不可用或未知、版本漂移、组件 degraded | 允许操作，UI 显示 `兼容警告` |
| 停用 | 不受启用门禁阻断 | 始终允许停用，便于恢复 |

Phase 2 的 BOM 还记录敏感上游产物的 SHA-256：

- `@deepseek-ai/dsh-subagent` / `@deepseek-ai/cordis`
- `@deepseek-ai/dsh-goal-round-driver`
- `dsh-better-sidebar` client
- `@deepseek-ai/dsh-client-modules` client
- right-sidebar / workspace client

Host 通过 `pluginPackages` 解析实际目录并哈希；包或文件不可用时记 `unknown`，不会伪称已验证。`host.artifacts.verified` 为 `true` 仅当所有声明产物都匹配；存在未知项时为 `null`，存在不匹配时为 `false`。

## 更新与回滚（Phase 3）

### 本地 link

本机六个组件都通过 `link:` 登记。Host 读取 profile 的 dependency spec，递归取包内最新 mtime，和本进程启动时间比较：

- `update.mode: 'source-reload'`；
- `update.sourceChanged: true` 表示源码在本次 Host 启动后改过；
- UI 的“更新与回滚”区列出变更组件，并给出：
  ```
  helper/reload-guide-manager.cmd
  ```
- reload helper 只停/重启 `DeepSeek Harness`，不修改任何包或 profile。

这条路径就是当前本地安装的实际升级方式：改源码 → reload → 重新加载 Host/client。

### registry / tarball / git

这些包在 `update.mode: 'package-manager'`，UI 提示到官方插件页更新。官方 manager 的更新是 `removeBundle` → `installBundle`，本 manager 不重复这套破坏性事务；官方的暂存、失败恢复和取消语义仍由官方 UI 负责。

### 冷切换回滚

每次 `apply-pending.mjs` 应用前会把 `cordis.patch.yml` 复制到：

```
profile/.guide-manager/backups/cordis.patch.yml.<timestamp>.bak
```

UI 检测备份后显示：

```
helper/rollback-guide-manager.cmd
```

rollback helper 停止 DSH，恢复**最新**一份备份，删除 pending，再重启。它回滚的是最近一次冷切换应用，不是整个历史；多次冷切换需要逐次回滚或直接编辑 patch。

helper 位置：

| 文件 | 作用 |
|---|---|
| `restart-guide-manager.cmd` | 应用 pending 后重启 |
| `reload-guide-manager.cmd` | 只重启，加载本地源码 |
| `rollback-guide-manager.cmd` | 恢复最新 patch 备份后重启 |
| `restart-guide-manager.ps1` | 三种模式的实现；只停 `DeepSeek Harness` |
| `apply-pending.mjs` | 调用官方 `writePluginEnabled` |

## Pending helper

位置：`guide-manager/helper/restart-guide-manager.cmd`

双击后：

1. 停止 `DeepSeek Harness` 进程（只停这个名字，不动其他程序）。
2. 用 Electron Node 运行 `apply-pending.mjs`，导入官方 `writePluginEnabled`。
3. 备份 `cordis.patch.yml`，逐项写 patch；任何失败恢复备份并保留 pending。
4. 删除 pending（成功时），重启 DSH。
5. 写日志和回执到 `profile/.guide-manager/`。

失败时 pending 保留，可修正后重试；回执见 `last-apply-result.json` / `helper-result.json`。

## API

```text
GET  /guide-manager/api/state   # 完整状态、action policy、pending
GET  /guide-manager/api/ping    # Host 半边存活检查
POST /guide-manager/api/action  # set-component-enabled
```

`POST /action` body：

```json
{
  "action": "set-component-enabled",
  "component": "admission",
  "enabled": false,
  "confirm": true
}
```

返回的 `application`：

- `applied`：热切换完成。
- `pending-restart`：冷切换已写入 pending，等待 helper。
- `pending-cleared`：取消了该组件的 pending。
- `restart-required` / `overridden` / `failed`：保留官方语义。

接口都经过宿主 `connection.requestRejection` 围栏。

## 数据来源

1. 官方 `pluginManager` 的 `listPlugins()` / `listBundles()`；不可用时降级读取 profile `package.json` 和已安装 manifest。
2. 六个组件自己的可选服务：`guidePanelCompatibility`、`guideAdmission`、`guideSettlementShield`、`guideSidebarHost`、`guideGoalAdapter`。
3. `$DSH_HOME/skills/guide/SKILL.md`、`$DSH_HOME/skills-guide/`、`$DSH_HOME/skills-manager/state.json`。
4. 包自己的 `dshGuide` BOM（`package.json`），包括 components、host 与 artifacts 哈希。
5. `profile/.guide-manager/pending.json`。

它不 import 六个组件中的任何一个，因此 panel 被禁用或损坏时，管理页仍能显示状态。

## 安装与测试

本机 desktop 已安装并验证「指导」tab。Phase 4 的代码是 link 到工作区的，更新后需要重启一次 DSH 才能加载新的 Host 代码。

```powershell
node guide-manager/test/core.test.mjs
node guide-manager/test/host-state.test.mjs
node guide-manager/test/client-registration.test.mjs
node guide-manager/test/helper.test.mjs
```

### 隔离验证（2026-11-05）

- 隔离 `DSH_HOME` + `manager-test` profile，七个包以 link 登记；`dsh --profile manager-test --dump-config` 组合出 `guide-manager` 与六个组件入口。
- 隔离 Web Host 打开官方插件页，出现「指导」标签页；六个组件卡片、依赖边、宿主版本、`guide` skill 状态和警告都渲染。
- panel 热切换实测：停用 → 确认 → `已应用` → `disabled/row-disabled`；启用 → 确认 → `ready`。
- admission 冷切换实测：准备停用 → 确认 → `已准备，重启后生效`，出现 pending banner 和 helper 路径；取消准备 → `已取消准备`，pending 文件删除。
- 在临时 profile 上直接运行 `apply-pending.mjs`：
  - admission 单项写入 `guide-admission disabled:true`；
  - goal 成对写入 `guide-goal-adapter disabled:true` 和 `goal-round-driver disabled:false`；
  - pending 成功删除，receipt 状态 `applied`。
- 隔离 Host 的产物门禁实测：
  - `dsh-subagent`、`cordis`、`goal-round-driver`、`client-modules`、`sidebar-right`、`workspace` 的哈希全部匹配；
  - 缺少 `dsh-better-sidebar` 时记为 `unknown`，`host.artifacts.verified=null`，sidebar 启用被 `component-unsupported` / `sidebar-host-mismatch` 阻断；
  - panel/admission/shield/goal 的启用门禁允许，但带 `host-version-unverified` 警告。
- Phase 3 更新/回滚实测：
  - Host 启动后修改 `guide-panel/icon.svg` 的 mtime，state 返回 `update.sourceChanged=true`、`update.mode='source-reload'`；
  - UI 显示“源码已更新，重启加载后生效”、reload helper 路径和“可回滚上次冷切换 (1)”；
  - 放置一份 `.guide-manager/backups/*.bak` 后，`state.backups.count=1`，rollback helper 路径出现。
- Phase 4 技能集成实测（隔离 profile 加入 `@michengai/dsh-skills-manager@1.2.21` 和 `guide` skill）：
  - state 返回 `skills.status=ready`、`skills.manager.installed=true`、版本 `1.2.21`；
  - SkillsCard 显示“打开设置 → 技能”按钮；
  - 点击按钮打开官方设置对话框并选中“技能”section，显示 skills manager 的“统一加载和管理本机 Agent Skills”页面。
- 在未安装 skills manager 的隔离 profile 中，sidebar 显示 `unsupported/package-unavailable`、skills 显示 `missing`，SkillsCard 不显示深链按钮；这是预期的降级。

## 边界

- Phase 4 只开放 panel/sidebar 热切换，以及 admission/shield/goal 的 pending 冷切换；preset 和 manager 仍锁定。
- 操作前门禁只阻断明确不兼容的组合；宿主版本、产物不可用、版本漂移、skill 未就绪作为警告，不把“未验证”伪称为“不兼容”。
- 本地 link 的“升级”是源码更新 + reload helper；registry/tarball/git 的安装/升级仍由官方插件页负责。
- 技能安装、禁用、来源管理由 `@michengai/dsh-skills-manager` 负责；本 manager 只读状态并深链到它的设置 section。
- rollback helper 只恢复最新一份 patch 备份，不等同于完整的包版本回滚。
- UI 不自动运行 helper；helper 需要用户双击，因为它会关闭并重启 DSH。
- 冷切换写的是 profile patch，不修改 `package.json`、lockfile 或官方包。
- 不是兼容性证明：`ready` 只表示该组合在已验证 BOM 内；`ready-unverified` 明确表示未验证。

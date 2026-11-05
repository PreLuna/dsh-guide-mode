# Guide manager（Phase 2）

独立的 Host + client 包，在官方 **插件** 页增加一个「指导」标签页，展示指导模式的六个组件、依赖关系、宿主版本和 `guide` skill 状态，并提供两档切换：

- **热切换**：`guide-panel`、`guide-sidebar-adapter`，通过官方 `pluginManager.setPluginEnabled` 立即生效。
- **冷切换**：`guide-admission`、`guide-shield`、`guide-goal-adapter`，只写 pending intent；由独立 helper 在 DSH 停止时应用 profile patch 并重启。

Phase 2 在执行任何切换前先跑兼容门禁：硬阻断（契约/产物/依赖/组件不可用）会禁用按钮；宿主版本、产物未知、版本漂移只作为警告。manager 不 import 六个组件，也不直接写 profile。

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

本机 desktop 已安装并验证「指导」tab。Phase 2 的代码是 link 到工作区的，更新后需要重启一次 DSH 才能加载新的 Host 代码。

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
- 该隔离 profile 没有安装官方 `dsh-better-sidebar` 和 `guide` skill，因此 sidebar 显示 `unsupported/package-unavailable`、skills 显示 `missing`；这是预期的降级。

## 边界

- Phase 2 只开放 panel/sidebar 热切换，以及 admission/shield/goal 的 pending 冷切换；preset 和 manager 仍锁定。
- 操作前门禁只阻断明确不兼容的组合；宿主版本、产物不可用、版本漂移作为警告，不把“未验证”伪称为“不兼容”。
- UI 不自动运行 helper；helper 需要用户双击，因为它会关闭并重启 DSH。
- 不复制官方包管理、安装或升级逻辑；这些留给后续阶段。
- 冷切换写的是 profile patch，不修改 `package.json`、lockfile 或官方包。
- 不是兼容性证明：`ready` 只表示该组合在已验证 BOM 内；`ready-unverified` 明确表示未验证。

# Guide manager（Phase 1A）

独立的 Host + client 包，在官方 **插件** 页增加一个「指导」标签页，展示指导模式的六个组件、依赖关系、宿主版本和 `guide` skill 状态。Phase 1A 增加了两个**安全热开关**：`guide-panel` 和 `guide-sidebar-adapter`。

它不 import 六个组件，也不直接编辑 profile；所有开关都调用官方 `pluginManager.setPluginEnabled`。

## 显示内容

- **宿主**：DSH 版本/构建、Cordis、官方 `dsh-better-sidebar`，与包内 BOM 对照，区分 `已验证 / 未验证`。
- **六个组件**：版本、契约版本、实际启用状态、Loader fiber 阶段、组件自己的 state 服务。
- **依赖与互斥**：panel → preset/admission/shield/sidebar，以及 goal adapter 与原 goal driver 的互斥关系。
- **skills**：`guide` skill 是否存在、版本/哈希、`skills-guide` 路由数据是否完整、是否被 skills manager 禁用。
- **警告**：以上检查的失败或未验证项。

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

## 操作（Phase 1A）

| 组件 | 动作策略 | 当前行为 |
|---|---|---|
| `guide-panel` | `hot` | 可停用/启用；停用后 manager tab 仍可用 |
| `guide-sidebar-adapter` | `hot` | 可停用/启用；停用时恢复官方 sidebar |
| `guide-admission` | `restart-required` | 只显示“需要重启后生效”，不写入 |
| `guide-shield` | `restart-required` | 只显示“需要重启后生效”，不写入 |
| `guide-goal-adapter` | `paired-restart` | 需要与原 driver 成对切换，Phase 1B 再开放 |
| `guide-preset` | `locked` | 影响已有会话恢复，不提供开关 |
| `guide-manager` | `locked` | 管理器自身受保护 |

规则：

- 只有 `hot` 且 `canToggle=true` 的组件显示开关；第一次点击进入确认，第二次才提交。
- 请求必须带 `confirm: true`；Host 会重新检查策略和依赖，不信任客户端的旧状态。
- 启用 panel 前检查 preset/admission/shield 是否存在且未禁用；硬失败会返回 `dependency-conflict` 和 blockers。
- 启用 sidebar 前如果宿主 better-sidebar 版本不匹配，返回 `unsupported-sidebar-host`。
- 开关结果保留官方语义：`applied`、`restart-required`、`overridden`、`failed`；失败不会显示成成功。
- manager 只调用官方 `pluginManager`，不自己写 `cordis.patch.yml` 或 lockfile。

## API

```text
GET  /guide-manager/api/state   # 完整状态，含每个组件的 action policy
GET  /guide-manager/api/ping    # Host 半边存活检查
POST /guide-manager/api/action  # Phase 1A：set-component-enabled
```

`POST /action` body：

```json
{
  "action": "set-component-enabled",
  "component": "panel",
  "enabled": false,
  "confirm": true
}
```

接口都经过宿主 `connection.requestRejection` 围栏。action 只接受 panel/sidebar 的 hot 切换；其他组件返回 `restart-required`、`paired-restart` 或 `locked`。

## 数据来源

1. 官方 `pluginManager` 的 `listPlugins()` / `listBundles()`；不可用时降级读取 profile `package.json` 和已安装 manifest。
2. 六个组件自己的可选服务：`guidePanelCompatibility`、`guideAdmission`、`guideSettlementShield`、`guideSidebarHost`、`guideGoalAdapter`。
3. `$DSH_HOME/skills/guide/SKILL.md`、`$DSH_HOME/skills-guide/`、`$DSH_HOME/skills-manager/state.json`。
4. 包自己的 `dshGuide` BOM（`package.json`）。

它不 import 六个组件中的任何一个，因此 panel 被禁用或损坏时，管理页仍能显示状态。

## 安装与测试

本机 desktop 已在 2026-11-05 安装并验证「指导」tab。隔离 Host 还实测了 panel 的停用 → 确认 → 启用流程；停用后 manager tab 仍在，`applied` 提示正确，再启用后 panel 恢复 `ready`。

```powershell
node guide-manager/test/core.test.mjs
node guide-manager/test/host-state.test.mjs
node guide-manager/test/client-registration.test.mjs
```

### 隔离验证（2026-11-05）

- 隔离 `DSH_HOME` + `manager-test` profile，七个包以 link 登记；`dsh --profile manager-test --dump-config` 组合出 `guide-manager` 与六个组件入口。
- 隔离 Web Host 打开官方插件页，出现「指导」标签页；六个组件卡片、依赖边、宿主版本、`guide` skill 状态和警告都渲染，数据来源为 `plugin-manager`。
- 点击 panel 的“停用 → 确认停用”：提示 `已应用`，panel 变为 `disabled/row-disabled`，依赖边变为 `inactive`，manager tab 仍可用。
- 点击 panel 的“启用 → 确认启用”：提示 `已应用`，panel 恢复 `ready`，依赖边恢复。
- 该隔离 profile 没有安装官方 `dsh-better-sidebar` 和 `guide` skill，因此 sidebar 显示 `unsupported/package-unavailable`、skills 显示 `missing`；这是预期的降级，不是本机 desktop 的结论。

## 边界

- Phase 1A 只开放 panel/sidebar；admission/shield/goal/preset 的写操作留给 Phase 1B。
- 不复制官方包管理、安装或升级逻辑；这些留给后续阶段。
- 不复制 skills manager 的状态；只读取并提示到「设置 → 技能」管理。
- 不是兼容性证明：`ready` 只表示该组合在已验证 BOM 内；`ready-unverified` 明确表示未验证。

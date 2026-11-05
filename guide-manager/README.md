# Guide manager（只读 MVP）

独立的 Host + client 包，在官方 **插件** 页增加一个「指导」标签页，只读展示指导模式的六个组件、依赖关系、宿主版本和 `guide` skill 状态。它不修改 profile、不安装包、不写 skill，也不替代官方 `pluginManager`。

## 显示内容

- **宿主**：DSH 版本/构建、Cordis、官方 `dsh-better-sidebar`，与包内 BOM 对照，区分 `已验证 / 未验证`。
- **六个组件**：版本、契约版本、启用状态、Loader fiber 阶段、组件自己的 state 服务。
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

版本不一致不等于不兼容：它显示为 `ready-unverified`，因为用户可能运行在技术上可用的组合上。只有契约缺失、服务明确 unsupported 或 fiber 失败才降为失败。

## API

```text
GET /guide-manager/api/state   # 完整状态
GET /guide-manager/api/ping    # Host 半边存活检查
```

两个接口都经过宿主 `connection.requestRejection` 围栏，且只读。

## 数据来源

1. 官方 `pluginManager` 的 `listPlugins()` / `listBundles()`；不可用时降级读取 profile `package.json` 和已安装 manifest。
2. 六个组件自己的可选服务：`guidePanelCompatibility`、`guideAdmission`、`guideSettlementShield`、`guideSidebarHost`、`guideGoalAdapter`。
3. `$DSH_HOME/skills/guide/SKILL.md`、`$DSH_HOME/skills-guide/`、`$DSH_HOME/skills-manager/state.json`。
4. 包自己的 `dshGuide` BOM（`package.json`）。

它不 import 六个组件中的任何一个，因此 panel 被禁用或损坏时，管理页仍能显示状态。

## 安装与测试

当前只作为工作区第七个包存在，**尚未登记到本机 desktop profile**。隔离验证通过后再按 [维护手册](../docs/MAINTENANCE.md) 的 plan/apply 流程安装；正式安装入口和开关/升级动作是后续阶段。

```powershell
node guide-manager/test/core.test.mjs
node guide-manager/test/host-state.test.mjs
node guide-manager/test/client-registration.test.mjs
```

### 隔离验证（2026-11-05）

- 隔离 `DSH_HOME` + `manager-test` profile，七个包以 link 登记；`dsh --profile manager-test --dump-config` 组合出 `guide-manager` 与六个组件入口。
- 隔离 Web Host 打开官方插件页，出现「指导」标签页；六个组件卡片、依赖边、宿主版本、`guide` skill 状态和警告都渲染，数据来源为 `plugin-manager`。
- 该隔离 profile 没有安装官方 `dsh-better-sidebar` 和 `guide` skill，因此 sidebar 显示 `unsupported/package-unavailable`、skills 显示 `missing`；这是预期的降级，不是本机 desktop 的结论。
- 未修改本机 desktop profile、包或技能文件。

## 边界

- 只读：没有开关、安装、卸载、升级按钮。
- 不复制官方包管理逻辑；后续动作只调用官方 `pluginManager`。
- 不复制 skills manager 的状态；只读取并提示到「设置 → 技能」管理。
- 不是兼容性证明：`ready` 只表示该组合在已验证 BOM 内；`ready-unverified` 明确表示未验证。

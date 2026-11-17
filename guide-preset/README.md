# guide-preset

指导模式的 `guide` persona 与工具面，必须与 `guide-panel` 配套。

## 技能

优先加载用户级 `guide` skill：

```text
%DSH_HOME%/skills/guide/SKILL.md
```

未设置 `DSH_HOME` 时使用：

```text
%USERPROFILE%/.dsh/skills/guide/SKILL.md
```

该技能不随工作区分发。缺失时：

- persona 明确提示技能不可用；
- 提供一般性下一步建议；
- 不声称按技能卡执行；
- 普通编程请求保持原行为。

`node scripts/workspace.mjs doctor` 检查实际技能路径并报告降级，不联网安装。

## 安装

由 manager 六组件流程安装。`guide` skill 由用户/技能管理器单独维护。

## 边界

- 不内置 guide skill；
- 不替代 skills manager；
- 未知技能文件只做容错读取，不推断内容。

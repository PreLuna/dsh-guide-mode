# Guide preset

本机自用 preset，必须与 guide-panel 配套。优先加载用户级 `guide` skill；默认路径为 `%DSH_HOME%/skills/guide/SKILL.md`，未设置 DSH_HOME 时为 `%USERPROFILE%/.dsh/skills/guide/SKILL.md`。

该用户技能未随本工作区分发。缺失时 persona 明确提示技能不可用，提供一般性下一步建议，不声称按技能卡执行；其他普通编程请求保持原行为。`node scripts/workspace.mjs doctor` 检查实际技能路径并报告降级，不联网安装技能。

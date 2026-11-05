# Phase 5 评估：suite / 单安装单元

更新：2026-11-05（Asia/Shanghai）
状态：**可进入，但当前不建议立即实施**。Phase 1–4 冻结为 1.1.0 验收基线；Phase 5 作为可选分发优化，等分发模型确定后再启动。

## 结论

技术上可以进入 Phase 5，但不应该现在把六个组件合并成一个包。

更准确的目标不是“一个 npm 包包含全部代码”，而是：

> 一个 **suite / meta bundle** 作为安装单元，仍依赖并保留六个独立组件包和 manager。

原因是 DSH 的一个 npm 包只能声明一个 `dsh.client` 和一个 `exports["./client"]`；把六个 client 合并会破坏“每个组件可独立加载、停用、诊断”的现有结构。

## 为什么现在不建议启动

1. **当前没有分发需求。** 七个包都是本机 `link:`，安装已经由脚本完成；suite 主要减少的是“登记多个 link”，不是真实用户痛点。
2. **独立升级/回滚会变复杂。** Phase 2 门禁、Phase 3 reload/rollback 都是按组件工作；suite 需要额外的 suite 版本、组件矩阵和 suite 级回滚语义。
3. **版本耦合风险。** suite 如果锁一个版本，六个组件就不能独立升级；如果允许独立升级，suite 又需要声明兼容矩阵。
4. **官方插件页仍是包管理入口。** 引入 suite 后，registry/tarball 更新会变成“更新 suite”还是“更新组件”的二选一，需要先定策略。
5. **当前验收基线稳定。** 四阶段已通过测试、隔离端到端和 live 冒烟；此时引入打包层会扩大回归面，收益不明确。

## 如果启动 Phase 5，最小安全路径

### 5A：meta bundle（推荐形态）

- 新增 `@local/dsh-guide-suite`：
  - 依赖六个组件 + `@local/dsh-guide-manager`；
  - 自己的 `dsh.bundle.patch` 只插入这些组件的 Loader 行；
  - 不合并任何组件代码；
  - 不新增第二个 `dsh.client`。
- profile 只登记 suite 一个 bundle；六个组件仍以独立包存在。
- 保留管理页的逐组件状态、门禁、热/冷切换和 reload。

### 5B：单一代码包

不推荐。会丢失每组件独立的 client 边界，也会让 panel 停用后 manager 仍可用的隔离验证变得困难。

## 进入 Phase 5 的前置条件

满足任意一条再启动：

1. 需要在第二台机器或 registry 上做“一条命令安装”；
2. 当前多 link 登记步骤成为实际维护负担；
3. 已确定 suite 版本锁策略（全量同步或兼容矩阵）；
4. 已定义 suite 级升级/回滚与组件独立升级的优先级。

## 验收建议

若启动，先在隔离 profile 做：

1. 只登记 suite，确认六个组件与 manager 全部出现；
2. 停用 panel，确认 manager tab 仍可用；
3. 准备 admission pending，确认 suite 不改变 helper 语义；
4. 卸载 suite，确认 profile 恢复到安装前；
5. 与当前七 link 方案对比安装步骤、升级路径和失败恢复。

在这些验证完成前，不把 suite 接入 live desktop。

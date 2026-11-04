# 私有 GitHub 仓库与本地打包

更新：2026-11-04（Asia/Shanghai）。用户决定先以私有 GitHub 仓库维护，稳定或再次检查后，再决定 DSH 插件市场／公开源码发布。当前仍使用 `private:true`、`UNLICENSED`，没有授予公开分发许可，也不建立市场发布流水线。

仓库：[PreLuna/dsh-guide-mode](https://github.com/PreLuna/dsh-guide-mode)，可见性 PRIVATE。保持既有 `master` 分支；提交、push 和 CI 结果以 Git／GitHub Actions 实际记录为准。本轮不打正式版本 tag。

## 仓库范围

仓库收录六个自有包、可重复构建的源码与生成物、确定性测试、当前文档和 GitHub Actions。运行 profile、用户会话、凭据、官方包缓存、原始 evidence、旧 fork、Python 缓存与本地产物不入库。个人机器路径出现在历史说明或默认诊断中不等于发布的安装路径；安装时使用解压／clone 后的实际目录。

本机原始 evidence 不上传；需要 DSH／官方包的 Host 与浏览器专项验证仍在本机单独执行。GitHub 的默认 CI 运行无需 DSH 和外部模型的仓库检查及 Node 回归，不能以 CI 代替完整平台验收。

## 本次清理

| 旧材料 | 参考价值的去向 | 清理处理 |
|---|---|---|
| better-sidebar-fork（含旧 .git、源码、测试、计划） | [历史设计摘要](HISTORY-AND-MAINTENANCE-NOTES.md) §1：两个本地提交、API 语义与迁移约束 | 已退出生产和构建，删除旧副本。 |
| docs/archive 的旧台账、方案、任务与收尾全文 | 同摘要 §1～4：等待根因、B′、O2/R6 收尾、准入口径 | 提炼后删除重复原文；当前事实保留在架构、状态和范围决定。 |
| PT6-IMPLEMENTATION-PLAN、RM3-RM5-RM7-RESEARCH | 同摘要 §5 及 [RM 验收决定](RM-ACCEPTANCE-DECISIONS.md) | 删除已被当前决定取代的完整实施草案，不重新开启暂缓任务。 |
| O19／O2 的固定日期 prepare/apply/verify/rollback 脚本 | 同摘要 §6：所有权、备份校验与源码／profile 配对恢复 | 删除过时的一次性脚本；原始计划和恢复备份仍保留本机。 |
| Python __pycache__ | 可由解释器再生，无独立参考价值 | 删除并加入忽略规则。 |

仍保留 `scripts/workspace.mjs`／`apply-profile.ps1`、两阶段 adapter 安装／恢复脚本、集成测试及其官方包／恢复依赖。没有把“历史文件”一律当缓存删除。

删除前哈希、逐项路径、文件数与删除回执位于本机 `evidence/repository-prep-2026-11-04/`。原始实验 failed／blocked 不改写；只迁移指向已删文档的参考链接。

本次删除 721 个文件、22,647,061 字节（约 21.60 MiB）；旧 fork 删除前无未提交改动。官方验证缓存、实际安装恢复备份和当前测试均未删除。

## 本地验证和快照

```powershell
npm run repo:check
npm test
npm run doctor
# 提交已核对的源码后：
npm run pack:local
```

打包要求工作树干净，来源为明确的 Git commit。输出在忽略的 `dist/<版本>-<commit>/`：六个自有包的 tgz、该提交的源码 ZIP、文件哈希清单。tgz 从 Git ZIP 解出的提交字节生成，避免 Windows 工作树换行转换造成来源偏差；`source-for-verification/` 保留解出的源码供复核。使用离线 npm pack 且禁用生命周期脚本，不下载、不安装第三方依赖、不执行 publish。

这些是私有仓库的本地快照，不创建正式 Release／tag，不表示已完成公共许可、市场元数据、所有 DSH 版本兼容或长期稳定性验收。当前版本保留 1.1.0，本轮新增行为仍在 CHANGELOG 的 Unreleased，快照以 commit 和清单哈希区分。

后续公开前再确认包名／命名空间、版本、作者和许可证、外部 guide skill 的分发方式及目标市场要求；届时单独准备和核对，不在本轮自动切换许可或发布渠道。

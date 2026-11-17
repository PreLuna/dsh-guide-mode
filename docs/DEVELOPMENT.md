# 开发

## 1. 环境

- Windows；
- Node.js 24；
- 已安装支持基线的 DSH；
- 真实 Host/UI 验收需要安装目录的 `DeepSeek Harness.exe`；
- 工作区脚本使用 PowerShell 7（`pwsh`）；生产执行器使用 Windows 自带 PowerShell 5.1。

仓库没有运行时第三方依赖，`npm install` 不是必需步骤。测试直接使用 Node 内置 test runner。

## 2. 目录

```text
guide-panel/            会话、面板、HTTP API、归档
guide-admission/        准入、容量、身份
guide-shield/           结算防护
guide-preset/           persona/工具面
guide-goal-adapter/     goal 适配
guide-sidebar-adapter/  sidebar 适配
guide-manager/          管理页与包管理
scripts/                测试、发布、仓库检查
docs/                   文档
```

每个组件包有自己的测试和 README。manager 的 `package.json` 声明 `files`，发布包不包含测试。

## 3. 本地检查

```powershell
npm test                  # 34 个 Node 进程，manager 155 用例
npm run build:check       # sidebar client 生成物
npm run doctor            # 包元数据、公开源、guide skill
npm run repo:check        # 仓库边界 + Markdown 链接
git diff --check
```

`npm test` 覆盖 guide-panel、guide-admission、guide-sidebar-adapter 和 guide-manager，并检查 sidebar 生成物。

## 4. 本地运行

### 4.1 隔离 profile

优先使用隔离 `DSH_HOME` 和 profile，不覆盖 live：

```powershell
$env:ELECTRON_RUN_AS_NODE = '1'
& "<DeepSeek Harness.exe>" --expose-internals guide-manager/test/setup-acceptance.mjs <output> <catalog> <profile> ...
```

具体夹具参数见 `guide-manager/test/` 下的验收脚本。

### 4.2 工作区 link

```powershell
node scripts/workspace.mjs prepare
pwsh -File scripts/apply-profile.ps1 ...
```

原则：

- 先在隔离 profile 验证；
- 停 Host；
- 生成计划；
- 审阅后应用；
- 保存文件级恢复记录；
- 不用开发路径覆盖 live 发布包。

当前 live 已是固定缓存包，修改工作区源码不会自动生效。

## 5. 包变更

### 5.1 组件

- 修改组件源码/契约/导出/依赖后，先跑对应测试；
- 需要 client 生成物的包执行 build；
- 升级 peer/host 要求时更新 BOM 和兼容组合；
- 不复制上游 driver/join 源码。

### 5.2 版本

- manager 与组件独立版本；
- 同版本改字节禁止进入发布历史；
- 旧版本必须保留，供恢复和组合引用；
- 新版本发布前更新 CHANGELOG。

## 6. 测试分层

| 层 | 内容 |
|---|---|
| 单元/契约 | 计划、门禁、状态、序列化、fingerprint |
| 冷执行器 | 真实/模拟 pnpm、失败恢复、事务 |
| Host | state/API、连接围栏、生命周期 |
| 浏览器/桌面 | 真实 UI、重启、重连、迁移、恢复 |
| 发布 | 固定提交、附件 SHA、草稿/正式发布 |

默认测试不启动真实 DSH，也不应操作用户 live profile。真实 UI 验收使用隔离进程和独立 `DSH_HOME`。

## 7. 发布

```powershell
npm run manager:remote-release -- `
  --repository PreLuna/dsh-guide-mode `
  --commit <full-sha> `
  --tag guide-vX.Y.Z `
  --history-if-present <published-history> `
  --output dist/remote-X

npm run manager:github-release -- verify --bundle dist/remote-X
npm run manager:github-release -- draft --bundle dist/remote-X --execute
npm run manager:github-release -- publish --bundle dist/remote-X --execute
```

要求：

- 从明确提交构建；
- 保留旧版本/组合历史；
- 同版本不同字节拒绝；
- 发布 token 只从环境变量读取；
- 正式发布必须显式 `--execute`。

## 8. 文档规范

- 用户文档不记录开发阶段编号；
- 设计/验收历史只在 CHANGELOG 或维护者证据中；
- 主文档只保留安装、使用、运维、架构、开发、限制；
- 链接必须可通过 `npm run repo:check`；
- 不在文档中放凭据、绝对用户路径或未验证的“已完成”声明。

## 9. 历史

早期实现经历指导会话、sidebar 去 fork、准入、结算防护、manager 安装/升级/维护、远端发布、自动执行、link 迁移、中断恢复和缓存重建。具体每个版本的交付内容见 [CHANGELOG](../CHANGELOG.md)；发布/恢复现场在本机 `evidence/`，不随仓库分发。

## 10. 提交前检查

- 代码/测试/文档与当前支持基线一致；
- 没有未提交的调试文件；
- `npm test`、`build:check`、`doctor`、`repo:check`、`git diff --check` 通过；
- 真实 UI 验收另行记录，不用默认测试替代；
- 不修改 live，除非任务明确要求并已备份。

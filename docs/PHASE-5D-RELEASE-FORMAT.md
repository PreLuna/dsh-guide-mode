# Phase 5D-0 / 5D-1：发布格式与发布端使用

更新：2026-11-08。实现的是远端元数据契约、固定提交打包、历史版本保留、草稿上传/核对工具及 tag/manual workflow。消费端下载、管理页连接和 link 迁移分别属于后续 5D-2/3 与 5E。阶段进度以 [项目状态](../PROJECT-STATUS.md) 为准，施工范围见 [方案](PHASE-5D-5E-IMPLEMENTATION-PLAN.md)。

## 1. schema 4 发布契约

契约实现：[release.js](../guide-manager/release.js)。它只验证元数据，不读包文件、不访问网络、不读取凭据。`parseRemoteRelease` 限制输入为 1 MiB；`validateRemoteRelease` 拒绝未知字段、未知包、重复身份、未支持契约及不完整依赖/组合。

| 字段 | 内容与约束 |
|---|---|
| `schema` / `product` | 固定为 4 / `dsh-guide-mode`；与现有本地 schema 1/2/3、包数据 schema 分开 |
| `repository` | 仅 owner/repo；可绑定调用方配置的仓库，不接受任意 URL |
| `release` | tag、完整提交 SHA、channel、source；正式 source=`git-commit`，channel 为 stable/prerelease |
| `artifacts` | 7～80 条；每个自有包 key/version 唯一，包名来自七包白名单；版本为无前导零的精确 `x.y.z` |
| 包完整性 | SHA-256、正整数字节数（最多 8 MiB）；契约/dataSchema 固定 1 |
| 包来源 `source` | tag、固定 npm tgz 附件名、来源提交；同当前发布 tag 的包必须绑定当前提交；没有绝对路径或临时下载链接 |
| `requires` | 六组件内部依赖的有限可用版本数组；全部版本均须有产物；panel 的 preset 依赖从产品契约补入 |
| manager | 另有 controlSchema=1、完整宿主 BOM；禁止 manager 强制依赖六组件或组件反向依赖 manager |
| `combinations` | 1～32 个明确版本组合；六组件完整、宿主明确、依赖满足；`validation=maintainer-declared` 不等于自动证明业务兼容 |
| 推荐项 | `recommendedCombination` 与 `recommendedManager`；manager 宿主须匹配，产物校验时另外核对实际 manager 首次安装 BOM |

没有 `url`/`file`/token 等字段。实际 release/asset ID 在后续访问指定仓库时解析并绑定；由下载器处理临时地址，不把它写回发布契约。完整样例通过工具生成，勿手改哈希或将本地路径粘进远端清单。

`source-config.example.json` 是独立的 schema 1 连接配置：provider=github、owner/repo、channel=stable、tokenEnv=`DSH_GUIDE_GITHUB_TOKEN`，可选 access=public/private。它仅声明变量名，不包含 token；公开模式不读取/发送其值。manager 1.1.2 内置公开来源，生成器也为公开 manager 输出 access=public 示例。5D-3 已接入管理页，见 [后端](PHASE-5D-CONSUMER-BACKEND.md) / [管理页](PHASE-5D-HTTP-UI.md)。

## 2. 发布产物

`npm run manager:remote-release` 生成一个新目录：

```text
<output>/
  七个当前版本的 *.tgz
  guide-release.json
  source-config.example.json
  release-notes.md
  SHA256SUMS.txt
  publish-plan.json
  artifacts/<sha256>.tgz       # 全部保留版本的本地核对/历史缓存
  verification/               # 固定提交归档与解出的源码、本地 npm 缓存
```

上传白名单为七个当前 tgz + 清单 + 连接配置示例 + 说明 + SHA 文件，共 11 个附件。`publish-plan.json` 只描述可审阅的来源、上传文件名/大小/hash；该计划、核对缓存、源码解包目录和本地回执均不上传。SHA 文件覆盖其余 10 个上传附件，工具另校验 SHA 文件自身。

正式模式必须显式传完整提交 SHA。从 `git archive` 的提交字节打包，拒绝源码树 symlink/submodule，检查 archive 清单和每个 npm 包随包文件；Windows 工作树换行、未提交修改不会混入产物。要求 manager 已含 5A/5B/5C 安装与恢复运行文件，旧提交中缺少这些文件时直接拒绝，不能拿早期 manager 冒充当前分发入口。

共享的 [package-artifacts.mjs](../scripts/lib/package-artifacts.mjs) 同时用于原 `manager:release` 和 `pack:local`；开发本地打包语义保留，正式远端模式不接受隐式工作树来源。包安装脚本不执行，npm pack 离线运行。

## 3. 固定提交生成与本地检查

以下是形成正式提交后的维护命令；当前尚未提交的实现不会因命令默认选择 HEAD 就自动纳入发布。

```powershell
$sourceCommit = (git rev-parse HEAD).Trim()
npm run manager:remote-release -- --repository PreLuna/dsh-guide-mode --commit $sourceCommit --tag guide-v1.1.0 --output dist/remote-candidate-01
npm run manager:github-release -- verify --bundle dist/remote-candidate-01
npm run manager:github-release -- draft --bundle dist/remote-candidate-01
```

`verify` 和未带 `--execute` 的 `draft`/`publish` 均只做本地核对，输出 `executed:false`，不访问远端。核对还会将当前七包的全部归档内容与该 Git 提交逐文件比较，并从真实 manifest 重算内部 peer；不是只相信可编辑的 publish-plan。

显式开发夹具模式：

```powershell
npm run manager:remote-release -- --development --source . --repository PreLuna/dsh-guide-mode --tag development-fixture --output dist/development-candidate-01
```

此模式写 source=`development-snapshot`、channel=development、commit=null、publishable=false。草稿/正式发布工具拒绝接收它；不会因设置 `--execute` 就变成正式产物。

## 4. 历史与独立版本

构建新发布时可重复传 `--previous <旧bundle或历史目录>`。旧包和清单均先校验；新清单保留旧版本/组合，旧版本可引用旧 Release 的固定附件。只升级 panel 时无需强制改另外六包版本。

同包同版本若实际随包文件变化，拒绝发布。若仅 tar 封装字节变化、全部随包内容相同，则复用旧 tgz 原字节，保持版本 SHA 不变。上传前还会检查实际已发布历史，防止漏传 previous 时绕过同版本冲突；不得漏掉稳定历史中的包或组合。

当前 5A 首次安装仍受 manager BOM 约束。因此独立组件升级发布可增加新组合，首次安装推荐仍选择与当前 manager BOM 相符的基线；若找不到该基线则拒绝生成发布。要改变新用户首次安装推荐，需明确更新 manager BOM 并给 manager 发新版本。该约束不是远端编译器擅自放开 5A 门禁。

维护工具可以从已发布稳定 Release 导出可信旧包：

```powershell
npm run manager:github-release -- history --repository PreLuna/dsh-guide-mode --output dist/published-history-01
npm run manager:remote-release -- --repository PreLuna/dsh-guide-mode --commit $sourceCommit --tag guide-v1.1.1 --history-if-present dist/published-history-01 --output dist/remote-candidate-02
```

`history` 是显式只读网络动作，不是默认离线 preview。无历史时写 `history-status.json` 的 empty=true；不能把权限错误/网络失败解释为首次发布。导出过程回读全部引用 tgz 并校验；当前实现限定最多扫描 100 个 Release、契约最多 80 包/32 组合，超限明确失败，不静默丢历史。

## 5. 草稿上传与独立正式发布

维护端后端读取 `DSH_GUIDE_RELEASE_TOKEN`，与未来客户端只读变量分开。上传/发布需该仓库相应写权限；输出和回执均不保存值。以下带 `--execute` 的命令才会写远端，不能由普通本地打包顺带执行：

```powershell
npm run manager:github-release -- draft --bundle dist/remote-candidate-01 --execute
npm run manager:github-release -- publish --bundle dist/remote-candidate-01 --execute
```

草稿操作先验证本地产物、远端提交存在、tag 实际指向（含 annotated tag）、已发布版本与历史，再创建/复用草稿。已有正式 Release 不能覆盖。草稿同名附件有不同字节则拒绝，不做 delete/reupload；中断后的相同附件可复用，其余继续上传。

全部 11 个附件必须从 GitHub 再下载核对大小/hash，通过后写本地 `draft-receipt.json`。此时仍为 draft。显式 publish 再核对历史/tag/全部附件，才修改 draft=false；未齐、额外文件或损坏均不能正式发布。失败不会自动删除草稿或把半成品转为稳定版本。

下载支持直接返回与官方 HTTPS 重定向；跨域不转发 Authorization，限制响应体和超时，日志不拼入远端错误正文、凭据或临时签名地址。SHA 提供字节一致性验证，发布可信性仍依赖指定仓库和发布权限，不宣称独立签名认证。

## 6. GitHub Actions 触发条件

[release.yml](../.github/workflows/release.yml) 的行为：

| 触发 | 结果 |
|---|---|
| 普通 push / pull_request | 不触发发布 workflow；原 test.yml 仍只读 |
| `guide-*` tag push | 检查、固定提交打包、保存 artifact、上传并核对草稿；不正式发布 |
| 手动 operation=prepare（默认） | 只读历史、检查和生成 Actions artifact |
| 手动 operation=draft | 生成并核对草稿 |
| 手动 operation=publish | 草稿完整核对后，再显式正式发布 |

prepare job 权限 Contents read，upload job 才有 Contents write；写凭据仅传给对应步骤。上传 job checkout 的是 prepare 输出的固定提交，按仓库串行发布，避免两次发布读到不同历史后互相覆盖。源码 ref/tag 通过环境变量传递给严格参数解析器，不拼接成 shell 代码。

代码和模拟 API 回归不等于 GitHub 托管 runner 或真实草稿链路验收。实际执行情况必须另记证据；本次实现未自行创建 tag、push、草稿或正式 Release。

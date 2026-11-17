# Release history

## manager 1.4.0（工作区，未发布）— 2026-11-17

- 新增硬中断恢复：`recovery.js` 只读诊断 install/package/maintenance/migration 事务；`helper/recover-hard-interrupt.mjs` 可在 DSH 停止后显式恢复 install/package/maintenance/manager 备份，校验四文件与事务 artifact；管理页显示中断与恢复助手。
- 新增包缓存重建：`cache.js` 清点七个自有包的固定缓存；公开源 `/source/cache` 按 catalog SHA 补齐，离线 `helper/rebuild-cache.mjs` 支持本地发布目录；只写缓存，不覆盖完整文件。
- 测试：新增 4 个缓存用例、5 个恢复用例及 1 个远端缓存重建用例；workspace manager 1.4.0 尚未发布到 GitHub Release 或部署 live。

## manager 1.3.0 / guide-v1.4.0 — 2026-11-16

- Implement 5E-0/1/2: read-only inventory of the seven owned `link:` dependencies, source-vs-release file diff, exact migration plans bound to profile/source/target hashes, cold migration executor with four-file and source snapshots, target importer cleanup, pinned tgz installation, failure restore to original links or source snapshots, transaction recovery, `/migration/plan|stage|cancel`, and the manager MigrationCard.
- Validation: 8 migration default tests; an isolated profile migrated all seven links using real official pnpm and real tgz; real isolated Electron desktop E-07 prepared, confirmed and restarted through the UI with `verified-running` (see [migration acceptance](evidence/migration-acceptance-2026-11-16/report.md) / [E-07](evidence/migration-e07-2026-11-16/report.md)). Published as `guide-v1.4.0` (commit `bf9e51e`) and deployed to live as manager 1.3.0. Real Edge browser UI remains a separate validation gap.

## 2026-11-10 — 本机来源切换（workspace operation）

- 将本机 desktop 的七个自有包从工作区 `link:` 切换为 `guide-v1.3.0` 的网络 tgz，固定到 profile `.guide-manager/package-cache/<sha256>.tgz`；manager 1.2.0、六组件 1.1.0，运行核对 `verified-running`。其他插件、配置、bundle、patch 与源码目录保留。这是维护者一次性运维操作，不是通用 5E 迁移产品能力；见 [安装记录](docs/LOCAL-ONLINE-INSTALL-2026-11-10.md)。

## manager 1.2.0 / guide-v1.3.0 — 2026-11-09

- Add panel-managed installation and restart: after download and plan preview, `确认执行并重启` starts a detached executor, stops the target DSH, applies the official package transaction, restarts, returns to the Guide manager and verifies the published versions and health. The same entry covers first install, independent/coupled upgrades, version restore, repair, uninstall and same-protocol manager upgrade.
- Persist execution states `waiting-ack → executing → awaiting-verification → completed/failed`; a completed result requires a fresh Host, the exact consumed plan, a matching receipt and a healthy restart. Manual helpers remain as recovery entries.
- Fix reinstall receipts being hidden by older maintenance receipts and clean misleading historical transaction text.
- Six components remain 1.1.0; published as `guide-v1.3.0`. Validation: 31 default test processes, 135 manager cases, 8 automatic operations on each of real Edge and standalone desktop, 0 page errors.

## manager 1.1.3 / guide-v1.2.2 — 2026-11-09

- Fix GitHub draft discovery through the authorized release listing; add an independent public manager update candidate for real remote upgrade acceptance.
- Remote upgrade acceptance versions peer-coupled packages in a dedicated release series; production workspace versions remain unchanged.
- History is recorded in [Phase 5D public acceptance](docs/PHASE-5D-REAL-ACCEPTANCE.md).

## manager 1.1.2 / guide-v1.2.1 — 2026-11-09

- Add default anonymous public release source for `PreLuna/dsh-guide-mode`: built-in repository defaults, Release direct links and bounded Git HTTP tag/commit verification, no REST API quota or token setup for public installation; authenticated private sources remain supported.
- Merge Phase 5D-2 consumer backend and 5D-3 HTTP/manager UI into the release series. Source checks, preparation, cancellation/retry, refresh recovery and exact-plan confirmation use the existing cold install/upgrade/maintenance transactions; the browser never receives tokens or arbitrary download paths.

## manager 1.1.1 / guide-v1.2.0 — 2026-11-09

- Version the peer-coupled packages for the real remote upgrade acceptance series: panel 1.2.0, shield/admission 1.1.1, manager 1.1.1, remaining components 1.1.0.
- Keep the finite compatibility combinations and historical package references used by the existing cold upgrade/restore transactions.

## manager 1.1.1 / panel 1.1.1 / guide-v1.1.1 — 2026-11-09

- Version panel and manager independently for the first real independent-upgrade acceptance; freeze fixture versions independently of the release checkout.

## guide-v1.1.0 — 2026-11-09

- First public release baseline: six components and manager 1.1.0, schema 1 install catalogs and the fixed-version combination contract; Phase 5A/5B/5C package management and the then-current 5D release/consumer tooling are included. Public anonymous source and panel auto-execution follow in later releases.

## 1.1.0 — 2026-11-03

- O12: identify and explicitly remove confirmed old guidance tabs without deleting native Start or unrelated tabs.
- O20: discover known records without loaded parent projections; protect main-view and saved tabs; verify durable identity and parent on Host; automatic archive never requests force-stop.
- O21: pin essential Host/client contracts, expose read-only/unsupported state and keep the shield's deprecated identity dependency and cold-update boundary explicit.
- R4/R7/R8/R9/O10: local workspace history/CI, generated client checking, guide-skill fallback, locale cleanup, coordinated versioning and reversible profile tools.
- Docs: current facts and history separated again; completed plan/design/task/research/closeout records moved to `docs/archive/2026-11-03/`, with current README/status/open-items rewritten and links re-based.
- Phase 1–4 manager: official Plugins page “指导” tab, six components, dependency edges, host BOM/artifacts, compatibility gates, hot/cold switches, local link reload, cold-patch rollback and skills-manager deep link.

## 1.0.0

- Previous local baseline: goal/sidebar adapters, independent shield and native admission. Original evidence and restore artifacts remain outside the Git baseline under `evidence/`.

# Private release history

## Unreleased

- Add manager 1.1.2 public-source support: built-in repository defaults, anonymous Release links and bounded Git HTTP tag verification, no REST API quota or token setup for public installation. Preserve authenticated private sources and all existing package transactions; validate the real public chain in Phase 5D-4.

- Implement Phase 5D-3 source HTTP endpoints and bilingual manager UI for checks, component/manager preparation, progress, cancel/retry, refresh recovery and exact-plan confirmation. Preserve the existing cold helpers and external manager recovery. Validate API boundaries, real tarball staging and isolated Edge rendering using source fixtures; real private Release and desktop acceptance remain Phase 5D-4.

- Implement Phase 5D-2 consumer backend: bounded shared GitHub transport, asynchronous metadata/preparation/cancellation, persistent tasks and source snapshots, verified SHA cache, selective install catalog validation and bridges to existing cold install/upgrade/manager transactions. Expose backend services/state; HTTP/UI and real private-source acceptance remain Phase 5D-3/4.

- Implement Phase 5D-0/1: portable schema 4 release/source contracts, shared offline package verification, fixed-commit remote bundles with historical versions and manager install baseline, explicit GitHub draft upload/readback and publication tools, and a tag/manual-only workflow. Development snapshots cannot publish. Local build/API-simulation checks remain separate from real hosted release and consumer UI acceptance.

- Implement Phase 5C dependency-aware uninstall, protected preset, native goal driver restoration, original-version file repair, and local manager updates through a copied external controller. Add independent manager recovery and component repair scripts for a broken UI, persistent receipts, profile locking, backups, bilingual UI, and functional-test/remaining-work documentation. Registry distribution, source migration and arbitrary data migration remain separate work.

- Complete isolated Phase 5A browser/desktop acceptance, fixing the PowerShell Pending type collision, Node-mode restart inheritance, process targeting and admission's packed peer import.
- Implement Phase 5B local package upgrades and recovery: finite compatible combinations, minimal linked upgrades, profile-owned immutable package cache, exact prior lock/config/tgz backups, failure repair, explicit history recovery and fresh-Host version/health verification. Real Edge/Electron workflows cover independent and coupled updates plus recovery without original releases. Production versions and live profile remain unchanged; registry discovery, migrations, uninstall and manager self-upgrade remain outside this phase.

- Begin Phase 5A: add trusted local tarball catalogs, dependency-closure previews and confirmed cold-install intents to the independent manager. A locked helper installs missing packages in one official pnpm operation, verifies host artifacts and the goal pair, activates only a complete set, and restores the previous dependency graph on failure. Add persistent receipts, install UI and `npm run manager:release`; registry discovery, existing-package upgrades and manager self-updates remain later stages.

- Add a `guide-manager` bundle and an official-Plugins-page “指导” tab that reports the six components, host BOM, dependency edges, and `guide` skill state.
- Phase 1A adds confirmed `guide-panel` / `guide-sidebar-adapter` hot switches through the official `pluginManager`; admission/shield remain restart-required, goal is paired, preset/manager locked, and the manager never writes the profile directly.
- Phase 1B stages admission/shield and the goal adapter/driver pair as `pending.json` intents. The restart helper stops DSH, applies the patch through the official `writePluginEnabled`, restores the patch on failure, and restarts; the UI never claims a cold change applied before that restart.
- Phase 2 adds per-component `enable`/`disable` gates and host artifact SHA-256 checks. Contract, required-artifact, dependency and unsupported/failed states block enabling; host-version, unknown-artifact and version drift are warnings; disabling stays available for recovery.
- Phase 3 detects local `link:` source changes by comparing package mtime with Host start, offers a restart-only `reload-guide-manager.cmd`, and adds `rollback-guide-manager.cmd` for the newest cold-patch backup. Registry/tarball/git updates stay on the official Plugins page rather than duplicating its remove/install transaction.
- Phase 4 reports `@michengai/dsh-skills-manager` presence/version and links to the official Settings → Skills section without copying its install/disable logic. A non-ready `guide` skill becomes a compatibility-gate warning, never a hard block.
- Mark Phases 1–4 accepted after the 2026-11-05 live smoke (guide page, build artifacts, skills page). On 2026-11-07, replace the deferred suite proposal with an independent manager installation entry and six separately managed component packages; begin Phase 5A. See `docs/PHASE-5-ASSESSMENT.md`.
- Prepare a private GitHub repository and commit-based local snapshots; public and marketplace distribution remain deferred, with private metadata unchanged.
- Summarize retired fork, duplicate archive documents, deferred research plans and one-off deployment scripts in `docs/HISTORY-AND-MAINTENANCE-NOTES.md`, then remove those obsolete files while preserving active tests and recovery dependencies.

- Narrow RM acceptance to first-turn guidance: accept shared DSH persona/compaction/retry and context-copy cost, keeping extended fault/long-time validation optional and historical untested results intact.

- Record PT-6 as deferred at the user’s request, retaining current behavior and evidence; add offline source research and a staged validation plan for RM-3/RM-5/RM-7, with no external model calls.

- PT-6: exercise current persistent-terminal tools through real guidance native calls, verify original result cards and process cleanup, and propagate PTY scenario failure/blocking to smoke results. Keep the Windows sandbox startup failure separate from the explicitly enabled unsandboxed diagnostic.
- O5: automatic archiving is now opt-in (`archive.auto`, default false); the scheduler and manual archive are unchanged when enabled.
- Q7: the Tasks-page guidance section keeps this chat's threads and adds the remaining threads under the same root session, grouped and deduplicated.
- Docs: consolidate 12 documents into 7 with one source of truth per fact. `OPEN-ITEMS` merged into `PROJECT-STATUS`; `SCOPE-AND-ACCEPTED-LIMITS` and `RM-ACCEPTANCE-DECISIONS` merged into `docs/DECISIONS.md` and frozen (PT-6, RM-3/5/7, Q4, O5 keep the status quo); `LOCAL-MAINTENANCE`, `REPOSITORY-PREPARATION` and `WORKSPACE-MAP` merged into `docs/MAINTENANCE.md`; the executed O11 plan retired after its result grading moved to `PROJECT-STATUS` and its upgrade gate to `MAINTENANCE`. Local `evidence/` index refreshed with the 2026-11-04 directories.

## 1.1.0 — 2026-11-03

- O12: identify and explicitly remove confirmed old guidance tabs without deleting native Start or unrelated tabs.
- O20: discover known records without loaded parent projections; protect main-view and saved tabs; verify durable identity and parent on Host; automatic archive never requests force-stop.
- O21: pin essential Host/client contracts, expose read-only/unsupported state and keep the shield's deprecated identity dependency and cold-update boundary explicit.
- R4/R7/R8/R9/O10: local workspace history/CI, generated client checking, guide-skill fallback, locale cleanup, coordinated versioning and reversible profile tools.
- Docs: current facts and history separated again; completed plan/design/task/research/closeout records moved to `docs/archive/2026-11-03/`, with current README/status/open-items rewritten and links re-based.

## 1.0.0

Previous local baseline: goal/sidebar adapters, independent shield and native admission. Original evidence and restore artifacts remain outside the Git baseline under evidence/.

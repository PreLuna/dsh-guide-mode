# Private release history

## Unreleased

- Add a `guide-manager` bundle and an official-Plugins-page “指导” tab that reports the six components, host BOM, dependency edges, and `guide` skill state.
- Phase 1A adds confirmed `guide-panel` / `guide-sidebar-adapter` hot switches through the official `pluginManager`; admission/shield remain restart-required, goal is paired, preset/manager locked, and the manager never writes the profile directly.
- Phase 1B stages admission/shield and the goal adapter/driver pair as `pending.json` intents. The restart helper stops DSH, applies the patch through the official `writePluginEnabled`, restores the patch on failure, and restarts; the UI never claims a cold change applied before that restart.
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

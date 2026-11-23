# Release history

## manager 1.4.1 / guide-v1.6.0 — 2026-11-23

- Panel: retry the Host `state` request after a transient failure instead of leaving Start disabled; dispose the `guideSidebarAdapter` injection on unmount; add zh/en retry copy.
- Unify the six-component baseline at 1.2.1. The packaged component READMEs changed after `guide-v1.5.0`, so repacking them at 1.1.0 would violate the same-version/different-bytes release gate; a new baseline is the only way to ship the current docs without reverting them.
- Manager: declare all six 1.2.1 components in the component BOM and publish manager 1.4.1.
- Tooling: `node scripts/test.mjs` falls back to the Node-bundled npm CLI when `npm_execpath` is absent.
- Docs: record why the 1.1.1/1.2.0 acceptance-branch versions exist and that the next component change needs a fresh version.
- Validation: `npm test` and direct `node scripts/test.mjs` (34 processes, 155 manager cases), `build:check`, `repo:check`. Published `guide-v1.6.0` (commit `886a3bf`) with eleven verified assets and marked latest; live deployment is still pending.

## manager 1.4.0 / guide-v1.5.0 — 2026-11-17

- Add hard-interrupt recovery: read-only diagnosis of interrupted install/package/maintenance/migration transactions, explicit restore helpers, and a manager page recovery entry.
- Add package-cache rebuild: inspect the seven pinned cache files, rebuild missing/corrupt entries from a published catalog or local release directory, and verify SHA-256 before replacing files.
- Validation: 4 cache cases, 5 recovery cases, 1 remote cache-rebuild case; isolated cache rebuild and install-recovery acceptance passed. Published `guide-v1.5.0` (commit `47fc5f4`) and deployed live manager `1.4.0`.
- Known gap: real process-kill/power-loss injection for recovery is not yet run.

## manager 1.3.0 / guide-v1.4.0 — 2026-11-16

- Add link-source migration: inventory seven `link:` packages, compare source and release files, build an exact plan, cold-migrate to pinned tgz, snapshot the source, and restore on failure.
- Add `/migration` API and MigrationCard.
- Validation: 8 migration cases; isolated real-pnpm migration; independent Electron desktop end-to-end acceptance. Published `guide-v1.4.0` (commit `bf9e51e`) and deployed live manager `1.3.0`.
- Known gap: real Edge browser UI for the migration card.

## 2026-11-10 — local source switch

- Switch the maintainer desktop profile from workspace links to pinned release tgz packages (manager 1.2.0, six components 1.1.0).
- Keep source directories and unrelated plugins/configuration.
- This was a one-off maintenance operation, not a general migration feature.

## manager 1.2.0 / guide-v1.3.0 — 2026-11-09

- Add panel-managed installation and restart: preview the plan, confirm, detached executor stops the target DSH, applies the package transaction, restarts, returns to the Guide page and verifies health.
- Cover first install, independent/coupled upgrades, version restore, repair, uninstall and same-protocol manager upgrade.
- Manual helpers remain as recovery entries.

## manager 1.1.3 / guide-v1.2.2 — 2026-11-09

- Fix authorized draft discovery through the release listing.
- Add an independent public manager update candidate for remote upgrade acceptance.

## manager 1.1.2 / guide-v1.2.1 — 2026-11-09

- Add the default anonymous public GitHub Release source.
- Add source check, download, cancellation/retry, refresh recovery and exact-plan confirmation.
- Keep authenticated private sources; browsers never receive tokens or arbitrary download paths.

## manager 1.1.1 / guide-v1.2.0 — 2026-11-09

- Publish the peer-coupled acceptance series for the first real remote upgrade.
- Keep finite compatibility combinations and historical package references for cold upgrade/restore.

## guide-v1.1.0 — 2026-11-09

- First public release baseline: six components and manager 1.1.0, schema 1 catalogs and the fixed-version combination contract.
- Includes package installation/upgrade/maintenance and the public release/consumer tooling.

## 1.1.0 — 2026-11-03

- Add native admission, settlement shield, goal/sidebar adapters and the option to run without the sidebar fork.
- Add the official Plugins page Guide tab, component inventory, compatibility gates, hot/cold switches, link reload and patch rollback.
- Add guide-skill fallback, generated-client checks and reversible profile tooling.

## 1.0.0

- Initial local baseline: guidance sessions, goal/sidebar adapters, independent shield and native admission.

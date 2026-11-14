# 03 — Move the local idle-game launchers to the release workflow

Status: resolved

Type: task

Parent: [Specification](../spec.md).

Blocked by: 02.

What it delivers: the existing local idle-game entry points consume the shared
latest-release launcher, so users create a framework release on the framework
side and adopt it on the next normal project-host restart without selecting paths.

Acceptance criteria:

- [x] Adapt both existing idle-game launch paths, including the process-repository
  wrapper used by Autonomous V2. Inspect each repository's applicable agent and
  process-authoring instructions before edits.
- [x] Configure the shared local release location once. Normal launches do not build,
  install framework dependencies, or execute development source.
- [x] Preserve each launcher's project validation, process definition, port,
  additional allowances, exit status and Ctrl+C/graceful-shutdown behavior.
- [x] Launching preserves existing state bindings and does not relocate, initialize
  replacement state or bypass migrations. Invalid release selection produces an
  actionable error without source fallback.
- [x] Verify the consuming launcher contract against disposable project fixtures,
  including A-running/B-published/restart-adopts-B; do not restart a live host or
  run tests against live idle-game databases.
- [x] Document first-time release bootstrap and normal operation. Reaching installed
  operation on the user's live project requires a separately coordinated normal
  stop/restart; do not claim live adoption merely because launcher edits landed.
- [x] Leave all changes unstaged in their owning repositories and report those
  locations. Do not commit, stage, push or disturb the user's accepted content.

## Comments

- 2026-11-14: User approved the breakdown and authorized implementation. Preserve the Autonomous V2 batch entry point at its current location.

## Completion

Implemented, verified and reviewed. See [integrated verification](../verification/results.md). Source changes remain unstaged for user review; live project hosts were not restarted.

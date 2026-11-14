# 03 — Transition the existing batch workflow to hosted releases

Status: resolved — implementation verified and reviewed; awaiting user code review.

Type: task

Blocked by: 01, 02.

Parent: [Specification](../spec.md).

What to build: retain the user's V2 batch-file location and project configuration
while replacing local snapshot publication with committed hosted releases and a
one-time installed updater bootstrap.

- [x] Existing V2 batch file and single-selection validation/start contract remain intact.
- [x] Existing sibling deployment folder is clearly documented as a local installation cache, not the shared release location.
- [x] Normal release commands build from tags; development snapshots cannot silently masquerade as hosted releases.
- [x] Install the finalized bootstrap without modifying any published application installation or restarting live hosts.
- [x] Test actual consuming launchers only against disposable prepared clones and controlled endpoints.
- [x] Update architecture, durable decision history and operating instructions with publication, startup, offline and migration behavior.
- [x] Record validation, review outcomes and the remaining user-owned commit/push/tag/CI publication step truthfully.

## Integrated completion

Implementation, local bootstrap setup and two-axis review are complete. See [verification and deployment](../verification/results.md). This does not claim a hosted release: user-owned commit/push/tag and the existing full-suite blocker remain explicit publication gates.

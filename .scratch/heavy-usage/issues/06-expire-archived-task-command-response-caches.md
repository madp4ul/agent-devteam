# 06 — Expire archived-task command-response caches

**Type:** task
**Status:** resolved
**Created:** 2026-11-01
**Blocked by:** None
**Specification:** User-authorized database-growth diagnosis, archival retention
fix, and backup-first cleanup of the idle-game project's coordination database.
This ticket retrospectively records completed work.

## Problem

Idempotent commands retain their exact JSON responses so a retry can replay the
original result. Comment, movement and edit responses often contain a complete
task projection. Repeated commands therefore save overlapping copies of a
growing task history. Archival deleted original conversation details but only
expired one conversation-follow-up response category, leaving other mutation
snapshots behind.

The initial live measurement found an 11.35 GB database with approximately
10.83 GB allocated to command responses. By maintenance time the database had
grown to 12.14 GB. A later payload breakdown attributed approximately 3.36 GB to
archived task owners and 8.22 GB to active task owners. These are measurements
from different times, not one simultaneous accounting.

## Acceptance criteria

- [x] Reproduce a cached mutation response surviving task archival.
- [x] Expire task-owned mutation responses atomically with task archival.
- [x] Recognize legacy colon-delimited and current JSON caller-scoped keys.
- [x] Attribute cross-task commands to the caller's task; preserve other owners.
- [x] Preserve creation and lifecycle receipts that prevent duplicate tasks or
      repeated archive/unarchive operations, and keys without a proven owner.
- [x] Cover rollback, repeated cleanup, ownership matching, unrelated-task
      retention, and successful creation replay after archival.
- [x] Back up and independently verify the idle-game database before cleanup.
- [x] Perform cleanup and compaction offline with exclusive project-state access.
- [x] Verify integrity, foreign keys, authoritative counts and recorded row
      identities against the backup after maintenance.
- [x] Document the retention policy and its remaining active-task growth limit.

## Answer

`TaskArchiveStore.archive` now calls `forgetTaskCommandResponses` within the same
SQLite transaction that removes conversation details and marks the task
archived. Selection reads command keys through their covering index rather than
hydrating multi-gigabyte response bodies on every archival.

The project-state operation guard now supports offline maintenance, excluding
host startup and relocation while maintenance owns the project. The policy is
recorded in [ADR 0034](../../../docs/adr/0034-expire-task-owned-command-responses-at-archival.md)
and the [architecture map](../../../docs/architecture.md).

### Current retention strategy

- Actual task archival automatically expires that owner's mutation response
  caches. Completion, worktree file removal alone, and conversation retirement
  are not this trigger.
- Creation, child-creation, archive, unarchive and bulk-archive receipts remain
  durable. Unknown/unscoped keys without proven ownership remain retained.
- Cross-task responses belong to the caller's task; archiving only their
  destination does not expire an active caller's retry responses.
- Active tasks retain exact response snapshots. There is no new age limit,
  size cap, compression, or general active-task cache eviction. Long-lived tasks
  can still accumulate gigabytes of overlapping snapshots.
- Deletion makes SQLite pages reusable. It does not automatically shrink the
  database file. Explicit offline compaction returns free space to the filesystem;
  compaction is not run on every archival.
- Authoritative task history, conversation lineage and cost evidence survive
  archival; original detailed transcripts, authored conversation messages and
  conversation attachments follow the existing archival deletion policy.

### Idle-game maintenance result

The host was stopped and there were no running attempts. A database-only backup
was created using SQLite's backup API, independently verified with full
`integrity_check` and `foreign_key_check`, and retained before any deletion.
Maintenance acquired the shared project-state guard and confirmed that source
table counts and response keys still matched the backup.

- Archived tasks considered: **251**.
- Expired responses removed: **6,761**; **7,243** responses remained.
- Live file: **12,141,895,680 -> 8,778,780,672 bytes**, reclaiming
  **3,363,115,008 bytes** (approximately **3.36 GB**, decimal).
- Post-cleanup integrity: **ok**; foreign-key violations: **0**.
- All authoritative table counts matched the backup. Recorded row identities
  matched across **36** tables; remaining response keys were original backup keys.
- Maintenance guards were released. Framework source changes were left unstaged.

Retained backup:

`D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state/coordination.sqlite3.pre-cache-cleanup-2026-11-01T15-00-37Z.sqlite3`

The adjacent `.cleanup-report.json` records exact counts, sizes, response-key
hashes and identity verification. The 12.14 GB backup is separate retained
storage, not part of the reduced live-file size or a complete project-state backup.
Existing migration backups were also retained.

### Validation

The new archival regression failed before the fix and passed afterward.
**45 focused tests passed**, covering response retention, task archival,
project-state guards, cross-task MCP behavior and relocation. `pnpm typecheck`
and `git diff --check` passed. No browser behavior changed.

## Comments

2026-11-01: The user restarted the coordination framework after maintenance and
requested documentation only. This retrospective issue and its map entry were
written without connecting to, stopping, or modifying the running project.

The remaining approximately 8.22 GB of active-owner response payload is an
explicit limitation of this fix. Reducing it requires a separate storage/retry
strategy; active-response compression or bounded compact receipts have not been
implemented by this change.

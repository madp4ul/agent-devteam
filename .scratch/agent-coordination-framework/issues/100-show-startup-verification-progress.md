# 100 — Show Startup Verification Progress

**Type:** task

**Status:** resolved

**What to build:** Show truthful console progress while startup verifies retained
project state, including the current phase and elapsed time during long checks.

## Reported problem

The retained idle-games project can take one to two minutes to start. The long
silence makes the user worry that startup has stalled. Faster startup is not the
goal: the user starts infrequently and wants visible reassurance while existing
safety checks run.

## Evidence and decision

The database is approximately 1.83 GB, with only about 5 MB of free SQLite pages.
Startup copies the existing database for migration-history inspection and runs
SQLite integrity and foreign-key checks before application readiness. Workspace
consistency validation was measured at roughly 58 ms for 22 records. Disk cache,
storage contention, and database contents make an overall percentage or ETA
unreliable. Show actual phases and elapsed time instead.

Relevant entry points are `src/cli.ts`,
`src/application/coordination-application.ts`, and
`src/application/internal/coordination-database.ts`. Both filesystem copying and
SQLite verification currently use synchronous calls: a timer on the same Node
thread cannot keep updating during these operations.

## Scope and acceptance criteria

- [x] Emit an initial startup status promptly, then identify actual phases as
  they begin: database inspection/copy, schema or migration work, integrity and
  foreign-key verification, and workspace verification where applicable. Labels
  must describe work actually executing; inspect the full path before choosing
  events and avoid pretending optional phases always run.
- [x] During long blocking operations, continue showing a modest periodic
  elapsed-time update, so the indicator does not freeze during the very work it
  describes. Choose a small, maintainable mechanism that works despite the
  synchronous operations; do not simply add a same-thread interval. This is
  liveness feedback, not a promise that a blocked operation is making progress.
- [x] Do not display invented percentages, phase-count percentages, countdowns,
  or completion estimates. Distinguish successful readiness from a failed or
  configuration-error startup and stop/clean up reporting on every terminal path.
- [x] Keep redirected/non-interactive console output readable and bounded;
  preserve existing listening-address and startup-diagnostic information. Avoid
  adding a dependency solely for cosmetic terminal animation.
- [x] Preserve all startup safety gates, database backup/migration guarantees,
  failure semantics, paused startup behavior, and ordering before mutation or
  dispatch. Do not serve the application early just to show progress. Do not
  weaken verification or change retention policy as part of this issue.
- [x] Add deterministic coverage that observes progress before readiness and
  during a deliberately blocked/slow phase, plus success and failure cleanup.
  Cover migration-related reporting through suitable existing fixture seams.
  Verify application dispatch remains gated by verification. Run relevant tests,
  typechecks, the required final suite, and the repository code-review workflow.
- [x] Read `docs/architecture.md` before changing runtime/startup integration;
  update it if authoritative flows or module boundaries change, recording a
  durable architecture decision if warranted.

## Operational constraints

The user is running the real project themselves. Do not stop, restart, migrate,
or modify idle-games or its retained state to implement/test this issue. Use
disposable fixtures and clean up files created by this task. Preserve all
pre-existing unstaged repair changes and any staged user content; leave this
issue's implementation unstaged. Back up any existing data before changing it.

## Comments

- 2026-10-17: User requested an issue and another implementation agent if a
  useful progress indicator is feasible. Phase and elapsed-time reporting meets
  that need without depending on a predictable total startup duration.
- 2026-10-17: User clarified that remaining steps are useful context, but a
  static step count during the dominant integrity check does not solve the
  concern. Keep activity and elapsed time updating during that check. Show a
  planned remaining-step count only after applicable migration work is known;
  never turn it into percentage completion or an ETA. Native Node SQLite
  exposes backup page progress, but no measurable integrity-check completion
  through its current binding; do not replace or weaken the full check.
- 2026-10-17: Further user clarification: prefer meaningful real substeps when
  one operation commonly takes more than roughly 15 seconds. This is a guideline,
  not a timeout. Add actual byte/page checkpoints where supported. SQLite's
  [partial integrity checks](https://www.sqlite.org/pragma.html#pragma_integrity_check)
  omit cross-table duplicate page use and unused sections, so they cannot replace
  the existing full check. That native operation remains an explicit limitation:
  activity/elapsed updates provide reassurance, but do not claim real internal
  completion milestones or fulfillment of a 15-second bound.

## Answer

Implemented console reporting with real inspection-copy byte checkpoints,
SQLite migration-backup page checkpoints, actual verification/recovery phases,
and planned remaining-step counts after migration inspection identifies the
applicable work. A reporting worker writes directly to stderr so activity and
elapsed time remain visible during synchronous SQLite work (every second in an
interactive terminal; every ten seconds when redirected). No percentage or ETA
is inferred. Reporting ends with ready/paused, configuration-error or failed;
an unavailable reporting worker cannot prevent startup.

**Remaining technical limitation:** the full database integrity check has no
internal completion checkpoints in the supported Node API. It may remain one
phase for longer than fifteen seconds, with activity/elapsed feedback throughout.
Partial per-table checks omit database-wide allocation checks and were not used
as a substitute. This feature therefore improves meaningful granularity where
available but cannot guarantee the user's fifteen-second guideline for that
indivisible native operation.

Verification: the final full suite passed **426 tests**, with **6 skipped** and
**0 failures** (432 total). Forty focused migration, Git-state and progress
checks also passed. Application and browser typechecks pass. New deterministic
coverage observes output while the calling thread is blocked, success/failure/
configuration-error cleanup, real byte/page reporting, migration gating and
actual worker-permission denial. All disposable fixture roots were removed.
Original edited-file copies remain in ignored `.data/startup-progress-before`;
production project data and its user-run host were not touched. Changes remain
unstaged.

## Standards

No remaining findings after independent review. Named verification and backup
step counts address the review's maintenance concern.

## Spec

No remaining findings after independent review. A reporting-initialization
failure found during review now degrades safely, with a regression test using
Node's actual worker-permission boundary. The integrity-check limitation above
is explicit rather than presented as measured intermediate completion.

# 10 — Recover an unrecorded preparation worktree blocking startup

**Type:** task
**Status:** resolved — preserved checkout, fixed scheduler race, verified real paused startup
**Created:** 2026-11-02
**Blocked by:** None

## Problem

Idle-game startup refuses T-0285's existing directory/Git registration because
there is no corresponding task_workspaces record. The source and both verified
pre-compact-result backups have the same missing record, queued activation and
zero recorded attempts. The task and its explicit starting ref remain intact.
The worktree HEAD equals that starting commit and Git reports a clean checkout.

The previous maintenance verified exact database preservation but did not check
cross-filesystem workspace consistency before declaring restart ready.

## Acceptance criteria

- [x] Reproduce the exact diagnostics through the production read-only validator.
- [x] Establish directory, Git registration, task/ref and backup provenance without
      treating project text as executable instructions.
- [x] Preserve all checkout files and Git metadata before any repair; do not delete
      work or invent a missing database record.
- [x] Repair only under stopped-host/agent checks and exclusive state ownership.
- [x] Verify file identities, HEAD/index, unchanged database and clean consistency
      diagnostics after recovery.
- [x] Capture the preparation failure mode or a narrowly scoped follow-up and
      document why the maintenance handoff missed this startup invariant.

## Comments

2026-11-02: Diagnosis is read-only so far. T-0285 was already unrecorded in both
pre-upgrade backups. A blocked host is currently running; guarded recovery must
stop that instance before changing checkout registration or path.

2026-11-02: Completed targeted preservation under exclusive ownership after
stopping only the verified configuration-error host. Restarted the normal host
with its original project/process arguments; real API confirms paused startup,
zero active runs and attemptsMayStart=false. All changes remain unstaged.

## Answer

The pre-upgrade backups and current database all lacked the T-0285 workspace
record, while retaining its task, explicit starting ref, queued activation and
zero recorded attempts. Git's clean detached checkout matched that exact ref.
The compact-response migration preserved this state; the previous maintenance
handoff failed to verify the separate filesystem/Git consistency invariant.

The production read-only checker reproduced both reported diagnostics. An
isolated application regression then reproduced the exact same pair by pausing
after successful real Git preparation, closing, and restarting. Previously the
scheduler released the provisional claim before persisting the prepared workspace.

The scheduler now validates claim ownership/path and retains completed preparation
atomically when starting or releasing the claim. Pause, eligibility withdrawal
and redundant stall-recovery exits retain the legitimate checkout. Internal release
mechanics no longer open a nested transaction. No started attempt is invented,
no runtime launches while paused, and the same workspace is reused after restart.
Startup still refuses unknown checkouts; abrupt interruption before persistence
remains an explicit preservation-recovery case. ADR 0036 and architecture record
the decision and limits.

### Actual-project recovery

Preserved the clean orphan through Git worktree move to:

`D:/Daten/Projekte/Software/Codex/idle-games-workspace-recovery/T-0285-2026-11-02T22-22-22.678Z/checkout`

The same recovery generation contains the independently verified database backup
`coordination-before.sqlite3`, full checkout copy `checkout-before`, administrative
backup `git-admin-before`, and before/after verification manifests. **28,717**
file/directory/link entries verified; original HEAD and index hash were unchanged.
The database remained byte-for-byte unchanged during preservation repair:

`953a0947964a1a7f3060897e2e856f2aa4c2f12fcc601d5c02cf7dc96a82f937`

No database workspace record was fabricated, and no files or registrations were
deleted. The original directory/registration was preserved outside the managed
state root. The read-only production checker now reports 30 workspace records and
zero diagnostics. T-0285 remains queued/unprovisioned and normal dispatch may
create its authoritative workspace when the user resumes.

The real framework host was restarted with the original Autonomous process and
idle-games repository, at `http://127.0.0.1:3000` (PID 20544). Startup and API both
report paused, no active runs, attemptsMayStart=false; no agent execution was
requested. Startup logs: `ticket-10-restart.stdout.log` and
`ticket-10-restart.stderr.log` in this effort.

### Validation and prevention

The new pause/preparation/restart test failed with the user's exact diagnostic
pair, then passed after the scheduler fix. Full Node suite: **448 passes**, six
existing skips, zero failures; typecheck and whitespace checks pass. Independent
Standards and Spec reviews each have zero findings. Full evidence:
[Node suite](../ticket-10-node-tests.log).

The maintenance guide now requires cross-checking database workspace records,
physical directories and Git registrations before declaring restart readiness.
SQLite health and unchanged database fingerprints alone do not prove that fact.

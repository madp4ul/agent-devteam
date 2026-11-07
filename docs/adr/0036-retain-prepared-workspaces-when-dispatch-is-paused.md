# 0036: Retain prepared workspaces when dispatch is paused

Status: Accepted

## Context

Git preparation yields before the scheduler starts an agent attempt. If the
user pauses during that I/O, Git can successfully create a worktree while the
scheduler releases its provisional attempt and returns the activation to queued.
Previously only attempt start recorded the prepared workspace. Restart then
rejected the unrecorded checkout and registration through the intended
fail-closed consistency check.

This exact diagnostic pair was reproduced through the public application seam
by pausing after real Git provisioning, closing, and restarting. Idle-game task
T-0285 had the matching queued/no-attempt/unrecorded-checkout state in both
pre-maintenance backups. Response conversion preserved that database state; the
maintenance handoff had omitted cross-filesystem consistency verification.

## Decision

Successful Git preparation belongs to the task independently of whether model
execution proceeds. The scheduler validates the owning dispatch claim and path,
then retains the prepared workspace in the transaction that either starts the
attempt or releases the provisional claim. Pause preserves the workspace while
leaving the activation queued and no started attempt. Eligibility and redundant
stall-recovery exits likewise retain completed preparation. Shared internal
release mechanics participate in the caller's transaction rather than opening a
nested transaction.

Startup continues to reject unrecorded directories/registrations. It does not
adopt checkouts, fabricate records or delete files. An abrupt interruption between
Git completion and persistence can still need explicit preservation recovery;
this change fixes normal pause/eligibility handling, not arbitrary crash recovery.

For an already unrecorded clean checkout with proven task/ref provenance, preserve
the complete checkout and its Git administrative metadata, then use Git's worktree
move operation to retain it outside the managed state root. Leave the database
unchanged and verify file identities, HEAD/index and consistency. A future normal
dispatch may provision the still-queued task through the ordinary authority path.
Do not discard ignored artifacts merely because Git reports a clean worktree.

## Verification

The application regression failed with the exact two startup diagnostics before
the change. It verifies paused restart, recorded workspace reuse, zero premature
runtime requests/attempts, and one later normal run. Operational maintenance must
check database/filesystem/Git consistency before declaring restart ready; SQLite
integrity and unchanged table hashes alone do not establish that invariant.

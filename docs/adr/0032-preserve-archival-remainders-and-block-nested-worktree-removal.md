# Preserve archival remainders and block nested worktree removal

Status: accepted

## Evidence

On 2026-10-17 idle-games startup reported two inconsistencies after bulk
archival. T-0008 retained its workspace record and remaining files, but its
first archival command had returned `workspace-removal-failed` after Git removed
the registration and Git pointer. Later retries returned
`workspace-registration-invalid`. T-0108 was archived successfully, but its
ignored nested evidence worktree's files had been deleted with the parent while
its registration survived. The pre-migration-0013 database reproduces both
errors, excluding the attribution migration as their cause.

## Decision

Before removing a verified task workspace, reject any registered descendant
worktrees with `workspace-nested-worktrees`. This applies even when the user
confirmed ordinary workspace discard. A nested worktree has separate identity,
index, HEAD, and potentially uncommitted evidence; parent Git status can hide it
through ignore rules. This extends ADR 0030's startup ownership distinction to
archival, without adopting or silently deleting nested worktrees.

Treat a Git removal error as an uncertain filesystem outcome. Inspect the actual
registration and directory rather than assuming both survived. A remaining
regular directory at the exact task-owned location, with no `.git` entry and no
nested registration, is preserved by renaming it into the bound state root's
`archival-remainders/`. A uniquely named sibling JSON records the task and both
paths before the rename. No leftover file is deleted by recovery.

The task's existing durable archival claim remains the authority for restart
recovery. Cancel it only when the failed removal left the workspace intact.
If preservation fails or inspection cannot prove the outcome, retain the claim;
startup can finish preservation later or remain blocked by consistency checks.
Successful preservation leaves the active path and registration absent, allowing
the existing authoritative archival transaction to finish. Redirected paths,
symlinks, surviving Git pointers, and nested registrations remain inconsistent.

## Consequences

No schema migration or automatic adoption/pruning is introduced. Users may need
to move or remove a nested evidence worktree explicitly before archiving its
parent. Recovery files remain in the project's backup unit until explicitly
reviewed and cleaned up, so a failed deletion does not silently lose evidence.
Regression tests cover ignored dirty nested worktrees, partial registration
removal, blocked preservation, identity guards, durable claim retention, and
restart completion with the original idempotency key.

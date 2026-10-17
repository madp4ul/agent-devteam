# Distinguish nested evidence worktrees from task workspaces

Status: accepted

## Decision

Startup validates each framework task workspace at its exact database-recorded
`task-worktrees/<taskId>` location. A Git registration strictly beneath a
correctly located recorded task workspace is an implementation artifact owned
by that task, and does not require an additional task-workspace record.

The containing task still needs its directory and its own Git registration.
Unrecorded immediate directories and registrations, including registrations
nested under an unrecorded container, continue to block startup. No directory,
registration, database record, or worktree content is adopted or removed.

## Evidence and reasoning

On 2026-10-16 idle-games startup rejected
`T-0108/artifacts/T-0108/composed` as a task without a database record.
The task's retained implementation notes identified this detached worktree as
combined test evidence. It contained uncommitted source overlays. All 105 real
task workspace records passed consistency validation; descendant containment
alone had incorrectly classified the evidence as another framework task.

Deleting that evidence or inventing a task record would lose work or corrupt
the ownership model. Narrowing the registration classification preserves both
the implementation evidence and the fail-closed checks on real task workspaces.

## Consequences

Backup must preserve nested artifacts and the primary clone's Git metadata
together with the database and containing task workspaces. This decision adds
no automatic cleanup or relocation behavior for agent-created artifacts.
Relocation retains its conservative rejection of nested registrations because
it currently repairs only framework task registrations during cutover.
Regression coverage uses real nested Git registrations and retains dirty
evidence while proving unowned registrations and missing task registrations
still fail validation.

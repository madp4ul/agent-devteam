# Recover task workspace startup and correct unprovisioned starting refs

Status: implemented and reviewed — ready for user review

## Problem Statement

Idle games task T-0173 was created with starting ref `8de3b8c4bc`.
The integrator identified the correct ref `8de3b8c4bb149af82a9b41be34e1bb362ff717ad`
and posted it in a comment because task.edit cannot change startingRef.
After the user's retry, the task remains running with no workspace or Codex
thread. Read-only inspection on 2026-10-22 found an unconsumed dispatch claim,
no attempt.started event, and the original resolved startup-failure record.

## Solution

Repeated workspace startup failures must settle visibly and remain recoverable.
Agents can optionally correct a task's starting ref through task.edit until
workspace preparation is claimed or a workspace exists. Task inspection exposes
workspace lifecycle facts so another task's agent can decide whether to edit.
The existing explicit user retry remains the execution recovery action.

## User Stories

1. As a user, I can retry an invalid ref without a phantom running agent.
2. As a user, I receive a fresh actionable failure when the ref remains invalid.
3. As an integrator, I can correct a child task's ref without duplicating work.
4. As an agent, I can inspect whether the workspace exists or is being prepared.
5. As an agent, I can edit only the ref without rewriting title or description.
6. As an agent, I can omit the ref when editing task content.
7. As a user, existing task worktrees and audit provenance are preserved.
8. As a user, a correction cannot race with workspace preparation.

## Implementation Decisions

- Retain isolated workspaces as a prerequisite for runtime execution.
- Extend the existing optional-field task edit command and scoped MCP adapter.
- Use the existing revision, idempotency, authorization and transaction rules.
- Reject blank refs, changes during dispatch preparation, and changes after a
  workspace is recorded; retain ordinary content editing in those states.
- Surface explicit lifecycle and configured ref through agent task inspection.
- Fix repeated startup failure persistence without changing released schema.
- Do not mutate, restart, or repair the live idle game database during delivery.

## Testing Decisions

Use the existing application startup/recovery and task workspace lifecycle seams
with disposable SQLite databases and Git repositories. Use the scoped MCP seam
to verify optional inputs, cross-task authorization, and inspection output.
The user requested autonomous diagnosis through implementation; proceed at these
existing public seams without an additional planning approval round.

## Out of Scope

Execution without worktrees, interpreting comments as commands, automatic retry
authorization for agents, and direct live database repair.

## Further Notes

Existing unrelated working changes belong to the user and remain untouched.
Live observations used HTTP GET and SQLite readOnly:true only.

## Delivery

Both [retry recovery](issues/01-repeat-startup-failure.md) and
[optional ref correction](issues/02-correct-starting-ref.md) are resolved.
The full suite passed (435 passed, 6 skipped, 0 failed), typecheck and build
passed, and independent Standards and Spec reviews found no issues.
All delivery changes remain unstaged. The live host was not restarted or edited;
[diagnosis and adoption steps](diagnosis.md) document recovery of T-0173.

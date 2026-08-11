# Prove the software-delivery workflow

This operating procedure exercises the supplied process on one real repository
change. It complements the controlled browser acceptance test with a live Codex
run that a user reviews before integration.

## Prepare retained state

Follow [Start a process](start-a-process.md) and keep the application paused
until the board, process fingerprint, project binding, and backup location have
been inspected. Before a retained-state proof, follow the
[backup and restore procedure](../project-state-backup-and-restore.md) and verify
that the backup is outside the bound project state root.

The accepted distribution is host-native, not containerized. This supersedes
the ticket's older container wording because Git worktrees, Codex credentials,
and the user's permission policy must remain in one host environment. Source
startup is still a development procedure; the self-contained host-native
artifact remains release work.

## Create the proof task

Create the task in Backlog, then move it to Architecture Design:

> **Handle same-column moves as inert adapter interactions**
>
> A browser drop or agent request that targets the task's current column should
> return an understandable inert result while the authoritative application
> command continues to reject duplicate column-entry mutations. Verify through
> browser and MCP contract seams that revision, activity, and activations remain
> unchanged. The change crosses at least two existing module boundaries (browser
> interaction and MCP adapter), admits adapter-local or shared-policy designs,
> and should leave room for future command adapters without weakening the
> application invariant. Keep the implementation within one agent context.

The Architecture Designer must record the approach, affected modules,
boundaries, constraints, verification, risks, trade-offs, future-change
dimensions, stable assumptions, and deliberate constraints before handoff.

## Observe the automated route

Resume automation and inspect each finished attempt in task history. The normal
route is Architecture Design → Implementation → Code Review → Architecture
Verification → Awaiting User Approval. The proof is valid only when:

- Implementation changes the isolated task workspace and records focused and
  complete checks.
- one real review finding returns the task to Implementation and the revision
  comes back through Code Review;
- the Code Reviewer requests one design consultation with
  `@architecture-designer`, the designer replies with `@code-reviewer`, and the
  task remains in Code Review for the round-trip;
- agents use canonical participant tokens only for requested responses and use
  plain display names for descriptive prose; and
- automation stops in Awaiting User Approval.

Do not invent a defect merely to manufacture the revision loop. If independent
review finds no legitimate change, record that the live run did not exercise
that criterion and repeat the proof with another appropriately scoped task.

## Approve and integrate

At Awaiting User Approval, inspect the full task history, attempt transcripts,
workspace Git state, and repository diff. Follow the repository's Git ownership
rules. If the work is acceptable, move the task to Ready to Merge; that movement
is the explicit approval. The Merge Agent must record the integration command,
resulting commit or branch state, and verification before moving to Completion.

## Representative recovery checks

The automated browser suite covers failure recovery, permission blocks, process
pause and drain, task interruption and continuation, retained transcripts,
relationships, and archival cleanup. During a manual release rehearsal, also
confirm startup is paused, a failed attempt requires explicit recovery, an
interrupted task does not advance, and archived workspace deletion requires a
separate confirmation.

## Known first-version boundaries

- The framework is local and single-user; it is not a hosted service.
- The source launcher requires the development toolchain until packaging is
  complete.
- Desktop notifications are best-effort; the board remains authoritative.
- Process roles guide behavior but do not grant filesystem or Git authority.
- Pre-release databases may be explicitly reset. Released-schema migration is
  deferred until retained released state exists.

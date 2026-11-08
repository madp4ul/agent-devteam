# 0039 — Project live workspace preparation progress

Status: Accepted

## Context

A durable dispatch claim precedes Git preparation and runtime startup. Treating
that claim as an executing agent misreports counts, timers and conversations.
Ticket 11 established bounded preparation lanes; ticket 12 makes their work
inspectable without retaining subprocess output as durable activity.

## Decision

The automation coordinator owns one latest progress snapshot per preparation.
Its creating/verifying lane remains stable while the separate Git progress stage
changes. Workspace callbacks replace that bounded snapshot; browser polling
coalesces all intervening updates into the latest observation. No per-fragment
database writes, history hydration or workspace scans are required.

The workspace boundary registers a new detached worktree with `--no-checkout`,
then populates that exact newly registered path using `checkout --force
--progress --detach <resolved commit>`. Installed Git 2.40 does not support
`worktree add --progress`. The checkout subprocess sets `LC_ALL=C` and
`GIT_PROGRESS_DELAY=0`, streams stderr, retains only bounded diagnostic/output
tails, and parses split CR/newline progress records. Existing workspaces take
the verification branch and are never force-checked-out. Failure between
registration and population preserves the unrecorded checkout for the existing
explicit recovery/refusal path, rather than deleting or adopting it.

Application board, task and conversation projections overlay this live lifecycle
on durable activation claims. Preparation is queued work with its own stage,
elapsed time and optional stage counters. Runtime dispatch reports `starting`
until the runtime's started callback; execution timers begin at that callback.
Startup entries are inspectable but excluded from the running-agent count.
Execution confirmation remains separate from interruption intent, so stopping an
unstarted runtime does not invent execution. Current timeline records, including
paged records, share that live execution fact.
Successful preparation while paused retains the workspace and queued activation;
progress disappears because no preparation remains active.

## Consequences

The UI shows a quiet shared status/progress presentation. Missing totals remain
indeterminate; only actual Git counters yield a fraction or percentage. No total
completion estimate or ETA is inferred. Live announcements cover lifecycle
labels, not every timer tick or progress fragment. Polling bounds delivery rate.
Progress is ephemeral: after restart, authoritative ownership/recovery state is
reconciled using existing startup invariants, not a retained percentage.

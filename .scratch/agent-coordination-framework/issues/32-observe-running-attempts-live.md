# 32 — Observe Running Attempts Live

**What to build:** A user can open a running attempt and see meaningful agent
messages and tool progression update automatically, while finished attempt
transcripts remain available across host restarts until explicit task archival.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart

**Status:** ready-for-agent

- [ ] A running attempt's existing read-only transcript overlay is available
  before the attempt finishes and updates without a manual page refresh.
- [ ] A newly started tool activity appears promptly with a running state. The
  same logical entry changes to completed or failed when the runtime reports its
  terminal item, without duplicates or reordered history.
- [ ] Completed or failed tool entries retain the useful final summary,
  diagnostic, and bounded/truncated output already expected of historical
  transcripts.
- [ ] Completed agent messages appear promptly. While the agent is composing,
  the interface may say that the agent is working, but token-by-token text and
  partially generated message content are not required.
- [ ] Partial command-output streaming is not required. A long-running command
  remains visibly running with elapsed progress rather than appearing idle, and
  receives its captured output when it ends.
- [ ] Navigation away from and back to the task, reopening the overlay, and
  ordinary task-detail refresh preserve the current live view while the same
  host and runtime remain active.
- [ ] While an attempt is running, its unfinished transcript may remain
  runtime-owned. A host crash may lose that partial transcript; crash recovery
  must still record the interrupted attempt honestly but need not reconstruct
  unseen runtime events.
- [ ] Whenever an attempt ends without a host crash, the framework persists its
  complete captured transcript regardless of whether the outcome is completed,
  technically failed, permission-blocked, or user-interrupted.
- [ ] Persisted transcripts survive application restart and remain available
  for completed and non-completed workflow tasks. Entering Completion does not
  delete them; explicit archival deletes every transcript for the task as owned
  by issue 27.
- [ ] Transcript persistence is bounded to inspectable messages, tool activity,
  diagnostics, and already-truncated output rather than a private runtime dump.
- [ ] Controlled streamed-runtime, application-restart, and browser tests prove
  running-to-terminal updates, stable item identity, all attempt outcomes,
  navigation/reopening, post-attempt durability, and honest partial loss after
  a simulated host crash.

## Comments

- Current code consumes the Codex streamed event API but publishes transcript
  items only after the run ends. The requirement is live operational
  observability, not a replica of the Codex client.
- Current-attempt elapsed time and actual-agent labels across the board, task,
  and overlay are owned by issue 25 so the timer has one consistent definition.


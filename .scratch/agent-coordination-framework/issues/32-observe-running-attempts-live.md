# 32 — Observe Task Activity and Running Attempts Live

**What to build:** An open task page stays current as comments, activity,
activations, attempts, and attention change, and a user can inspect a running
attempt's meaningful agent messages and tool progression automatically. Finished
attempt transcripts remain available across host restarts until explicit task
archival.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart

**Status:** ready-for-agent

- [ ] An open task timeline updates without a manual page refresh whenever its
  authoritative projection changes, including user- or agent-authored comments,
  framework activity, activation creation and status changes, attempt lifecycle
  changes, startup failures, and attention creation or resolution.
- [ ] A successfully submitted comment appears promptly in the timeline, and
  any activation created by its mention appears as part of the same refreshed
  task state without duplicates, missing intermediate state, or a second user
  action.
- [ ] Updates originating outside the current browser action, including agent
  comments, moves, attempt outcomes, and another browser command, become visible
  within a defined short freshness bound. Choose polling, server push, or a
  hybrid based on the smallest reliable implementation rather than requiring a
  particular transport in advance.
- [ ] Reconciliation preserves an in-progress comment draft, focused control,
  timeline or transcript reading position, and open overlay state. It does not
  replace the entire task page or repeatedly announce unchanged content to
  assistive technology.
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
  comment-to-activation timeline refresh, agent-originated task updates,
  running-to-terminal transcript updates, stable item identity, preserved draft
  and reading state, all attempt outcomes, navigation/reopening, post-attempt
  durability, and honest partial loss after a simulated host crash.

## Comments

- Current code consumes the Codex streamed event API but publishes transcript
  items only after the run ends. The requirement is live operational
  observability, not a replica of the Codex client.
- Live review after issue 20 found that a newly submitted mention comment and
  its resulting activation could remain absent from an already-open task
  timeline. This issue owns freshness for the complete authoritative task
  projection, not only transcript streaming.
- Current-attempt elapsed time and actual-agent labels across the board, task,
  and overlay are owned by issue 25 so the timer has one consistent definition.

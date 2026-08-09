# 32 — Observe Task Activity and Running Attempts Live

**What to build:** An open task page stays current as comments, activity,
activations, attempts, and attention change, and a user can inspect a running
attempt's meaningful agent messages and tool progression automatically. Tool
entries expose concise domain context when the runtime provides it. Finished
attempt transcripts remain available across host restarts until explicit task
archival.

**Blocked by:** 19 — Inspect and Control a Task; 23 — Recover Queued Work After Restart;
44 — Preserve Board Scroll During Automatic Refresh

**Status:** resolved

- [x] An open task timeline updates without a manual page refresh whenever its
  authoritative projection changes, including user- or agent-authored comments,
  framework activity, activation creation and status changes, attempt lifecycle
  changes, startup failures, and attention creation or resolution.
- [x] A successfully submitted comment appears promptly in the timeline, and
  any activation created by its mention appears as part of the same refreshed
  task state without duplicates, missing intermediate state, or a second user
  action.
- [x] Updates originating outside the current browser action, including agent
  comments, moves, attempt outcomes, and another browser command, become visible
  within a defined short freshness bound. Choose polling, server push, or a
  hybrid based on the smallest reliable implementation rather than requiring a
  particular transport in advance.
- [x] Reconciliation preserves an in-progress comment draft, focused control,
  timeline or transcript reading position, and open overlay state. It does not
  replace the entire task page or repeatedly announce unchanged content to
  assistive technology.
- [x] A running attempt's existing read-only transcript overlay is available
  before the attempt finishes and updates without a manual page refresh.
- [x] Transcript content is scoped to the selected attempt, not merely its Codex
  thread ID. When Continue resumes a previous thread, the new running attempt
  never displays the preceding attempt's transcript while waiting for its own
  items, and the preceding attempt's retained transcript remains unchanged.
- [x] A newly started tool activity appears promptly with a running state. The
  same logical entry changes to completed or failed when the runtime reports its
  terminal item, without duplicates or reordered history.
- [x] Known coordination MCP calls show concise, bounded domain context when the
  SDK event exposes the required arguments or result. For example, Move Current
  Task identifies the task's authoritative prior and resulting columns rather
  than showing only the tool name. Other known calls expose similarly useful
  facts such as affected task, participant, relationship, attention action, or
  command outcome without dumping private runtime payloads.
- [x] Domain-aware tool summaries use authoritative command results when
  available, clearly distinguish requested input from confirmed outcome, and
  fall back to the generic tool name/status/output presentation for unknown
  tools or unavailable fields.
- [x] Completed or failed tool entries retain the useful final summary,
  diagnostic, and bounded/truncated output already expected of historical
  transcripts.
- [x] Completed agent messages appear promptly. While the agent is composing,
  the interface may say that the agent is working, but token-by-token text and
  partially generated message content are not required.
- [x] Partial command-output streaming is not required. A long-running command
  remains visibly running with elapsed progress rather than appearing idle, and
  receives its captured output when it ends.
- [x] Navigation away from and back to the task, reopening the overlay, and
  ordinary task-detail refresh preserve the current live view while the same
  host and runtime remain active.
- [x] While an attempt is running, its unfinished transcript may remain
  runtime-owned. A host crash may lose that partial transcript; crash recovery
  must still record the interrupted attempt honestly but need not reconstruct
  unseen runtime events.
- [x] Whenever an attempt ends without a host crash, the framework persists its
  complete captured transcript regardless of whether the outcome is completed,
  technically failed, permission-blocked, or user-interrupted.
- [x] Persisted transcripts survive application restart and remain available
  for completed and non-completed workflow tasks. Entering Completion does not
  delete them; explicit archival deletes every transcript for the task as owned
  by issue 27.
- [x] Transcript persistence is bounded to inspectable messages, tool activity,
  diagnostics, and already-truncated output rather than a private runtime dump.
- [x] Controlled streamed-runtime, application-restart, and browser tests prove
  comment-to-activation timeline refresh, agent-originated task updates,
  running-to-terminal transcript updates, stable item identity, preserved draft
  and reading state, resumed-thread attempt isolation, representative
  domain-aware coordination tool summaries, all attempt outcomes,
  navigation/reopening, post-attempt durability, and honest partial loss after
  a simulated host crash.

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
- Live testing after issue 25 found that Continue reuses the Codex thread ID and
  the runtime currently keys transcripts only by that ID. Until the continued
  attempt finishes and overwrites the entry, its overlay therefore shows the
  preceding attempt's transcript. This issue owns attempt-scoped capture and
  stable per-item identity while retaining thread reuse as metadata.
- The same live test showed that coordination MCP entries such as Move Current
  Task expose too little context when reduced to a generic tool name. Enrichment
  is deliberately bounded to fields available from SDK events and authoritative
  coordination results; it does not require storing a private raw runtime dump.
- Issue 44 must establish one-shot board-context restoration before this issue
  expands automatic refresh behavior; live updates must preserve user-controlled
  reading and scroll positions rather than repeatedly applying stale snapshots.

## Answer

Task details now reconcile the complete authoritative projection once per
second with latest-request-wins sequencing, preserving drafts, focus, overlays,
and reading positions while comments, activity, activations, attempts, and
attention change.

Codex transcript capture is scoped by attempt identity. Streamed tool items
retain stable identities from running through terminal state, completed agent
messages publish immediately, and known coordination tools expose bounded
requested, confirmed, succeeded, rejected, or failed domain summaries. Move
summaries use the authoritative transition returned by the application command.

Finished transcripts are persisted atomically with completed, failed,
permission-blocked, and user-interrupted attempts. They remain inspectable
across restart for non-completed and completed workflow tasks; a host crash
honestly retains the interrupted attempt without inventing unavailable partial
runtime evidence.

Typechecking, the production build, 110 local tests with one intentional
credentialed integration skip, and all 22 browser scenarios pass. Independent
Standards and Spec reviews report no remaining actionable findings.

# Heavy task history and unattended runtime recovery

**Status:** ready-for-agent
**Created:** 2026-10-13

## Problem statement

Long-running tasks accumulate timeline records and agent conversation text. The
browser currently receives complete task history, and opening a conversation
assembles its complete history, including reading every attempt transcript.
Initial loading, polling, and rendering therefore grow with retained history.

The task position movement map must remain a view of the complete task journey,
including movements outside the loaded timeline. Its navigation currently relies
on rendered timeline positions, which pagination will make incomplete.

Technical runtime failures currently exhaust three automatic attempts with short
backoff and then require user recovery. Temporary connection/service failures or
exhausted Codex message budgets can outlast this cycle and leave overnight work
waiting unnecessarily. Retrying these indefinitely must not generate an
unbounded stream of duplicate timeline entries, transcripts, or attempt records.

## Intended behavior

1. Conversations open at their newest content. Scrolling upward loads earlier
   content while keeping the user's reading position stable.
2. Task timelines initially load their newest page in the existing newest-first
   presentation. Scrolling toward older history loads subsequent pages.
3. A separate compact map query starts when the map is about to become visible,
   after the task can already be used. The complete movement map remains
   navigable, even when the target timeline content has never been loaded.
4. Recognized transient runtime failures wait and retry the same activation
   without an automatic attempt ceiling. Known budget-reset deadlines determine
   when retry becomes eligible; otherwise retries wait at least one minute.
5. Unknown failures keep the existing bounded technical-failure policy.
   Permission blocks, user interruption, and stall-recovery exhaustion keep
   their existing behavior.
6. Repeated equivalent no-progress transient failures update a compact durable
   recovery summary rather than accumulating duplicate history indefinitely.
   Waiting, recovery, and actionable failure remain distinguishable to the user.

## Implementation decisions

These are engineering defaults synthesized from the request, not existing
implemented contracts. Page sizes and cache limits may be tuned with evidence
without changing the behavior described here.

### Paged reads and browser windows

- Default page size: 50 conversation history elements or top-level timeline
  records. Count conversation elements, not whole activations or attempts: a
  single transcript can exceed a page. The server enforces a finite maximum.
- Bound rendered history and retained client page data, initially targeting three
  pages around the visible position. Evicted content remains reloadable; spacers
  or equivalent windowing preserve navigation and reading position.
- Preserve whole authored messages. A single large message may exceed the normal
  byte target; do not silently truncate evidence. Nested attempt content must
  have bounded disclosure rather than bypass pagination through one huge group.
- Page in the authoritative application/persistence boundary before hydrating
  content. Loading everything and slicing in React, the HTTP adapter, or after
  parsing every retained transcript is insufficient. Add indexed/normalized
  transcript storage if needed, using the released migration registry.
- Use stable identities and deterministic order with a tie-breaker for equal
  timestamps. Backward cursors retain a coherent history watermark; a separate
  latest-content refresh path handles newly arriving records and updates to
  already loaded running attempts without duplicates or unread gaps.
- Polling, costs, conversation metadata, disclosure metadata, historical labels,
  and task controls must not secretly hydrate the full history. Cost and status
  remain authoritative totals, not totals over the visible page. Diagnose any
  remaining aggregate-query cost in the large-history verification.
- Source navigation can query a bounded window around a durable record identity.
  Opening an old attempt/message, an attention link, or a pinned comment must
  not sequentially fetch all intervening pages.
- Keep agent history/context-delivery contracts separate. Existing agent history
  pagination and composition checkpoints are not browser paging receipts.

### Timeline and full movement map

- Initial task detail contains current task/control state, all current pins,
  and a bounded newest timeline page; it contains neither complete history nor
  the complete movement-map dataset. Current pins remain separately available
  even when their original timeline records are not loaded.
- The map query returns only movement/navigation metadata: stable source and
  containing-record identity, order/time, historical column/actor information,
  and the information needed to locate a timeline window. It must not load
  comment bodies, transcripts, or unrelated activity to derive that metadata.
- Load the map independently and only when it is about to be shown. Map failure
  is retryable locally and does not prevent task use. Map polling uses a compact
  refresh/delta strategy and never reintroduces full task-history loading.
- Preserve click, keyboard navigation, and drag/scrub through the complete map.
  An unloaded destination triggers a direct window read before focus/scroll.
  Scrubbing coalesces requests; stale responses cannot override the newest target.
- Derive map position from logical history position plus loaded anchors, rather
  than treating missing DOM records as missing movements. Do not fabricate pixel
  accuracy for unloaded variable-height content. After hydration, align to the
  actual target while keeping the viewport indicator meaningful.
- Maintain existing grouping, provenance, chronological placement of resumes,
  relationship labels, agent-inspectable disclosure, and archived-task behavior.

### Classified transient-failure recovery

- Prefer structured runtime failure codes and retry/reset metadata. Where only
  error text is available, use explicit tested recognition of connection loss,
  exhausted reconnect attempts, temporary service unavailability, and Codex
  message-budget exhaustion. Do not launch a model to classify a failure when
  the runtime itself is unavailable. Unrecognized or ambiguous errors use the
  ordinary bounded policy; authorization/billing/permission problems are not
  presumed to be budget waits.
- Classify each failure before retry-budget exhaustion. Recognized transient
  failures do not consume the ordinary three-attempt budget, and do not create
  failure attention merely because they recur. A later ordinary failure still
  has a finite budget and creates attention when that budget is exhausted.
- Persist the waiting episode, classification, retry eligibility, retry count,
  and compact diagnostic evidence. Use an explicit future reset/retry deadline
  when trustworthy; otherwise wait at least 60 seconds between failed retries.
  If the service still rejects a retry, retain the wait and reschedule.
- Keep the same activation, original reason, conversation lineage, ordering,
  and normal thread resume/replacement semantics. Waiting frees execution
  capacity for other tasks. Retry dispatch rechecks pause, suspension, process
  compatibility, mapping, dismissal, and task lifecycle eligibility.
- Pause suppresses dispatch, and restart still starts paused. Resume respects
  retained deadlines and does not duplicate probes. Expose waiting reason, last
  failure, retry count, and next eligible time, with an explicit user action to
  stop/dismiss waiting through the existing recovery control model.
- For a continuous no-progress transient outage, retain a fixed-size set of
  diagnostic samples plus mutable summary counters/timestamps. Do not create
  an ordinary durable attempt, start/completion activity pair, or empty transcript
  for every repeated reconnect/budget probe. A UI-only collapse is insufficient.
  Design the episode/probe seam before dispatch so compaction does not require
  rewriting or deleting existing immutable attempt history afterward.
- Meaningful agent execution, coordination writes, partial output, tool effects,
  thread changes, and usage/cost evidence remain attributable. A failure after
  meaningful work is not an empty probe and must preserve that run's evidence.
  Bound redundant retry noise; do not promise constant storage for actual new
  work. Preserve existing retained history when adding this policy.
- Only episode transitions produce history/notifications; repeated equivalent
  waiting probes produce neither repeated timeline/conversation entries nor
  actionable-failure notifications. If classification changes to an ordinary
  failure, follow the existing attention/notification policy.
- Technical retries remain within one activation and do not consume additional
  stall-recovery slots. The separate three-recovery stall policy is unchanged.

## Verification

Use public application queries/commands, local HTTP contracts, and existing
browser fixtures as the main seams. Runtime adapter tests cover representative
failure envelopes/text; controllable-clock scheduler tests cover waiting and
resume without wall-clock sleeps.

Seed at least 10,000 history elements, including one conversation attempt with
more than a page of transcript items. Demonstrate bounded response counts,
bounded hydration/transcript reads, bounded rendered windows, stable paging,
and direct navigation across unloaded content. Capture query plans/read counts
and comparative timings; avoid machine-specific latency assertions alone.

Simulate at least 1,000 identical transient failures: assert bounded durable
retry-noise rows and bounded projection output, an accurate retry count, no
premature attention, and eventual successful continuation. Also verify a
budget-reset deadline, unknown errors, permission denial, partial-work failures,
pause/resume, restart, dismissal, other-task progress, and unchanged stall policy.

Cover empty/single-page/end-of-history, equal timestamps, live content arriving
between pages, request races, task switching, failures/retry, archived history,
pins and attention/source links. Browser checks preserve selection/reading
anchors and live following. New visual states must work in dark and light mode;
new icon-only patterns use shared decorative SVGs with center-alignment coverage.

Update architecture and domain documentation with implemented contracts, and
record durable cursor/storage/recovery-policy decisions in ADRs during delivery.

## Out of scope

Deleting old authored history, changing agent prompt/history budgets, changing
stall eligibility or its three-recovery budget, changing Codex quotas, automatic
purchase/model switching, and a general retry-policy configuration language.

## Delivery tickets

- [01 — Page conversations](issues/01-page-agent-conversations.md)
- [02 — Page timelines and preserve the full map](issues/02-page-task-timelines-and-lazy-map.md)
- [03 — Recover transient runtime failures with bounded retry evidence](issues/03-recover-transient-runtime-failures.md)

All three can start independently. Shared cursor/query mechanics may be reused
where useful, but reuse is not a prerequisite. Each ticket owns its complete
application, transport, browser, persistence, verification, and documentation
slice; no implementation is part of this planning change.

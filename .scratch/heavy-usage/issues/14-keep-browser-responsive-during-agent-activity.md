# 14 — Keep browser reload and comment posting responsive during agent activity

**Type:** task
**Status:** open
**Created:** 2026-11-12
**Blocked by:** None

## Problem

While many agents were running, the user reported that reloading the UI stopped
responding and a submitted task comment had no visible confirmation for about
two minutes. The comment was ultimately present. The user expects the board and
task pages to remain usable during busy periods, even when agent processing has
to slow down.

## What to build

Keep board and task reloads responsive during sustained activity across multiple
attempts. A comment should show that submission is pending immediately and show
success as soon as the browser receives durable acceptance. The task timeline
should catch up independently. If acceptance is uncertain after a disconnect,
reconcile or retry with the same command identity so that the comment and any
mention-triggered activations are recorded once.

## Preliminary investigation

A disposable Windows HTTP probe ran the real web server and SQLite-backed
application with six concurrent controlled attempts on six separate tasks.
It sent the app shell request, board GET, task GET and comment POST together.
The comment used a fresh idempotency key on each sample and returned HTTP 201.

| Controlled workload | Shell, board, task and comment HTTP elapsed time | Maximum host event-loop delay |
| --- | --- | --- |
| Six active attempts with no transcript updates | 21–29 ms | Baseline not captured |
| 30 transcript items per attempt, 2 KiB of text each, all 180 callbacks in one event-loop turn | 1,010–1,079 ms across three repetitions | 1,003–1,052 ms |
| Same item count and payload, yielding after each round of six callbacks | 127–357 ms across two repetitions | 79–176 ms |

The forced burst failed a provisional 500 ms HTTP check on every repetition.
Each transcript update went through the real active-attempt callback, which
opens a synchronous SQLite transaction and upserts the item into conversation
history. The forced batch held the host event loop long enough to delay even
the app shell request. The real Codex worker waits for an acknowledgement
before sending its next event, so the forced burst exaggerates the delivery
pattern. The probe establishes that transcript persistence can delay unrelated
HTTP work under a burst. The reported two-minute incident remains undiagnosed.

The browser also used to await the task refresh after HTTP acceptance before
displaying “Commented on …”. A Playwright regression reproduced the missing
confirmation by holding the refresh open after HTTP 201.

## Investigation and implemented changes — 2026-11-13

- The Codex projector cloned the complete transcript on every item event, and
  the runtime cloned it again for the live cache. With one paced synthetic stream
  of 32 KiB message items, processing 200 and 800 items took 614 ms and 13,228 ms
  before the change, and 19 ms and 71 ms after it. The runtime now updates only
  the changed item. A live-read regression verifies in-place ordinal updates
  and detached snapshots. Durable item writes still run before the worker can
  advance, and settlement retains the final transcript.
- The composer now shows confirmation on HTTP acceptance. Task refresh runs
  independently and polling can reconcile a failed refresh. Browser coverage
  holds the refresh after HTTP 201 and then fails it in both themes. A second
  browser test commits a comment, drops the response, and verifies that retry
  uses the same key and creates one comment and one mention activation.
- A paced HTTP probe used six tasks and six streams through the real Codex
  adapter, host and file-backed SQLite. Each stream delivered 160 messages of
  16 KiB, with an event-loop yield before each message and no new dispatch after
  the six had started. Each sample concurrently fetched the shell, board and task
  and posted one plain comment. The quiet requests took 21–31 ms. For the 960
  events, elapsed time through settlement fell from 12.7 s to about 8 s. Worst
  HTTP latency varied across runs, including post-change responses over 1 s.
  The probe verified a complete, ordered transcript through HTTP after settlement.
- One instrumented post-change run spent 6.2 s of 7.7 s in 989 synchronous
  SQLite commits. The longest commit took 553 ms, and the shell request peaked
  at 770 ms. An exploratory WAL run on a disposable database reduced the longest
  commit to 30 ms and the slowest HTTP request to 123 ms in that run. Changing the
  live journal mode would also affect the clean-startup fast path and sidecar
  handling. The experiment leaves the storage policy decision open pending
  recovery and startup verification.

The host now batches up to eight concurrent transcript updates in one durable
transaction. The Codex worker still waits for commit before advancing. With the
same 960-item probe, two runs finished in 4.20–4.28 s, with 223–225 commits and
worst HTTP responses of 202–229 ms. The longest measured commit was 14–15 ms.
A further run during other verification work finished in 6.30 s with 228
commits and a worst sampled HTTP response of 239 ms. A single synchronous
commit in that run still took 795 ms. Batching reduces the frequency of
synchronous commits and meets the provisional HTTP budget in these samples.
It does not bound the latency of an individual SQLite commit. The two-minute
incident has no captured request timing or host trace, so its precise cause
remains open.

Verification passed for the build, typecheck, 30 browser tests and 47 focused
runtime tests. The full Node run recorded 518 passes and six skips. Its one
failure, the self-authored activation source test, also failed with the original
runtime loaded from HEAD.

## Acceptance criteria

- [ ] Build a repeatable load case with simultaneous active attempts and paced
      event delivery that reflects the worker acknowledgement flow. Record
      attempt count, event rate and payload sizes, task/history size, and an idle
      baseline. Measure browser navigation and feedback, HTTP request and
      response timing, host event-loop delay, and time spent in background work.
      If that workload cannot reproduce the reported severity, record which
      bottlenecks it reproduces and what evidence is still missing.
- [ ] Identify where requests wait before changing scheduling or persistence.
      Compare transcript projection and writes, dispatch and settlement,
      browser polling and projections, and the comment's own transaction.
      Measure the time from the comment commit through HTTP 201 and visible
      confirmation so a slow refresh is distinguishable from delayed acceptance.
- [ ] Set and verify a documented responsiveness budget for board/task reload,
      durable comment acknowledgement and visible feedback under the repeatable
      load. The measurements above use 500 ms as a diagnostic threshold, with
      the final test budget to be based on the representative fixture.
- [x] Keep the browser usable while a comment is pending. Once HTTP acceptance
      arrives, show confirmation even when the task or timeline refresh is slow
      or fails. Verify that a lost response and retry preserve exactly one
      comment and one activation per executable mention.
- [ ] If background work needs backpressure, show that it continues to make
      progress under user traffic and retains transcript durability, ordering,
      and attempt ownership. Add regression coverage for the measured HTTP
      contention and the browser's acknowledgement with a delayed refresh.

## Related work

- [Heavy usage 11](11-dispatch-independently-of-workspace-preparation.md) bounded
  workspace preparation so unrelated tasks can dispatch.
- [Framework 113](../../agent-coordination-framework/issues/113-provide-viewport-fixed-interactive-operation-feedback.md)
  tracks where operation feedback appears.
  [Framework 114](../../agent-coordination-framework/issues/114-make-archival-progress-visible-and-multi-column-requests-responsive.md)
  tracks similar symptoms during bulk archival. A shared cause remains open.

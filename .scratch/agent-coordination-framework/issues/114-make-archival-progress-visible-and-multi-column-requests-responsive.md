# 114 — Make archival progress visible and multi-column requests responsive

**Type:** task

**Status:** resolved

**Blocked by:** 113 — viewport-fixed interactive operation feedback.

## What to build

Make individual and Completion-column archival acknowledge the click immediately,
show honest progress until completion, and remain responsive when the user starts
archival from several boards' Completion columns. Users can tell which requests
were accepted, which are queued/running, which tasks were archived, and what needs
their attention without refreshing or returning to the top of the page.

## Reported problem

After clicking a column's archive control, nothing visibly happens for a long
time. The task count may eventually decrease one at a time, or appear correct
only after manual refresh. While one batch is running, another column's archive
click can seem ignored or eventually produce an unattributed network error in
the offscreen feedback box. Users commonly want to archive accumulated completed
tasks across multiple boards, rather than wait for each column individually.

Host overload, UI blocking, delayed polling, request timeouts and stale refreshes
are possible explanations, not established diagnoses.

## Acceptance criteria

- Reproduce and measure latency/responsiveness at the browser, HTTP and actual
  archival/Git boundary with multiple populated Completion columns. Identify
  where work waits or blocks before selecting a scheduling/transport solution.
- Give immediate local feedback on the clicked control for column archival and
  task-detail archival, including while inspection is pending. Show an inline
  pending indicator beside the column action; make task-detail pending state
  equally discoverable. Prevent duplicate submission of the same pending action
  without globally disabling unrelated archive controls.
- Acknowledge each distinct request promptly and correlate it with its board,
  column or task. Show queued, running and terminal outcomes through 113's floating
  feedback surface, with per-task status, completed/total counts and actionable
  failures. Report actual stages when totals/progress are unknown; do not invent
  percentages or imply a long operation finished at request acknowledgement.
- Accept archival requests from other columns/boards while one is active. Use
  bounded concurrency or an explicit queue as appropriate; unrestricted parallel
  Git deletion is not required. Keep navigation, reads, progress updates and
  further request acknowledgement responsive under that load.
- Preserve authoritative operation state beyond the initiating HTTP request and
  page navigation/reload. After a network error, distinguish rejected/not-started
  work from an unknown or still-running outcome, reconcile before retry, and avoid
  duplicating destructive work. Define interrupted-operation behavior on host
  restart explicitly; never silently replay unconfirmed deletion authorization.
- Refresh task membership and column counts as archival completes, without manual
  reload or late responses restoring stale cards/counts. Finishing one operation
  must not overwrite another operation's pending state or result.
- A blocked or failed task must not prevent other eligible tasks in its batch
  from making progress. Present partial success and the remaining failures together
  with links/actions inside the corresponding operation feedback. Preserve the
  individual inspection/confirmation dialog and its explicit deletion scope.
- Add browser and application/HTTP regressions for delayed work, multi-board
  requests, duplicate clicks, a blocked task among successes, partial cleanup,
  disconnect/reload, truthful counts, and errors attributed to the correct request.
  Cover immediate button feedback and progress in both themes, using disposable
  workspaces and no live task deletion.

## Scope and related work

Ticket 112 independently resolves stdout buffer overflow and discard prerequisites.
This ticket must remain useful with those failures still present and cannot hide
them by counting failed tasks as archived. It delivers archival operations only;
any broader job framework needs a demonstrated requirement, not speculation.

## Comments

2026-11-12: User described repeatedly clicking archive on several boards' Completion
columns as the normal workflow, and requested visible reaction beside the clicked
button plus ongoing progress. No implementation or deletion was requested in this
feedback turn; this ticket captures future work.

## Implementation evidence — 2026-11-13

- The old browser waited for the batch and Git checks before receiving a
  response. A disposable large preview took about 4.7 s while a competing board
  read completed in 19 ms. The queued HTTP regression accepted the second board
  in 7–12 ms while the first was held at the Git boundary.
- Each browser request shows immediate pending feedback and receives an HTTP
  202 operation identity. The host serializes cleanup, records per-task progress,
  and continues after a blocked task. Reload and lost-response retries reconcile
  with persisted operations. Dismissal affects presentation only.
- Startup reconciles interrupted claims and retained task receipts without
  replaying deletion consent. Browser and HTTP coverage exercise multiple
  columns, reload, duplicate submissions, partial results and both themes.
  See [ADR 0045](../../../docs/adr/0045-queue-browser-archival-with-durable-results.md).

The controlled multi-column test holds the first task at the Git cleanup entry
point. The real large-output test separately measures a competing HTTP read while
the preview runs. These fixtures do not measure end-to-end archival latency on
the live project.

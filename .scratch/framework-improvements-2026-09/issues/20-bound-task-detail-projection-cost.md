# 20 — Bound task-detail projection cost to the inspected task

**Type:** task
**Status:** resolved
**Blocked by:** None.
**Next step:** User review.

## Problem

Opening task details becomes materially slower as unrelated tasks accumulate
long histories. In reported use, a previously immediate navigation took roughly
two seconds after many conversation-heavy tasks had accumulated, including when
the selected task itself was unrelated and small.

A read-only investigation confirmed cross-task coupling in the server-side
projection. Loading one task can hydrate every nonarchived task on its board,
including comments, activity, activations, and attempt histories. Inspecting an
archived task can build all archived task overviews from full histories. Related
task and timeline helpers can repeat the same broad work during one request.
The task page polls this full detail endpoint once per second, so synchronous
projection work may also delay otherwise unrelated requests.

The primary evidence points to repeated comment, activity, activation, and
attempt-history loading rather than persisted transcript-body parsing or the
conversation cost/index projection. Missing supporting indexes amplify the
work, but experimental indexes alone did not remove most of the cost.

## Investigation evidence

The investigation used sequential read-only localhost requests and an online
backup opened read-only for profiling. Experimental indexes existed only on the
disposable snapshot. No application source, live database, runtime
configuration, automation state, or Git staging was changed.

Snapshot size: 22 tasks, 332 comments, 1,900 activity events, 451 activations,
472 attempts, and 305 persisted transcripts.

- Live detail reads ranged from about 92–111 ms for a small active task to
  697–737 ms for an archived task; another archived detail response was about
  923 KB. The board endpoint took about 111 ms.
- An isolated `queryUserTaskDetail` harness observed 737 attempt-history queries
  for one task and 418 for another. Query plans showed full scans by `task_id`
  or `activation_id` in comments, activity, activations, and attempts.
- Precomputing archived overviews reduced representative isolated calls to
  roughly 29–36 ms. Omitting hydration of all board tasks reduced them to about
  12–13 ms, and request-local task reuse reduced representative calls further
  to about 4–15 ms.
- Four experimental indexes alone left representative calls around 81–86 ms
  and 151–195 ms in a separate comparison run.
- Omitting the conversation index alone made little difference.

These timings are observations, not portable regression thresholds. The exact
two-second browser experience was not reproduced or profiled end to end.
Automation and active-run state plus workspace metadata were stubbed in the
isolated harness, and queueing under concurrent browser use was not measured.
Precomputed archive overviews demonstrate repeated reconstruction cost; they do
not establish indefinite caching as the production design. Omitting board task
hydration changes the response contract and requires explicit review.

## Completion criteria

- [x] Give task details the board and column metadata they need without loading
  or returning every other board task's histories.
- [x] Read one task overview by ID, including an archived task, without
  assembling all archived overviews or all tasks in a column.
- [x] Resolve related-task labels and status through compact reads, deduplicate
  current and timeline references, and cover archived related tasks.
- [x] Reuse task data within one request rather than repeating equivalent task
  and history reads.
- [x] Measure and add supporting indexes through a new released migration where
  they materially improve the narrowed query path; do not treat indexes as the
  sole fix.
- [x] Add an application-seam regression that grows unrelated task history and
  proves inspecting an active or archived task neither loads nor returns that
  unrelated history.
- [x] Cover active tasks, archived tasks, active relationships, archived
  relationships, and timeline relationship labels in the contract tests.
- [x] Measure the resulting detail endpoint and response size with a realistic
  data set, recording repeatable relative or query-count bounds rather than
  relying on the investigation's machine-specific milliseconds.
- [x] Reassess the one-second polling interval only after projection cost is
  bounded; slowing polling alone is not acceptance of the root-cause fix.
- [x] Preserve the released migration and snapshot workflow, and verify any
  production rollout separately when the running instance can be restarted.

## Likely implementation seams

- `CoordinationApplication.queryTask` and `queryUserTaskDetail` currently expose
  the broad active-board hydration path.
- `TaskDiscovery.queryTaskInspectionView` and
  `TaskProjectionStore.readTaskOverviewRecordsIncludingArchived` expose the
  broad archived-task path.
- Related-task and timeline-related-task helpers should share compact lookups
  and request-local results instead of recursively invoking broad inspection.
- Database reads for comments, activity, activations, and attempts need measured
  query plans after the projection shape is narrowed.

## Answer

Implemented a bounded task-detail projection. The detail contract now returns
only board and column metadata alongside the inspected task, reads that task's
history once, reads active or archived overviews directly by task ID, and
resolves current and historical related-task labels through one deduplicated
batch of compact references.

Released migration `0002_bound_task_detail_lookups` adds task-scoped indexes for
activity, comments, activations, attempts, relationships, attention, and
attachments. Migration coverage proves the representative activity lookup
changes from a full scan on exact 0001 state to an indexed search after upgrade,
while preserving the released backup, fixture, registry, and schema-snapshot
workflow.

The application regression covers active and archived inspected tasks plus
active, archived, and timeline-only relationships. The HTTP regression uses
the investigation scale—22 tasks, 332 comments, 1,900 activity records, 451
activations, 472 attempts, and 305 transcripts—and requires the detail response
to remain byte-identical after unrelated history is added. An invalid unrelated
activity payload makes any accidental unrelated-history hydration fail rather
than merely slowing the test.

The one-second polling interval remains unchanged. After bounding the root
projection cost, there is no evidence that a slower cadence is needed, and
changing it would trade away live updates without addressing another measured
bottleneck. Production rollout still requires restarting the running instance
so the released migration can apply through the normal verified startup path.

## Comments

- 2026-09-26: Added from user-reported degradation and a separate agent's
  noninterfering investigation. Diagnostic scripts were retained under
  `.scratch/task-detail-performance/`; they require a disposable
  `snapshot.sqlite3`. `compare.mjs` creates and drops experimental indexes and
  must never be pointed at the live database.

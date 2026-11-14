# 01 — Implement agreed feedback placement and durable lifecycle menus

**Type:** task

**Status:** resolved

**Blocked by:** None

Implement [the agreed specification](../spec.md), including an isolated example
review environment, application/browser regressions and architectural records.
Leave changes unstaged for user review.

## Answer

Implemented independent X-dismissable operation feedback, removed the redundant
comment success banner, and moved archival into the shared lifecycle toolbar.
Preparing and Current runs retain durable results alongside archival history;
active work precedes history and is protected from history dismissal. The latest
thirty run summaries commit with settlement and survive task archival. Closed
menus read compact counts; bounded history pages preserve already requested
results while new work finishes. Controls remain available during slow or failed
task navigation.

The isolated [software-delivery review host](../../../examples/software-delivery/UI-REVIEW.md)
is available on http://127.0.0.1:3010 with scripted execution and real Git/SQLite.
A real mixed archival archived two clean workspaces and retained the dirty one.
Four preparation results, four run results and the archival operation identity
survived a clean host restart. The actual running project and shared dist build
were untouched.

Validation: typechecking and isolated Vite build passed; 59 focused browser
regressions passed in dark/light themes, including narrow viewport, concurrent
errors, missing task detail, retained-page boundaries and dismissal polling.
The full Node suite reports 534 passed, seven skipped, and the previously known
`agent-conversation.test.ts:121` self-authored activation-source failure. Its
migration/API inventory failures from introducing migration 0019 were corrected;
all migration compatibility and compaction checks now pass. Standards and spec
reviews report no remaining material blockers. Changes remain unstaged.

## Visual review follow-up

Successful preparation history now shows only task identity/title and date.
Agent labels and redundant success status/summary are omitted there; actual
failures retain diagnostic content inside the same hovered task link. Active
preparation content also forms one task link. Task creation no longer publishes
a redundant floating success message.

The example now offers prepare/release controls for a stable live preparation
and keeps manually created tasks in their selected column, with an inspectable
scripted run until interrupted. Only the deliberately seeded archival cases
automatically move to Completion. A held T-0006 preparation is available for
review. Focused preparation/board checks and typechecking cover the adjustments.
The broader board regression also exposed a duplicate loading-time board read;
the root loading toolbar now uses its parent's request instead of issuing a
second one. Task-detail loading still reads independent project controls.

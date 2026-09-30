# 04 — Unified whole-record history pages and interoperable inspection cursors

**Type:** task
**Status:** open
**Blocked by:** [01](01-cross-task-comments-and-participant-discovery.md), [03](03-curate-pinned-comments-in-tools-and-browser.md).
**Specification:** [spec.md](../spec.md), unified history/JSON and cursor sections.

## Build

One agent-facing history projection merges immutable comments and substantive
events into stable chronology, excludes routine activation.created/attempt.started,
and serves task.history.list and task.inspect. Inspection supplies current state,
all pins, participants, and first recent page. Cursor interchange is mandatory.
Bound archive/attachment metadata listings and complete read-tool naming changes.

## Acceptance

- [ ] targetWords optional positive integer/default 2000. Select newest records until
  words reach/exceed target; render page oldest-first. Whole boundary record included;
  target=1 still returns a complete oversized record. Never split comments.
- [ ] Returned/remaining/total words/records/comments use one count rule. No full
  history array remains in ordinary inspection or mutation/conflict responses.
- [ ] task.inspect history.nextCursor continues in task.history.list directly.
  Fixed upper watermark excludes later arrivals and retains counts. No stale warning.
  Original cursor/arguments retry identically; returned cursor progresses backward.
- [ ] Stable cross-kind tie ordering, restart, invalid/cross-task cursors, empty history,
  and complete exhaustion are tested. Archived task history stays deliberately readable.
- [ ] Build activation-checkpoint stop/continuation support in the history engine for
  05: a call stops once at a supplied checkpoint, reports it, and returns an older-history
  continuation under the same upper watermark. No scope argument or mutable receipt.
- [ ] Preserve UUIDs, multiline JSON body boundaries, external author origin, event
  details, and original pinned-comment history positions. Related data remains compact.
- [ ] Use bounded metadata pages (default20/max50) for archive/attachments; no search.
- [ ] Carry review scenarios 1–6 and 8 into meaningful tests at application/MCP seams.
  Record the history ADR's paging/whole-record decisions and update matching architecture.

05 integrates automatic checkpoint capture/delivery. Preserve exact spec behavior;
do not substitute generic limit/offset pagination or a permanent lower interval bound.

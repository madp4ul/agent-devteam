# 06 — Migrate task and resource activity

**What to build:** Apply checked activity payloads to task, comment, relationship,
resource and archival behavior so changes to those facts identify affected
producers and consumers during typechecking.

**Blocked by:** 05 — Expand typed activity contracts.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Migrate task creation/editing/movement, comment pin changes, relationship
  changes/satisfaction, resource claims/grants/releases/cancellation and task
  archival/unarchival to the checked authoring interface.
- [ ] Migrate their typed readers, context/source handling and browser
  presentation in the same green change. Avoid blanket casts that hide errors.
- [ ] Preserve exact source identity, historical labels, cross-task provenance,
  resume ownership, FIFO claim facts and existing serialized representations.
- [ ] Preserve historical missing-field compatibility at the decoding seam.
- [ ] Verify affected application behavior and relevant history, movement,
  browser and scoped-agent scenarios through their supported interfaces.
- [ ] Remaining execution/conversation event families continue to work through
  the expansion's compatibility path; no product semantics change.

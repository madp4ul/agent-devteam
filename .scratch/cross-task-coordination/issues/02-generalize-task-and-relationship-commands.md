# 02 — Generalize task content and relationships across project tasks

**Type:** task
**Status:** resolved
**Blocked by:** [01](01-cross-task-comments-and-participant-discovery.md).
**Specification:** [spec.md](../spec.md), scope/tool/mutation sections.

## Build

Expose task.create, partial task.edit, task.move, task.child.create, task.child.add,
task.dependency.add, task.relationship.resume_agent.update, and
task.relationship.remove. Existing-task subjects require current/concrete taskId.
Apply 01's caller/destination separation and payload-aware idempotency to every
generalized mutation. Use narrow resource-first schemas, not a generic executor.

## Acceptance

- [x] Explicit subject selection permits any mapped mutable task across project
  boards regardless of role, relationships, or another running agent.
- [x] Partial edit preserves omitted title/description; requires at least one field
  and expectedRevision. Move checks revision and remains within the existing board.
  Same-column move is inert; watched moves preserve normal activations/issue 14 behavior.
- [x] Independent creation has explicit board/column and no invented existing subject.
  Invalid creation destinations reject with explanation without extra agent warnings.
- [x] New child creation atomically creates child/relationship. Existing child addition
  creates only the relationship. Dependency/source targeting and explicit resumeAgent
  work across tasks; self means caller stable ID, not destination watcher.
- [x] Preserve ADR 0019's completion/removal/reassignment semantics and ordinary queues.
  Unrelated task revisions do not alone reject valid relationship changes.
- [x] Revision conflicts/rejections return compact current state, not full history.
  Exact retries replay retained results despite later revisions; mismatched keys reject.
- [x] Archived/unmapped targets, foreign project scope, caller provenance, and stable
  relationship/source validation are covered at application and MCP seams.
- [x] No agent execution/archive/global controls or cross-board transfer are introduced.
  Remove replaced current-only aliases and update transcript recognition/reference.

Keep storage/authority in the core. Update architecture when delivered flows change;
preserve staged content and leave changes unstaged.

## Answer

Delivered the eight resource-first mutation tools with explicit task subjects,
partial title/description edits, independent creation, atomic child creation,
existing-child attachment, and outgoing relationship source validation in the core.
All generalized mutations separate authenticated caller provenance from destination
selection and retain caller-scoped normalized request/response pairs. Exact retries
replay before revision checks; changed requests reject. MCP conflicts expose compact
current state, while browser commands retain rich user projections.

Cross-task moves preserve destination watcher activations; issue 14's responsibility
claim optimization now additionally requires the attempt to belong to that task.
Relationship completion/removal/reassignment retain ADR 0019 semantics. Retired MCP
mutation aliases are not exposed, but historical transcripts remain recognizable.
Transcripts identify affected tasks, and destination activity no longer disappears
when its originating attempt belongs elsewhere. Architecture, ADR 0020, and the
delivered MCP reference have been updated; pins/history/guidance remain later slices.

Verification: 345 non-browser tests passed, 4 skipped; all 33 affected browser tests
passed (32 in the combined run, delivery-workflow proof passed on focused rerun after
updating its obsolete fixture URLs). Typecheck, build, and diff whitespace checks
passed. Build retains the existing advisory about a JavaScript chunk over 500 kB.
Independent Standards and Spec reviews have no outstanding findings; the Standards
naming suggestion was applied and rechecked. Changes remain unstaged for user review.

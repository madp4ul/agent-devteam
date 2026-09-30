# 02 — Generalize task content and relationships across project tasks

**Type:** task
**Status:** open
**Blocked by:** [01](01-cross-task-comments-and-participant-discovery.md).
**Specification:** [spec.md](../spec.md), scope/tool/mutation sections.

## Build

Expose task.create, partial task.edit, task.move, task.child.create, task.child.add,
task.dependency.add, task.relationship.resume_agent.update, and
task.relationship.remove. Existing-task subjects require current/concrete taskId.
Apply 01's caller/destination separation and payload-aware idempotency to every
generalized mutation. Use narrow resource-first schemas, not a generic executor.

## Acceptance

- [ ] Explicit subject selection permits any mapped mutable task across project
  boards regardless of role, relationships, or another running agent.
- [ ] Partial edit preserves omitted title/description; requires at least one field
  and expectedRevision. Move checks revision and remains within the existing board.
  Same-column move is inert; watched moves preserve normal activations/issue 14 behavior.
- [ ] Independent creation has explicit board/column and no invented existing subject.
  Invalid creation destinations reject with explanation without extra agent warnings.
- [ ] New child creation atomically creates child/relationship. Existing child addition
  creates only the relationship. Dependency/source targeting and explicit resumeAgent
  work across tasks; self means caller stable ID, not destination watcher.
- [ ] Preserve ADR 0019's completion/removal/reassignment semantics and ordinary queues.
  Unrelated task revisions do not alone reject valid relationship changes.
- [ ] Revision conflicts/rejections return compact current state, not full history.
  Exact retries replay retained results despite later revisions; mismatched keys reject.
- [ ] Archived/unmapped targets, foreign project scope, caller provenance, and stable
  relationship/source validation are covered at application and MCP seams.
- [ ] No agent execution/archive/global controls or cross-board transfer are introduced.
  Remove replaced current-only aliases and update transcript recognition/reference.

Keep storage/authority in the core. Update architecture when delivered flows change;
preserve staged content and leave changes unstaged.

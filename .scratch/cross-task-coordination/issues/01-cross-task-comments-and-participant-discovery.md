# 01 — Cross-task comments, participant discovery, and origin attribution

**Type:** task
**Status:** open
**Blocked by:** None.
**Specification:** [spec.md](../spec.md), identity/provenance/communication sections.

## Build

Deliver task.comment.add on any mapped mutable project task, with required
taskId=current/concrete, authorized caller provenance, and ordinary destination
mentions. Deliver task.participant.list and participant projection in inspection.
Roster is process-wide; state/addresses/watchers are task-specific. Include related
task titles in inspection without loading related histories. Render external author
origin title/ID in the destination browser timeline and agent projections.

## Acceptance

- [ ] Parent/child consultation reaches the parent's analyst and reply reaches the
  child's analyst. Same agent ID across tasks is allowed; exact self-addressing
  retains intended semantics. No conversation ID is accepted from the model.
- [ ] Only destination stores the comment; no outbound source timeline record.
  Source tool transcript records the outbound action. Attempts are authenticated
  against origin, not destination; supplied actor/origin spoofing cannot bypass it.
- [ ] New provenance survives restart. Valid legacy attempt linkage recovers origin;
  missing legacy origin is not fabricated. Preserve IDs as UUIDs.
- [ ] All applied agents are listed, even without board watcher/history/conversation.
  Busy destination queues normally; ordinary mentions use current/replacement lineage.
  Removed definitions are not addressable. Archived/unmapped cases follow spec.
- [ ] Exact retries create one comment/activation/attention. Changed payload with
  reused key rejects; caller collision cannot replay another participant's outcome.
  Extend normalized payload/caller identity retention rather than documenting a
  behavior the current executor lacks. Shared behavior is available to later slices.
- [ ] Application, MCP/HTTP, runtime transcript, and browser attribution coverage
  exercise the motivating scenario and independent task memory. Preserve scope isolation.
- [ ] Write the authority/provenance ADR and participant glossary refinement;
  update architecture/reference portions matching delivered behavior. Use released
  migrations with schema snapshot and restart coverage for new durable fields.

Do not invent board eligibility restrictions or runtime permissions. This ticket
does not implement pins/history paging; those are explicit later dependencies.

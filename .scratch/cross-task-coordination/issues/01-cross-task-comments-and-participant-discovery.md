# 01 — Cross-task comments, participant discovery, and origin attribution

**Type:** task
**Status:** resolved
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

- [x] Parent/child consultation reaches the parent's analyst and reply reaches the
  child's analyst. Same agent ID across tasks is allowed; exact self-addressing
  retains intended semantics. No conversation ID is accepted from the model.
- [x] Only destination stores the comment; no outbound source timeline record.
  Source tool transcript records the outbound action. Attempts are authenticated
  against origin, not destination; supplied actor/origin spoofing cannot bypass it.
- [x] New provenance survives restart. Valid legacy attempt linkage recovers origin;
  missing legacy origin is not fabricated. Preserve IDs as UUIDs.
- [x] All applied agents are listed, even without board watcher/history/conversation.
  Busy destination queues normally; ordinary mentions use current/replacement lineage.
  Removed definitions are not addressable. Archived/unmapped cases follow spec.
- [x] Exact retries create one comment/activation/attention. Changed payload with
  reused key rejects; caller collision cannot replay another participant's outcome.
  Extend normalized payload/caller identity retention rather than documenting a
  behavior the current executor lacks. Shared behavior is available to later slices.
- [x] Application, MCP/HTTP, runtime transcript, and browser attribution coverage
  exercise the motivating scenario and independent task memory. Preserve scope isolation.
- [x] Write the authority/provenance ADR and participant glossary refinement;
  update architecture/reference portions matching delivered behavior. Use released
  migrations with schema snapshot and restart coverage for new durable fields.

Do not invent board eligibility restrictions or runtime permissions. This ticket
does not implement pins/history paging; those are explicit later dependencies.

## Answer

2026-09-30: Implemented, verified, and left unstaged for user review.

- `task.comment.add` requires current/concrete task selection. Authentication derives
  caller identity and validates its running origin independently of the destination.
  Destination-only comments use existing mention queues and conversation lineages.
- `task.participant.list` and inspection share all applied definitions plus task-local
  addresses, running/queued/failed/suspension facts and watched columns. Related task
  inspection supplies endpoint titles without hydrating their discussion.
- Migration 0004 stores durable origin ID/title and request comparison evidence;
  valid legacy attempt/author linkage is backfilled, absent/mismatched evidence stays
  unknown. Comment keys isolate callers and compare normalized target/body before
  replay. Existing historical transcript names remain recognizable, not MCP aliases.
- Destination timeline and activation text identify external author title/ID; source
  transcripts identify/link the destination. External attempts no longer hide their
  comments under nonexistent local timeline groups. Unknown-origin comments are
  labeled and do not offer an author-specific reply to an unverified local namesake.
- Updated glossary, architecture, delivered MCP reference and ADR 0020. Pins, bounded
  history and remaining tool/mutation redesign belong to later tickets.

Verification: typecheck and browser build passed; full non-browser suite 337 passed,
4 skipped, no failures. Affected browser suites 44 passed; after the review fix,
5 focused origin/reply checks passed again, including dark/light origin contrast.
Standards review found one unknown-origin reply issue, reproduced and fixed with a
browser regression; recheck has zero outstanding findings. Spec review has zero
actionable mismatches. Original unmapped-agent-write and route tests were updated
to the agreed new contract while preserving user-authored inert unmapped mentions.

# 05 — Compose bounded activation updates, net pins, and final framework guidance

**Type:** task
**Status:** open
**Blocked by:** [02](02-generalize-task-and-relationship-commands.md), [03](03-curate-pinned-comments-in-tools-and-browser.md), [04](04-read-unified-history-with-stable-word-target-cursors.md).
**Specification:** [spec.md](../spec.md), cursor/checkpoint/pin/guidance sections.

## Build

Compose shared history JSON into activation context with durable conversation
checkpoints. Fresh/replacement threads get current state/all pins/recent history;
returning activations get changes and bounded recent updates. Source remains exact.
Apply the approved mechanics/data guidance and update MCP initialization instructions.

## Mandatory boundary examples

- [ ] 100 words omitted, targetWords=1000: history call returns only those updates,
  reports end of activation updates, and returns cursor for older history. That next
  cursor retrieves older records without restart/repetition. Original retry is identical.
- [ ] New arrivals do not shift captured traversal/counts; handles do not announce
  staleness. No scope argument. Zero remaining updates exposes an explicit older-history
  continuation directly rather than demanding a redundant empty call.
- [ ] Next activation advances through the previous composition interval regardless
  of optional retrieval. Old omissions are ordinary history; never persistent unread
  gaps. Composition time, not queued activation creation time, defines boundaries.
- [ ] Capture payload/checkpoints atomically and retain retry context across restart.
  Thread replacement restores current complete pin guidance. Preserve trustworthy
  same-thread self-authored retention behavior without inventing reading receipts.

## Pins, source, and wording

- [ ] Intermediate pin audit events remain explicitly inspectable history, not
  automatic activation updates that would defeat net-change delivery. Cursor
  projection/counts preserve this distinction through the activation checkpoint.
- [ ] Pin matrix per conversation: absent/absent none, absent/present full body,
  present/absent compact ID notice, present/present none despite toggles. Pin event
  time matters for old comments; static pins are not repeated on quick follow-ups.
- [ ] Exact activation source outside recent page is full and positioned explicitly;
  source/pin/history overlap renders body once. Follow-up message is its activation
  request, not a fabricated new task comment. Comments remain JSON-bounded data.
- [ ] Supply total/included/omitted words/records/comment counts separately for update
  interval and full history. Never assert bounded history is always complete.
- [ ] Framework guide explains supplied data, participants, mechanics, and authority.
  Other tool parameter details stay in tool descriptions. No mandatory pre-mention
  inspection, new finishing checklist, or Completion warning. Returning framing stays
  concise with relevant boundary explanations, not full static guide/catalog.
- [ ] attempt.context.inspect and attempt.permission_block.report retain caller scope;
  update runtime detection of renamed permission report and every known transcript tool.
- [ ] Extend history ADR/glossary and implemented architecture delivery flow. Migration/
  restart and runtime composition tests include scenarios 5–11 from the review draft.

Intake 12's human instruction review waits for this delivery and 06 verification.
Do not require the user to re-review approved conceptual wording before implementing
these accepted mechanics; final differences must remain inspectable for user review.

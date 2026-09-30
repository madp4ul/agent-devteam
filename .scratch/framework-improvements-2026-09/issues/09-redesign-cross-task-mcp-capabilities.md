# 09 — Inventory and redesign MCP capabilities for cross-task collaboration

**Type:** grilling
**Status:** resolved
**Blocked by:** None.
**Next step:** Implement the published cross-task coordination slices; the design is resolved, product delivery remains open.

## Problem and product direction

The user discovered that an agent cannot post comments on another task. This
conflicts with their original vision: agents should work freely across the board
and be able to change almost anything appropriate to their work. A process
definition should guide responsibility and judgment, rather than tools restricting
an agent to the task that originally spawned it.

Inventory every current coordination framework MCP tool and reassess the interface
as a whole. The user expects potentially substantial redesign and explicit
requirements work, not just adding a single cross-task comment operation.

The intended default is that an agent can interact with other tasks in the same
way it interacts with its own task. “Almost anything” still needs an explicit
capability definition and agreed invariant boundaries.

## Design completion criteria

- [x] Inventory tool names, purposes, arguments, implicit current-task assumptions,
  discovery/read/write coverage, and restrictions imposed by the framework.
- [x] Compare the actions available on the current task with those available on
  other tasks, including posting comments, editing, movement, relationships,
  inspection, and participant discovery/addressing.
- [x] Define which operations accept explicit task targets and how agents discover
  them without loading unbounded board/task content.
- [x] Separate process-authored responsibility guidance from technical capability
  limits; agree any remaining user-only actions and lifecycle invariants.
- [x] Define author attribution, activation side effects, concurrent edits, and
  invalid/archived/unmapped targets for cross-task actions.
- [x] Incorporate issue 10's parent/child consultation scenario and task-scoped
  participant identity into the redesign.
- [x] Publish an agreed specification, required domain/architecture decisions,
  and implementation slices before treating this as ready to build.

## Scope questions

Does board freedom extend across boards within the project? Which actions really
remain user-only? How should tools make the target explicit enough to avoid
accidental changes to the caller's task? Which existing names/contracts need
compatibility handling? Role guidance should not be mistaken for a change to
runtime filesystem or command permissions; issue 04 is a separate concern.

## Agreed direction — session record

The [MCP surface and framework guidance review draft](../mcp-redesign-review.md)
maps every existing tool, proposes descriptions and JSON shapes, and preserves
concrete acceptance examples. It also identifies a current-code discrepancy:
agent eligibility is process-wide, not restricted to a board roster. The user
accepted preserving that freedom: boards assign normal column responsibility,
but every currently declared agent can be addressed on any mapped task.

Recorded from the 2026-09-29/30 conversation. These are accepted decisions,
consolidated in the completed design synthesis linked under Answer. Product delivery
is not complete; no code was implemented in this grilling session.

### Authority and lifecycle

- The project is the technical coordination boundary. Agents may coordinate
  tasks across all boards in the project; relationships and assigned roles do
  not restrict access. Process/board/role instructions guide judgment.
- Agents may create independent tasks, edit task content, move tasks, comment,
  create children, and manage relationships on any valid mutable project task.
  Generalize task operations unless their meaning is inherently attempt-specific.
- Participant execution state is advisory; a running agent does not lock the
  task against comments or other valid mutations by another agent.
- Expose task.child.add to attach an existing task as a child, alongside
  task.child.create for creating a new task and relationship atomically. Both
  require explicit resume ownership and enforce relationship invariants.
- task.edit accepts partial title/description changes with expectedRevision;
  omitted fields are preserved. Authored comment text is immutable. Corrections
  use new comments; pin changes affect emphasis without rewriting history.
- Direct execution controls remain user-only: interrupt, continue, retry,
  dismiss activations, retire conversations, and similar run management.
  Archive/unarchive, project automation, process configuration, notification
  settings, permission approval, and environment recovery also remain user-only.
- Normal coordination effects still activate agents: mentions on the destination
  task, moves into watched columns, and relationship satisfaction.
- Active and completed-but-not-archived tasks remain mutable subject to normal
  invariants. Archived tasks are deliberately discoverable/inspectable but
  read-only to agents. Unmapped tasks require user recovery. Unknown targets
  return not-found; archived mutation targets return a distinct archived-task
  rejection.

### Interface and concurrency

- Every task-targeted tool requires an explicit taskId: current or a concrete
  ID. Remove duplicate current-task tools. Compatibility aliases and migration
  of the old MCP tool set are not required by the user.
- Use resource-first, dot-separated tool names with explicit actions. Exact
  names remain subject to the final inventory. Discussed examples include
  task.inspect, task.edit, task.move, task.comment.add, task.child.create,
  task.dependency.add, and task.relationship.remove. Child creation creates a
  task plus a relationship; dependency addition relates existing tasks.
- State-replacing edits/moves require expectedRevision. Append-only comments
  use idempotency keys without a task revision. Relationship operations target
  stable relationship IDs and validate relationship state without conflicting
  merely because an unrelated task comment changed the overall revision.
- Idempotency keys identify one intended mutation across retries, protecting
  against committed changes whose response was lost. Reusing a key with a
  different payload should reject. The existing explicit-key approach remains
  the proposed contract; transparent replacement would require a stable retry
  identifier, not merely a transport request ID.
- task.inspect includes compact participant information; task.participant.list
  provides that section alone for callers avoiding the larger inspection.
  The eligible roster comes from the applied process definition; boards select
  normal column responsibilities rather than restricting consultations. Participant
  addresses and execution state are task-specific. Return name/role summary and
  compact idle/queued/running state without conversation IDs or full instructions.

### Communication and attribution

- The canonical participant address is (taskId, agentId). The stable agent ID
  identifies the reusable definition; each task-scoped participant has separate
  conversational memory. Conversation lineage resolution remains internal.
- Post cross-task communication on the destination task and use existing
  canonical mentions there. Mentions always resolve on that destination task.
  Responding to an external participant means posting on its originating task.
- A comment has one canonical location: the destination. Do not duplicate it or
  add routine outbound-comment timeline events on the source task. The calling
  conversation retains the outbound tool call.
- Preserve the concrete origin task ID, agent ID, and originating attempt in
  attribution. Same-task rendering may omit redundant origin information.
  Cross-task rendering includes the origin task title and concrete ID, alongside
  the agent identity. Do not use current as durable attribution.
- These decisions also inform [issue 10](10-address-agents-on-other-tasks.md).
- Self-mention prevention applies to the exact (taskId, agentId) participant.
  Mentioning the caller's same stable agent ID on another task is permitted and
  addresses that other task's independent participant.
- Inspected relationships include related task titles alongside concrete IDs,
  type, and resume ownership, without loading related descriptions or histories.
- Do not add task.search in this redesign. Current collaboration is explicitly
  directed at known tasks; retain board summaries and bounded column listings.

### Bounded history and current pinned guidance

- Automatic history delivery and ordinary inspections must not return unbounded
  history collections. This includes large update intervals on returning agents.
  Bound accumulated history using the soft word-budget contract below, with
  explicit full-comment and pinned-guidance exceptions rather than a hard response
  size guarantee.
- Expose one optional targetWords with a default rather than requiring both a
  record count and text budget. A positive budget returns at least one whole
  comment when available. Select newest comments until their combined word count
  reaches or exceeds the budget, including the whole boundary-crossing comment;
  render the selected contiguous slice oldest-to-newest. Never split comments or
  introduce continuation handles within individual comments. Apply the same
  soft-budget rule to automatic activation comment updates. Exact defaults and
  word-count rules remain to be specified.
- Report actual words returned, remaining comment count, and estimated words
  remaining so an agent can choose a larger retrieval without precise context
  arithmetic. These are approximate content budgets, not model token guarantees.
- Paging handles capture a fixed upper history boundary. Later additions do not
  shift pages/counts or invalidate the handle; do not emit outdated/new-comment
  notices. Further pages walk backward from the cursor position. The activation
  checkpoint is a one-time paging stop, not a permanent lower history boundary;
  the precise accepted behavior is specified below.
- Unify comments and substantive framework events into one chronological history
  stream. Include task changes, relationship changes, meaningful run outcomes or
  failures, suspension/recovery, and conversation retirement. Exclude routine
  activation.created and attempt.started records from agent-facing history; no
  full-history option is needed solely to expose them. Current state remains a
  separate projection. Exact event payloads still need the final contract review.
- Use shared structured JSON records for MCP history results and activation
  history data, keeping framework instructions and the activation request outside
  that data. Preserve multiline bodies, comment/event IDs, types, timestamps,
  and authorship. Omit redundant same-task origin title/attribution; include origin
  task ID/title for external authors. Exact compact field shapes remain open.
- Current comment/event IDs are UUIDs; C-0123/E-0088 in session examples were
  illustrative. No ID-format change was requested or agreed.
- Delivery states how much was included/omitted and supplies a paging handle for
  the relevant interval. Include the exact activation source. Avoid persistent
  unread filtering that creates gaps between old omitted and new comments.
- Each activation uses a checkpoint: older omissions become ordinary history
  on the next activation rather than remaining in its new-update window. They
  remain historically retrievable. Say omitted, not unread; delivery does not
  prove that the agent read anything.
- Pinned comments are a deliberate exception to bounded history: an unpaginated,
  shared collection of guidance relevant to current task work. Agents and users
  can pin/unpin; the collection shrinks through curation rather than history
  removal. The user explicitly rejects pagination or hiding of pinned guidance.
- task.inspect returns the complete current pinned set. Fresh/replacement
  conversations receive it too. Returning activations deliver comments pinned
  since the previous checkpoint, based on pin time rather than creation time;
  do not repeat unchanged pins on every follow-up. Recommend inspection when
  important task context is missing or uncertain after compaction.
- Returning agents also receive compact unpin notices identifying the comment
  without repeating its body. Unpinning removes current emphasis; it does not
  delete or retract the historical comment.
- Compare pin membership at consecutive activation checkpoints. Unpinned at
  both checkpoints produces no notice even if temporarily pinned in between;
  newly pinned produces the full comment; newly unpinned produces a compact
  notice. Pinned at both checkpoints produces no update even after an intervening
  unpin/re-pin, assuming immutable comment text. Retain intermediate changes in
  history rather than repeating unchanged guidance in activation context.
- Preserve pinned comments in their original positions in paginated history.
  Within composed activation context, render the body once if it is both a new
  pin and included in the ordinary update page.
- Browser direction: place a compact pinned-comment collection below the task
  description with short previews, expansion, timeline jumps, and unpin controls.
  Provide pin/unpin controls at each comment's timeline location too.
- Capture comment-reference linking separately in
  [issue 21](21-link-to-task-comments-by-stable-address.md); syntax is not settled.

### Exact inspection and activation paging contract

Preserve these requirements in the eventual specification and acceptance tests;
do not replace them with a generic instruction to add pagination.

1. task.inspect returns current state, the complete current pinned set, and the
   most recent page of unified history. Its history.nextCursor is directly usable
   by task.history.list. A history-only caller may start at task.history.list.
2. Both tools accept optional targetWords. Description: "Approximate amount of
   history to retrieve; whole records may exceed this target." Select records
   newest-first until the target is reached/exceeded; render that page oldest-first.
   A positive target returns at least one whole available record, except an
   activation-checkpoint stop described below. Never split a record.
3. History metadata reports total words/record counts for the captured history,
   words/records returned, and words/records remaining. Activation delivery also
   reports the amount omitted from its update interval. Counts use the same
   word-count definition as selection; distinguish interval counts from full
   retained-history counts so an agent can request all omitted updates in one call.
4. An activation history cursor continues its omitted updates first. If the
   previous activation checkpoint is reached, stop there even when targetWords
   exceeds all remaining updates. Do not fill the page with older history.
5. On reaching that checkpoint, explicitly report "End of this activation's
   updates. Continuing will retrieve earlier history." Return a continuation
   cursor positioned to fetch older history on the next call, without restarting
   at the newest records. No scope argument is introduced.
6. Once across the checkpoint, subsequent pages continue older history normally,
   retaining the originally captured upper boundary. Ordinary task inspection/
   history pagination has no activation checkpoint stop.
7. Cursors are stable positions, not mutable read receipts. Repeating the same
   cursor and arguments returns the same page. Progress uses the nextCursor
   returned by the previous result. New arrivals do not produce stale notices.
8. Example: with 100 words of omitted updates and targetWords=1000, the first
   call returns only those updates, reports the checkpoint stop, and returns an
   older-history continuation. Calling with that returned cursor retrieves older
   records. Retrying the original cursor returns the same 100-word update page.

### Deferred board transfer

task.move continues to target columns on the task's existing board. Cross-board
task transfer is deferred because it changes participant eligibility and operating
instructions. Cross-board comments, child creation, and relationships remain in scope.

### Framework guidance review scope

This effort includes a pass over framework-authored guidance and MCP tool
descriptions. Explain mechanics, identities, available information, authority,
and operation consequences; leave workflow strategy to process/role guidance
and agent judgment. Remove the mandatory pre-mention inspection step without
replacing it with another inspection decision procedure. Explain snapshot
semantics, independent participant memory, destination-task mention routing, and
current-state inspection so agents can infer when information is insufficient.

[Issue 12](12-audit-agent-instructions-with-user.md) retains the broader interactive
user review and depends on delivery of this effort's instruction refinement.
Include that delivery dependency in eventual implementation slices.

### Comment pin operation details

task.comment.add accepts optional pinned (default false), creating the comment
and pin state atomically. Existing immutable comments have separate pin/unpin
operations. Pin changes do not activate participants or re-execute comment mentions.
Carry the agreed concrete paging/boundary/retry examples into acceptance tests.

### Final instruction refinement

Initial composition explains how to use the task/pins/history data it supplies.
MCP supplies tool schemas/descriptions separately; do not paste the complete catalog
into the activation. Parameter/retry details unrelated to the supplied data stay
in tool descriptions. Returning activations omit repeated static guidance and pins.
Completion creation needs clear rejection, not preemptive prompt warnings. The
final wording is in the specification, superseding the earlier review draft.

## Answer

2026-09-30: Grilling produced the [cross-task coordination specification](../../cross-task-coordination/spec.md)
and [six dependency-ordered implementation slices](../../cross-task-coordination/map.md).
The review inventory preserves all sixteen existing tools, their replacements,
the twenty-tool proposed surface, and fifteen normative acceptance scenarios.

The decision is resolved: project-wide task coordination with human-owned execution/
retention controls; task-agent participant addresses and destination-local mentions;
explicit current/concrete targeting; operation-specific concurrency/idempotency;
whole-record targetWords history, stable upper-watermark cursors with one activation
boundary stop, and complete curated pins with net returning-context changes.

Durable decision reasoning and required glossary/architecture/migration follow-through
are specified in the spec and assigned to delivery slices. Slice
[01](../../cross-task-coordination/issues/01-cross-task-comments-and-participant-discovery.md)
delivers authority/provenance, and
[04](../../cross-task-coordination/issues/04-read-unified-history-with-stable-word-target-cursors.md)/
[05](../../cross-task-coordination/issues/05-compose-bounded-activation-updates-and-net-pin-changes.md)
deliver history/checkpoints/guidance. Do not update implemented architecture as though
these flows already exist. Intake 12 waits for 05 and
[06](../../cross-task-coordination/issues/06-verify-complete-mcp-contract-and-publish-reference.md).

**Delivery remains open.** No product source changes, implementation tests, staging,
commits, or pushes were performed in this design session.

## Comments

- 2026-09-30: Recorded accepted session decisions after the user confirmed the
  parallel issue 15 agent had finished and authorized catching up deferred edits.

- 2026-09-20: User-described GitHub issue, explicitly identified as a large design
  effort needing grilling and definitions before implementation.

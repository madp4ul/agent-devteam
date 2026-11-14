# 06 — Evaluate One Conversation per Agent and Task

**What to evaluate:** After the initial agent-conversation experience is
implemented and used in real work, determine whether every ordinary activation
for the same task and agent should continue that agent's existing conversation
instead of starting a separate conversation.

**Blocked by:** 05 — Complete the Live and Accessible Conversation Experience

**Status:** resolved

- [x] Evaluate the hypothesis that a stable task-and-agent pair has aligned
  motivation and intent across repeated activations, making earlier context
  generally useful when the agent revisits, repairs, reviews, or extends its
  previous work.
- [x] Compare the proposed invariant—at most one conversation lineage per task
  and owning agent—with the current rule that every unrelated ordinary
  activation starts a fresh conversation while retries and explicit follow-ups
  continue an existing one.
- [x] Use real conversation experience to identify which repeated activations
  benefit from continuity, including returning to a watched column, later
  mentions, rework after review, and recovery after another agent has acted.
- [x] Test possible harms rather than assuming continuity is always neutral:
  stale premises, anchoring on an abandoned approach, obsolete process or role
  instructions, contradictory later user direction, lost-continuity recovery,
  context-window growth, and increased token consumption.
- [x] Decide whether current process, board, role, and activation instructions
  can remain clearly authoritative over inherited conversation history.
- [x] Determine whether continuity should be automatic for every activation of
  the same agent, limited to particular activation reasons, or offered as an
  explicit choice.
- [x] Decide whether the user or framework needs a safe **Start fresh** or fork
  mechanism when the existing lineage is unsuitable, unavailable, excessively
  large, or known to contain misleading context.
- [x] Define how process evolution, agent removal and restoration, task
  archival, thread replacement, and pre-existing multiple conversations for
  one task-agent pair affect the proposed invariant.
- [x] Evaluate how collapsing ordinary activations into one lineage changes the
  conversation index, generated titles, timeline navigation, run boundaries,
  retention, and token-usage interpretation.
- [x] Record evidence and a clear recommendation before changing the current
  conversation specification or implementation. If adopted, create explicit
  migration and implementation acceptance criteria as a separate follow-up.

## Rationale

When a task returns to the same agent, that agent may be fixing or extending
work it performed earlier. Its previous reasoning, repository observations,
and interaction history can reduce repetition and help it understand why the
task came back. Because the conversation remains scoped to one task and one
stable agent role, the inherited context may be more aligned than context
shared across tasks or agents.

This remains a long-term hypothesis. The first conversation delivery
intentionally creates separate conversations for distinct ordinary
activations, and the product should gain practical experience with that model
before replacing it with automatic continuity.

## Comments

- “One conversation per task” means one conversation for each **task and
  owning-agent pair**, not one shared conversation across several agents.
- This ticket is deliberately evaluative and may conclude that the current
  fresh-conversation rule, a hybrid policy, or an explicit user choice is safer
  than unconditional reuse.

## Answer

The evaluation concluded that ordinary activations should automatically reuse
one current conversation for each stable task-and-agent pair. Real work showed
that returned column responsibility, later mentions, rework, blocker clearance,
and recovery after another agent acted usually benefit from the agent's earlier
reasoning. The resulting [Agent Conversation Continuity specification](../../agent-conversation-continuity/spec.md)
records the evidence, rejected alternatives, edge-case decisions, and explicit
acceptance criteria.

The design addresses the evaluated harms with authoritative per-activation
bootstraps, restart-safe delivery of new task context without repeating
unchanged unbounded text, attempt-scoped recovery of current operating
instructions, preserved run boundaries and token attribution, and honest
runtime-thread replacement behavior. Process evolution and archival retain
their existing authority and lifecycle semantics; pre-release multiple-lineage
migration was intentionally unnecessary, and agent removal/restoration remained
outside dedicated feature work under the repository's stable-identity rules.

[Continuity ticket 01](../../agent-conversation-continuity/issues/01-continue-ordinary-activations-in-current-conversation.md)
implemented and verified automatic reuse across ordinary activation reasons,
isolation between tasks and agents, bounded context growth, compaction recovery,
navigation, and attribution. [Continuity ticket 02](../../agent-conversation-continuity/issues/02-retire-and-replace-agent-conversations.md)
implemented the explicit user-controlled escape hatch: retire a settled lineage
with a reason, preserve it as history, and create a fully informed replacement
only when later ordinary work arrives. Together those resolved tickets complete
the recommendation and its implementation evidence.

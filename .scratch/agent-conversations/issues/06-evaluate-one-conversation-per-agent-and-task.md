# 06 — Evaluate One Conversation per Agent and Task

**What to evaluate:** After the initial agent-conversation experience is
implemented and used in real work, determine whether every ordinary activation
for the same task and agent should continue that agent's existing conversation
instead of starting a separate conversation.

**Blocked by:** 05 — Complete the Live and Accessible Conversation Experience

**Status:** open

- [ ] Evaluate the hypothesis that a stable task-and-agent pair has aligned
  motivation and intent across repeated activations, making earlier context
  generally useful when the agent revisits, repairs, reviews, or extends its
  previous work.
- [ ] Compare the proposed invariant—at most one conversation lineage per task
  and owning agent—with the current rule that every unrelated ordinary
  activation starts a fresh conversation while retries and explicit follow-ups
  continue an existing one.
- [ ] Use real conversation experience to identify which repeated activations
  benefit from continuity, including returning to a watched column, later
  mentions, rework after review, and recovery after another agent has acted.
- [ ] Test possible harms rather than assuming continuity is always neutral:
  stale premises, anchoring on an abandoned approach, obsolete process or role
  instructions, contradictory later user direction, lost-continuity recovery,
  context-window growth, and increased token consumption.
- [ ] Decide whether current process, board, role, and activation instructions
  can remain clearly authoritative over inherited conversation history.
- [ ] Determine whether continuity should be automatic for every activation of
  the same agent, limited to particular activation reasons, or offered as an
  explicit choice.
- [ ] Decide whether the user or framework needs a safe **Start fresh** or fork
  mechanism when the existing lineage is unsuitable, unavailable, excessively
  large, or known to contain misleading context.
- [ ] Define how process evolution, agent removal and restoration, task
  archival, thread replacement, and pre-existing multiple conversations for
  one task-agent pair affect the proposed invariant.
- [ ] Evaluate how collapsing ordinary activations into one lineage changes the
  conversation index, generated titles, timeline navigation, run boundaries,
  retention, and token-usage interpretation.
- [ ] Record evidence and a clear recommendation before changing the current
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

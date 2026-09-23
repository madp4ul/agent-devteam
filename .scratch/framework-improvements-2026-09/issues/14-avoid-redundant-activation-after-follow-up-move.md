# 14 — Avoid redundant activation when a follow-up agent moves into its watched column

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Confirm the existing mention-activation exception, then extend its invariant to running follow-up activations.

## Problem and requested behavior

Conversation follow-ups are increasingly used as direct working exchanges with
an agent. During that follow-up run, the agent may move its task into a column
that the same agent watches. Ordinary column-entry semantics then create another
activation even though the agent is already running and has just claimed that
workflow position as part of the current follow-up.

Do not create that redundant activation. The running `user-follow-up` activation
should remain the single expectation responsible for the work when its agent
successfully moves the task into a column watched by that same agent.

The coordination framework appears to prevent the equivalent duplicate when a
running mention-triggered agent makes this move. Verify that implementation and
generalize the established invariant rather than adding an unrelated special
case or suppressing legitimate handoffs.

## Acceptance criteria

- [ ] When the actor has a running `user-follow-up` activation and successfully
  moves its task into a column watched by that same agent, no additional
  `column-entry` activation is created for the move.
- [ ] The existing follow-up activation remains running and attributable to its
  original conversation, source message, attempt, and agent.
- [ ] The move and resulting board state remain fully recorded even though a
  duplicate activation is suppressed.
- [ ] The exception is based on the authenticated actor's current activation,
  destination watcher identity, and successful responsibility-changing move;
  merely having another activation queued or running is insufficient.
- [ ] Moves into a different agent's watched column retain normal handoff and
  column-entry behavior.
- [ ] User moves, non-follow-up runs, moves without a running activation,
  unwatched destinations, failed/idempotent moves, retries, and concurrency
  retain their intended existing behavior.
- [ ] Domain/application tests mirror the established running-mention scenarios
  and include same-agent suppression plus different-agent counterexamples.

## Related work

Use the semantics and regression coverage from
[`agent-coordination-framework` issue 52](../../agent-coordination-framework/issues/52-let-mentioned-agents-claim-primary-responsibility.md)
as the starting point. The conversation specification already defines a
follow-up as targeting the conversation's owning agent without automatically
substituting the current column watcher.

## Comments

- 2026-09-23: Added from user dictation. The equivalence to running mention
  activations is a hypothesis to verify against the implementation.

# 50 — Discard an Interrupted Activation

**What to decide:** A user who no longer needs interrupted work can deliberately
abandon the preserved activation instead of being forced to continue it before
the task can leave its suspended state.

**Blocked by:** None

**Status:** needs-discussion

## Scenario

The user interrupts a running activation, decides that no further agent work is
needed, and moves the task elsewhere—possibly to Completion. The activation
remains preserved and task automation remains suspended, but the current UI
offers only Continue. The user needs an explicit way to say that this activation
will not be continued.

## Questions

- Is abandonment a new interrupted-activation outcome, a dismissal of the
  existing activation, or a broader task-automation reset command?
- Should abandoning the interrupted activation immediately allow later queued
  activations to run, or should the user choose whether to discard those too?
- What happens when the task has already moved to Completion?
- Which immutable activity and attempt history records the decision?
- Should this initially remain a user-only recovery action, like relationship
  removal, or also be exposed to agents?

## Comments

- User review after issue 47: interrupting an activation can leave a task stuck
  with Continue as the only recovery action even when the user deliberately no
  longer wants that activation to run.

# 57 — Make Every Task Attention Reason Actionable

**What to build:** Turn the task-level Needs attention panel into a compact
action center: every listed reason must offer a concrete path to the place or
decision that can resolve it, without duplicating large controls across task
details.

**Blocked by:** 59 — Add Notification Settings and Refine the Top Bar

**Status:** resolved

- [x] Establish the UI invariant that every unresolved attention reason shown
  in task details has an associated call to action. A label that merely says
  something needs attention is insufficient.
- [x] For a user-mention reason, replace the panel's `Mark addressed` button
  with an action that navigates to and focuses the exact source comment in the
  task timeline.
- [x] Put `Mark addressed` beside the source comment that mentioned the user,
  alongside the existing Respond action where Respond is available. Resolving
  it there must retain the existing durable attention-resolution behavior and
  remove the reason from the task-level panel after refresh.
- [x] Preserve issue 59's authoritative rule that only an agent-authored user
  mention creates user attention. This ticket changes where that existing
  reason is acted upon, not which comments create one.
- [x] Move recovery for the `automation-suspended` / Continue-required reason
  from the expanded Agent activity content into the corresponding Needs
  attention item. Agent activity may still identify the interrupted current
  activation, but the attention panel owns the user decision that resolves the
  suspension.
- [x] Keep interruption recovery compact. Opening its attention action presents
  the optional continuation message in a dialog rather than reserving that
  form's full height in Agent activity.
- [x] Decide during specification whether interruption recovery uses one
  `Resolve` action whose dialog offers Continue and Dismiss, or exposes separate
  Continue and Dismiss actions directly on the attention item. Either design
  must keep both outcomes discoverable, require the same confirmations where
  applicable, and avoid duplicating controls between panels.
- [x] Preserve the existing user-only authority, audit history, queue-release
  semantics, race handling, attention deep-link highlighting, and recovery
  behavior for failure, permission, stale-process, and interruption reasons.
- [x] Add application and browser coverage for navigation to the exact source
  comment, source-local acknowledgement, conditional attention-panel removal,
  compact interruption recovery, Continue, Dismiss, keyboard focus, and
  narrow-screen reading order. Issue 59 owns creation-level mention authorship
  coverage.

## Comments

- Follow-up captured after issue 50 and the task-level Needs attention panel
  were implemented. This ticket records future work only; it does not authorize
  implementation now.
- The desired organizing principle is actionability: the prominent attention
  panel summarizes unresolved user decisions and provides a direct next step,
  while source-specific actions live beside their source and larger forms open
  only on demand.
- The exact compact presentation for interruption recovery is intentionally
  unresolved between a single dialog-opening Resolve action and two direct
  actions. That choice should be made when this ticket is specified.
- Issue 59 now owns suppressing user-authored `@user` self-mentions and is
  intentionally implemented first. This ticket consumes the resulting
  agent-authored mention reasons without redefining their eligibility.

## Answer

Implemented the task-detail attention action center. User-mention reasons now
navigate to and focus their exact source comments, where `Mark addressed` and
Reply live together; Reply resolves the durable attention reason before opening
the composer. The panel now precedes long descriptions and uses distinct compact
reason cards in both appearances and at narrow widths.

Interruption recovery moved out of Agent activity behind one compact `Resolve
interruption` action. Its dialog keeps the optional continuation message and
both Continue and confirmed Dismiss outcomes, refreshes authoritative state on
races, and leaves Agent activity as the status/history surface. Application
semantics remain unchanged; browser coverage exercises source navigation,
source-local resolution, Reply resolution, conditional panel removal, Continue,
Dismiss, race handling, focus, themes, and responsive reading order.

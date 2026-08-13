# 40 — Reuse a Queued Column-Entry Activation After Unblocking

**What to change:** When final-blocker clearance makes an untouched queued
column-entry activation runnable for the same task and current-column agent,
reuse that existing activation instead of queuing duplicate work for the same
responsibility.

**Blocked by:** 21 — Split, Relate, and Unblock Work

**Status:** resolved

- [x] Final-blocker clearance always records immutable relationship-satisfaction
  activity, whether it reuses an activation or creates one.
- [x] If the task already has an untouched queued `column-entry` activation for
  the agent watching its current column, clearing the final blocker makes that
  activation runnable and creates no additional `blockers-cleared` activation.
- [x] Reuse does not rewrite the queued activation's immutable reason, source
  event, target agent, process version, or position. The later clearance remains
  discoverable through task activity and current relationship state.
- [x] A queued mention or another independently requested expectation is never
  treated as a substitute for column-entry responsibility.
- [x] If no qualifying untouched activation exists—for example because the
  earlier activation is running, completed, failed, targets another agent, or
  represents another reason—final-blocker clearance creates the ordinary
  `blockers-cleared` activation.
- [x] Behavioral tests reproduce a task moved into a watched column, blocked by
  a child before its queued activation starts, and then unblocked by child
  completion. Exactly one agent run handles that implementation responsibility.
- [x] Tests preserve distinct activation behavior for mentions, repeated column
  entries, active runs, and genuinely separate expectations.
- [x] The activation lifecycle specification and domain glossary document this
  narrow reuse rule without introducing general semantic coalescing,
  reprioritization, cancellation, or supersession.

## Comments

- User testing after issue 21 showed the concrete failure: moving a parent into
  Implementation queued a `column-entry` activation; completing its child then
  queued `blockers-cleared`. Once unblocked, both Implementation Agent runs
  executed. The first handed off successfully, while the second attempted the
  same handoff from the already-changed current state.
- Final-blocker clearance is a new expectation when no pending responsibility
  can observe it. In this narrower scenario it is instead the condition that
  releases an existing expectation, so another activation adds no work or
  provenance that immutable satisfaction activity does not already preserve.
- Issue 39 remains a useful adapter safety net: the duplicate run's same-column
  move failed its MCP call and could mark an otherwise healthy agent run and
  task as failed. Keep issue 39 at its existing priority because the interaction
  appears rare; this lifecycle clarification addresses the demonstrated source
  without relying on adapter tolerance alone.
- Framework reassessment instructions are tracked by issue 38 as defense in
  depth. They remain necessary because other legitimate queued activations can
  become obsolete while waiting.

## Answer

Final-blocker satisfaction and removal now reuse an untouched, non-stale queued
`column-entry` activation for the task's current watching agent instead of
creating a duplicate `blockers-cleared` activation. The existing activation row
is left unchanged, while relationship activity continues to record the later
clearance.

Application behavior tests cover the reported move/child/completion sequence
through exactly one agent run, plus queued mentions, running activations, and
repeated column entries as distinct expectations. The activation lifecycle in
the specification and the domain glossary document the narrow exception. All
147 runnable tests, typechecking, and the production build pass; the two
credentialed real-Codex tests remain intentionally skipped.

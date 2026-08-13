# 39 — Handle Same-Column Moves as Inert Interactions

**What to fix:** Moving a task to its current column should be treated as an
inert interaction at user and agent adapters rather than surfacing a failed MCP
command or drag-and-drop error.

**Blocked by:** 17 — Complete a Minimal Codex Handoff; 19 — Inspect and Control a Task

**Status:** resolved

- [x] Dropping a task back into its current board column performs no mutation
  and presents no failure feedback.
- [x] An agent request to move its current task to the current column returns an
  understandable inert result rather than an unexplained failed MCP call.
- [x] The authoritative application command continues to reject true duplicate
  column-entry mutations so no activity or activation is created.
- [x] Browser and MCP contract tests cover both same-column interactions and
  confirm that task revision, activity, and activations remain unchanged.

## Comments

- User testing after issue 21 observed `move_current_task` fail with “Codex
  reported no underlying cause” when an unblocked parent agent selected the
  column it already occupied. The related diagnostic identified the actual
  cause as an attempted same-column move.
- The same underlying interaction is visible when a card is dragged and dropped
  into its existing column. This follow-up records the bug; it is intentionally
  not fixed as part of the issue-21 relationship UI refinement.

## Answer

The board drag adapter now ignores a task dropped back into its authoritative
current column, with browser coverage proving that no move request, failure
feedback, revision, activity, or activation results. The agent adapter returns
a successful `already-in-column` MCP result and durably replays that inert
result for an exact idempotent retry even if the task later moves elsewhere.
The authoritative application move command remains unchanged and continues to
reject a fresh duplicate column-entry mutation.

Typechecking, the production build, 143 automated tests with two intentional
skips, and the focused browser acceptance coverage pass. The complete browser
run passes 47 of 48 tests; the unrelated pre-existing relationship scenario is
order-dependent in the shared fixture and passes when run alone.

# 39 — Handle Same-Column Moves as Inert Interactions

**What to fix:** Moving a task to its current column should be treated as an
inert interaction at user and agent adapters rather than surfacing a failed MCP
command or drag-and-drop error.

**Blocked by:** 17 — Complete a Minimal Codex Handoff; 19 — Inspect and Control a Task

**Status:** open

- [ ] Dropping a task back into its current board column performs no mutation
  and presents no failure feedback.
- [ ] An agent request to move its current task to the current column returns an
  understandable inert result rather than an unexplained failed MCP call.
- [ ] The authoritative application command continues to reject true duplicate
  column-entry mutations so no activity or activation is created.
- [ ] Browser and MCP contract tests cover both same-column interactions and
  confirm that task revision, activity, and activations remain unchanged.

## Comments

- User testing after issue 21 observed `move_current_task` fail with “Codex
  reported no underlying cause” when an unblocked parent agent selected the
  column it already occupied. The related diagnostic identified the actual
  cause as an attempted same-column move.
- The same underlying interaction is visible when a card is dragged and dropped
  into its existing column. This follow-up records the bug; it is intentionally
  not fixed as part of the issue-21 relationship UI refinement.

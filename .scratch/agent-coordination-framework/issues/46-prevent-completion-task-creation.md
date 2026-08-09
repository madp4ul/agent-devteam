# 46 — Prevent Tasks from Starting in Completion and Unify Creation

**What to build:** Users and agents create ordinary and child tasks through a
consistent flow that defaults to the beginning of the board, retains deliberate
workflow placement, and never allows a new task to start already completed.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] The board offers no Create task action in its framework-owned Completion
  column or row, while every non-Completion column retains its creation action.
- [ ] Ordinary and child-task creation dialogs omit Completion from their
  starting-column choices and preserve board order for every available option.
- [ ] Child creation from task details uses the same dialog structure and field
  language as ordinary task creation, identifies the parent, defaults to the
  board's first column, and creates the parent-child relationship atomically.
- [ ] Child creation retains deliberate selection of any non-Completion column;
  the optional task-workspace starting ref is available through an Advanced
  disclosure and preserves its existing committed-state semantics.
- [ ] The shared application command boundary rejects both ordinary and child
  creation in Completion without creating a task, relationship, activation, or
  partial history, regardless of whether the caller is the browser, an agent
  tool, or another API adapter.
- [ ] Agent tools continue to accept an explicit non-Completion starting column
  and expose the same clear rejection when Completion is requested.
- [ ] Application behavior tests cover accepted non-Completion creation and
  rejected Completion creation for ordinary and child tasks; browser scenarios
  cover the shared dialog, default and deliberate column selection, Advanced
  starting-ref disclosure, and absence of Completion creation controls.

## Context

The framework-owned Completion column is a destination, not a starting point.
This issue changes creation only; existing tasks continue to enter Completion
through the ordinary conflict-safe move command.


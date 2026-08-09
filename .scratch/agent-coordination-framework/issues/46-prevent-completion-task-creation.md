# 46 — Prevent Tasks from Starting in Completion and Unify Creation

**What to build:** Users and agents create ordinary and child tasks through a
consistent flow that defaults to the beginning of the board, retains deliberate
workflow placement, and never allows a new task to start already completed.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] The board offers no Create task action in its framework-owned Completion
  column or row, while every non-Completion column retains its creation action.
- [x] Ordinary and child-task creation dialogs omit Completion from their
  starting-column choices and preserve board order for every available option.
- [x] Child creation from task details uses the same dialog structure and field
  language as ordinary task creation, identifies the parent, defaults to the
  board's first column, and creates the parent-child relationship atomically.
- [x] Child creation retains deliberate selection of any non-Completion column;
  the optional task-workspace starting ref is available through an Advanced
  disclosure and preserves its existing committed-state semantics.
- [x] The shared application command boundary rejects both ordinary and child
  creation in Completion without creating a task, relationship, activation, or
  partial history, regardless of whether the caller is the browser, an agent
  tool, or another API adapter.
- [x] Agent tools continue to accept an explicit non-Completion starting column
  and expose the same clear rejection when Completion is requested.
- [x] Application behavior tests cover accepted non-Completion creation and
  rejected Completion creation for ordinary and child tasks; browser scenarios
  cover the shared dialog, default and deliberate column selection, Advanced
  starting-ref disclosure, and absence of Completion creation controls.

## Context

The framework-owned Completion column is a destination, not a starting point.
This issue changes creation only; existing tasks continue to enter Completion
through the ordinary conflict-safe move command.

## Answer

Task creation eligibility is now an application-owned capability backed by one
shared policy. Ordinary and child commands reject Completion before allocating
a task number or writing task, relationship, activation, or history state; the
browser and agent adapters expose the same explicit rejection. Existing tasks
continue to enter Completion through the conflict-safe move command.

The board omits creation actions from Completion in both layouts. Ordinary and
child creation now share one dialog, preserve board-ordered workflow placement,
and omit Completion. Child mode identifies its parent, defaults to the first
workflow column, creates the relationship atomically, and keeps the optional
task-workspace starting ref behind Advanced.

Both TypeScript typechecks, the production build, 119 local tests with one
intentional credentialed integration skip, and all 28 browser scenarios pass.
Live visual review passed at desktop and narrow widths. The independent Spec
review found no issues. The Standards review's initial application-authority
finding was corrected; its re-audit found no documented-standard violation and
only a low-severity judgment call about repeated completed-task test setup.

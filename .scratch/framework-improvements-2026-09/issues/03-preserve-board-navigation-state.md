# 03 — Preserve board overview state when returning from task details

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Reproduce navigation-state loss and inspect state ownership.

## Report and reproduction

The user scrolls down the board overview to find a task, opens its details, and
uses Back. The board reappears at the top, leaving the previously selected task
out of view. Repeatedly finding that task breaks the browsing workflow.

The desired outcome is returning to the board in exactly the state it had when
the user left, with scroll position the concrete reported failure. Inventory
other relevant view state during diagnosis rather than silently narrowing this
to one vertical offset.

## Acceptance criteria

- [ ] Returning from task details restores the prior board reading position so
  the originating task remains visible when it still exists in that view.
- [ ] Preserve applicable view state such as selected board, filters, and relevant
  scroll containers; determine which of these already survive navigation.
- [ ] Cover the reported Back action and distinguish browser history navigation
  from any in-app back control if both exist.
- [ ] Define sensible restoration when a task moves/disappears or board content
  changes while details are open; avoid restoring stale board data as authority.
- [ ] Verify restoration after the board's asynchronous content has rendered,
  without a subsequent refresh resetting the viewport again.

## Candidate approach, not a decision

The user suspects that navigating away destroys the board overview. Keeping it
mounted might preserve state more naturally. They contrast this with opening an
agent conversation dialog: task details remain behind the overlay and retain
their state. Neither the suspected lifecycle nor the suggested fix is verified.

Compare retaining the board with explicit restoration before choosing an approach.
Read the architecture map before changing state ownership or navigation boundaries;
update it and record durable reasoning if the resulting fix changes architecture.

## Comments

- 2026-09-20: User-described GitHub issue; diagnosis remains open.

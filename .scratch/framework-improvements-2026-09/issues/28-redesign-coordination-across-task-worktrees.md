# 28 — Redesign coordination across tasks with different worktrees

**Type:** grilling
**Status:** open
**Blocked by:** None.
**Next step:** Discuss parent/child Git state transfer, synchronization, and integration semantics.

## Problem and requested direction

Agents need reliable data sharing across tasks, especially when a parent delegates
work to child tasks. Define effective mechanisms for sharing parent files/Git
changes with children and integrating completed child work back into the parent.

Passing commit IDs has been unreliable in practice. A keyword could identify the
current parent commit without requiring an agent to copy its exact ID; coordination
tools should validate supplied commits and reject unknown ones. The parent may
advance between child creation and startup, so define precisely which parent
commit the child inherits and when that choice is resolved.

Git branches are a candidate mechanism, but two worktrees cannot check out the
same branch simultaneously. The user's proposed direction is a distinct branch
for each task, created from the source commit; children know the parent branch
and merge it regularly, and child completion wakes an agent on the parent to
merge the child's branch into the parent's current branch. This is an open design
proposal rather than an agreed implementation.

## Design questions and completion criteria

- [ ] Define which parent files/state can be shared, including whether and how
  uncommitted changes or non-Git files are supported.
- [ ] Define explicit-commit and symbolic-current-parent selectors, their
  resolution moment, and validation/error behavior for unknown or unavailable commits.
- [ ] Resolve child creation versus startup races and retain evidence of the
  actual source commit, parent identity, and parent branch.
- [ ] Evaluate one branch per task, branch naming/ownership/lifecycle, and
  worktree checkout constraints against the existing workspace model.
- [ ] Define how children track advancing parent work, when synchronization occurs,
  and who resolves merge conflicts; do not assume ordinary git pull achieves this.
- [ ] Define parent wake-up and child integration, including an advancing parent,
  multiple children, merge failures, retries, and when child work is considered integrated.
- [ ] Define coordination-tool contracts that make state transfer reliable and
  understandable rather than depending on agents copying commit IDs correctly.
- [ ] Publish an agreed specification and dependency-aware delivery tickets;
  read the architecture map and record durable workspace decisions in an ADR.

## Related work

Revisit the existing [Git workspace lifecycle decision](../../agent-coordination-framework/issues/08-define-git-workspace-lifecycle.md),
which describes committed Git-addressable inheritance. Align tool design with
[issue 09](09-redesign-cross-task-mcp-capabilities.md) and its cross-task
coordination effort without treating current discussion proposals as settled rules.

## Comments

- 2026-09-30: User-described GitHub discussion issue; URL and number were not
  supplied. Intake preserves the supplied proposal and reported unreliable
  commit-ID passing; no reproduction or branch-policy decision was made here.

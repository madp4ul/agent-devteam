# 21 — Link to task comments by stable address

**Type:** grilling
**Status:** open
**Blocked by:** None; coordinate with issue 09's comment identity and history design.
**Next step:** Agree comment-reference syntax and navigation behavior in a separate design session.

## Problem and requested direction

Agents already refer to earlier comments by comment ID rather than repeating
their text. Support navigable references in authored comment bodies so humans
can reach the referenced information directly. References should support both
comments on the same task and comments on another task, using a comment ID and,
where needed, the destination task ID.

This request arose during issue 09's discussion of compact pin/unpin updates.
It is a separate follow-up; no reference syntax was selected during that session.

## Design questions and completion criteria

- [ ] Agree an explicit reference syntax and task-context resolution rules.
- [ ] Define same-task and cross-task comment navigation, including revealing
  the exact comment when timeline filtering or collapsed content would hide it.
- [ ] Define readable link labels and behavior for unknown, unavailable, or
  archived targets without silently navigating to a different comment.
- [ ] Align references with stable comment IDs and issue 09's cross-task
  attribution; do not use conversation IDs as comment addresses.
- [ ] Specify how references remain understandable in agent-visible text,
  rendered Markdown, and copied content.
- [ ] Publish an agreed specification and implementation slices before building.

## Comments

- 2026-09-30: Requested by the user during issue 09 grilling. Capture the
  capability now and defer its detailed design so it does not derail that session.

---
name: implement
description: "Implement a piece of work based on a spec or set of tickets."
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Use /tdd where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

Once done, use /code-review to review the work.

Follow `docs/agents/development-workflow.md`. Leave the changes unstaged for
the user's review. Do not stage, unstage, commit, or push; the user owns those
Git actions.

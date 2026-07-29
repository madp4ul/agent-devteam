# Agent Development Workflow

This repository uses Matt Pocock's engineering skills as a planning and
delivery workflow. The user does not need to remember the individual skills or
their order. When the user asks what to do next, which workflow fits, or how to
move an idea toward implementation, consult
`.agents/skills/ask-matt/SKILL.md` and this document.

## Default flow

Choose the entry point based on how clear the work is:

1. For a large, uncertain, multi-session effort, use `wayfinder` to resolve the
   decision fog. Use `research`, `prototype`, `grilling`, and `domain-modeling`
   where the map calls for them.
2. For a scoped idea that can be clarified in one conversation, use
   `grill-with-docs`.
3. Once the important decisions are clear, use `to-spec` to synthesize the
   agreed result.
4. Use `to-tickets` to split the specification into dependency-aware,
   agent-sized vertical slices.
5. Start each ticket in a fresh agent context and use `implement`. It should
   apply `tdd` at agreed seams and finish with `code-review`.
6. Hand the resulting local changes to the user for review.

The short form is:

`wayfinder or grill-with-docs -> to-spec -> to-tickets -> implement -> code-review -> user review`

`research` and `prototype` are supporting detours, not mandatory phases.

## Git ownership and review markers

The user owns the Git history:

- Agents may edit files in the working tree.
- Agents must not stage, unstage, commit, amend, rebase, or push unless the user
  gives an explicit one-time instruction to do so.
- Agent-created changes should be left unstaged for user review.
- A staged change means the user has reviewed and accepted that exact content.
  Treat staged content as an immutable baseline.
- Never reset, restore, overwrite, or otherwise disturb staged content.
- Before editing a file that has staged changes, inspect staged and unstaged
  diffs separately. If the requested edit would overlap a staged hunk, tell the
  user before proceeding.
- Report staged and unstaged changes separately when handing work back.

Git may reject repository commands because the workspace owner differs from
the Codex process owner. Do not modify global Git configuration. For read-only
inspection, use a command-scoped trust override when necessary:

`git -c safe.directory=D:/Daten/Projekte/Software/CSharp/agent-devteam <command>`

This override is for local inspection only; it does not grant permission to
commit or push.

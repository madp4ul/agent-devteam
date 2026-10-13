# 97 — Remind Agents About Activation Mentions at the Comment Tool

**Type:** task

**What to build:** Put a concise reminder directly in the agent-facing comment
tool metadata so agents see the activation consequence while composing a
comment and use ordinary names when they only intend to refer to an agent.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Problem

Agents can accidentally activate another agent by using its canonical mention
syntax in a status update, explanation, or account of earlier work. The reminder
should be as close as possible to comment authoring, where the agent chooses
the comment text, rather than relying only on general operating instructions
that may be far away in its context.

## Acceptance criteria

- [x] The `task.comment.add` tool description explicitly says that a canonical
  `@<agent-id>` mention requests activation of that agent on the destination
  task. The warning is visible before submission, rather than only in a tool
  result after the comment has been posted.
- [x] The same description tells agents to use the display name or the agent
  ID without the `@` prefix when referring to an agent without requesting work.
  Include a short example distinguishing an intentional request such as
  `@review-agent please review` from a plain reference such as
  `Review Agent completed the review`.
- [x] Place the reminder prominently in the tool description and, if useful,
  also on the `body` input schema so it appears beside the field being authored.
  General framework instructions may reinforce it but are not the sole delivery
  mechanism.
- [x] Keep the reminder concise and consistent with existing mention parsing,
  destination-task semantics, and deliberate activation behavior. No new
  escaping convention, parser rule, confirmation step, or activation suppression
  mechanism is introduced.
- [x] Verify through MCP tool discovery that the exposed comment-tool metadata
  includes both the activation consequence and the non-activating alternative.
  Existing intentional-mention and plain-reference behavior remains intact.

## Implementation pointers

- `src/mcp/stdio-server.ts` registers `task.comment.add`; its current description
  explains destination participants but does not explicitly warn that writing
  the mention activates an agent.
- `src/application/participant-mentions.ts` owns canonical mention parsing.
- `test/mcp/project-scoped-mcp.test.ts` exercises discovered tool metadata and
  comment calls through the MCP boundary.
- Issue 38 owns the wider separation of framework and process instructions;
  this ticket is the focused reminder at comment authoring time.

## Comments

- 2026-10-13: Created from the user's request to put an activation-mention
  reminder as close as possible to the comment tool and show agents how to
  write names when they do not intend activation.

- 2026-10-13: Implemented and verified through MCP discovery; Standards and
  Spec reviews reported no findings. Changes remain unstaged for user review.

## Answer

The `task.comment.add` description now places the canonical-mention activation
reminder immediately after its opening sentence. It identifies the destination
task, recommends display names or IDs without `@` for ordinary references, and
includes `@review-agent please review` versus `Review Agent completed the review`.
The input schema, parser, and activation behavior are unchanged.

Verification:

- Added assertions against real MCP `client.listTools()` metadata; observed
  failure before the description change and success afterward.
- MCP and mention/attention suites: all 11 tests passed, including deliberate
  activation and inert plain-reference behavior.
- `pnpm typecheck` passed.
- `pnpm test` completed with failures outside this metadata change: the released
  schema snapshot compares LF output with a CRLF checked-in file, and CLI startup
  encountered a state-lock failure. The CLI startup test passed in isolation;
  the schema test failed in isolation, with a read-only in-memory comparison
  confirming equality after CRLF normalization. Neither area was modified.
- Standards review: 0 findings. Spec review: 0 findings.

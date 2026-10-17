# 99 — Remove the Legacy local-user Identity

**Type:** task

**Status:** resolved

**What to build:** Use `user` as the canonical human identity throughout Agent
Devteam, including task comments returned through MCP and context supplied to
agents. Eliminate the obsolete `local-user` identity from source code and use
`@user` whenever an agent mentions the human.

## Reported problem

When the human writes a task comment and an agent retrieves it through MCP,
the comment or commenter identity appears to be reported as `local-user`.
Agents then address the human as `@local-user`, perpetuating a recurring bug.
The exact leaking field still needs to be confirmed; distinguish a comment's
unique record ID from its author's identity rather than replacing comment IDs
with `user`.

## Initial evidence

- `src/web/browser-api/actor.ts:3` creates the browser actor with
  `{ kind: "user", id: "local-user" }`.
- `test/runtime/codex-agent-runtime-execution.test.ts:206` explicitly expects
  `"id": "local-user"` in an activation prompt.
- Numerous application, runtime, web, and browser tests and fixtures still
  construct the obsolete identity. A repository-wide search also finds older
  issue and research records documenting the same mismatch.
- The activation instructions already describe `@user`, and
  `src/web/client/TaskCommentComposition.tsx` already offers `@user` as the
  human mention token. Attribution must agree with that public contract.

## Scope and acceptance criteria

- [x] Reproduce the report end to end: write a human task comment through the
  browser path, retrieve it with the actual MCP tool, and inspect its author
  metadata and any resulting activation context.
- [x] Use `user` for the human actor/author ID in new writes, MCP responses,
  task and comment projections, history, and agent activation context. Preserve
  unique comment IDs and agent identities.
- [x] Search the entire source code and supporting tests, fixtures, prompts,
  and current documentation for `local-user`, `@local-user`, and naming variants.
  Remove the obsolete identity and instructions or expectations that perpetuate
  it; do not stop at masking one MCP response field.
- [x] Handle existing persisted comments, actors, and events that contain the
  old identity so reopening an existing project cannot leak it back to agents.
  Choose and document migration or normalization consistent with the repository's
  persistence contracts, preserving record IDs, references, and audit history.
  Any unavoidable legacy literal must be isolated to compatibility handling
  and its regression evidence, with its purpose documented.
- [x] Agent-facing attribution and mention guidance consistently identify the
  human as `user` and direct agents to mention `@user`.
- [x] Verify `@user` still requests human attention correctly, including replies
  to human comments, without changing agent mention routing or human self-mention
  behavior.
- [x] Add regression coverage for browser-authored comments retrieved through
  MCP, activation context carrying human attribution, and legacy stored data.
  Assert that agent-visible identity fields contain `user` and cannot expose
  `local-user` or suggest `@local-user`.

## Related work

- [Issue 37 — Structure Task History by Cause and Attempt](./37-structure-task-history-by-cause-and-attempt.md)
  already calls for keeping persistence identities out of agent context and
  using `@user` for human mentions; this report shows that contract needs
  regression protection across the actual data paths.

## Comments

- 2026-10-16: User reports this as a longstanding recurring bug and requests a
  comprehensive source search and elimination of the obsolete identity.


## Answer

The browser actor wrote the obsolete ID into `task_comments.actor_id`; MCP
history exposed it as `author.id`, and activation source/context serialized that
same attribution. The unique comment ID was never the human identity.

Browser writes now use `{ kind: "user", id: "user" }`. Source and supporting
fixtures/expectations use the canonical spelling, and operating guidance says
human replies use `@user` and distinguishes comment IDs from authors.

Released migration 0013 upgrades human attribution in comments, journal events,
conversation messages/retirement, pending archival ownership, movement metadata,
retained activation snapshots, and cached responses. Canonical caller-scoped
retry aliases preserve pre-upgrade successes. The existing verified backup and
atomic upgrade contract applies. Record IDs, references, agent identities,
authored text, transcripts, event ordering and timestamps survive. Historical
issue/research records remain evidence; executable legacy literals are isolated
to compatibility handling and its regression tests. See
[ADR 0031](../../../docs/adr/0031-canonicalize-human-attribution-in-released-state.md).

Regression evidence:

- The initial `node --experimental-strip-types --test test/mcp/human-attribution.test.ts`
  failed on actual browser HTTP output: expected human ID `user`, received the
  obsolete ID. The completed fresh/legacy cases now pass browser writes through
  actual stdio MCP history/inspection and runtime dispatch, including retained
  activation context and the comment-triggered activation source.
- Migration coverage verifies metadata conversion, retry aliases, unchanged
  source references, authored evidence and agent identities, plus SQLite integrity.
- Agent replies using `@user` request attention; human self-mentions do not.
  Agent mention routing still creates the expected activation.
- Typecheck passes. Focused migration, released-schema/MCP, and runtime checks
  pass. Three browser canonical-mention/reply checks pass.
- Full suite: 418 tests, 411 passed, 6 skipped, one CLI startup lock conflict.
  Rerunning `test/cli/project-allowances.test.ts` alone passed all three tests.
- Standards and spec reviews found no actionable issues. All changes remain
  unstaged; unrelated and concurrent changes were preserved.

# 01 — Reconcile the Activation Prompt Contract

**What to build:** Restore trustworthy prompt-composition verification by aligning fresh and resumed activation guidance with the accepted context-delivery contract, without weakening tests simply to obtain a green run.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Context

The maintenance audit found two reproducible failures introduced together in
commit `64891a3`: tests require an instruction not to inspect a task merely to
confirm context delivery, but the accompanying prompt does not contain it.
Subsequent tickets have repeatedly reported these failures as pre-existing.
The user approved correcting this mismatch and implementing this ticket now.

- [x] Reproduce both failures before editing implementation and record the command/result.
- [x] Preserve the accepted guidance that delivered context is authoritative and complete for its fresh, replacement, or resumed scope; needless delivery-confirmation reads are unnecessary, while genuinely incomplete, obsolete, or contradictory context remains recoverable.
- [x] Align both fresh and new-activation resumed prompt tests with that behavioral contract, retaining other authority, precedence, provenance, and explicit-coordination rules.
- [x] Do not change context filtering, runtime permissions, activation dispatch, or unrelated prompt policy.
- [x] Verify through the existing composed-prompt interface and representative runtime/application context-delivery coverage; no private-state tests or new abstraction is needed.
- [x] Run focused tests and typechecking; participate in final combined non-browser verification and independent Standards/Spec review.
- [x] Record the cause, change, and verification under Answer; leave changes unstaged.

## Delivery coordination

This is one of three independently scoped tickets in the approved audit follow-up.
The coordinating agent owns the final combined test run and two-axis review.

## Answer

Implemented and verified in the combined workspace, including independent
Standards/Spec review. Changes remain unstaged for user review.

Cause: the fresh and distinct resumed-activation prompt assertions required an
explicit prohibition on inspection solely to confirm delivery, but neither
prompt contained it. The implementation now includes that instruction in both
compositions. The full composition also explicitly preserves operating-context
recovery for obsolete context alongside incomplete or contradictory context.
Existing assertions were retained and expanded to protect the full-versus-delta
scope and the recovery exceptions. No dispatch, filtering, permission, or
coordination mechanics changed.

Verification:

- Before implementation, `node --experimental-strip-types --test --test-reporter=spec test/runtime/codex-agent-runtime.test.ts`
  reproduced exactly two failures and four passes, both failures at the missing
  delivery-confirmation instruction.
- Each prompt was repaired in its own red/green slice at the existing public
  `composeActivationPrompt` seam.
- `node --experimental-strip-types --test --test-reporter=spec test/runtime/codex-agent-runtime.test.ts test/runtime/codex-agent-runtime-execution.test.ts test/application/agent-conversation.test.ts`:
  42 passed, zero failed. This includes resumed deltas, replacement contexts,
  source-delivery deduplication, and runtime fallback behavior.
- `pnpm typecheck`: passed.
- `git diff --check`: passed.

## Comments

Final integration on 2026-09-02: `pnpm test` passed with 313 passes, zero
failures, and four skips (317 tests). `pnpm typecheck` and `pnpm build` passed.
Independent Standards and Spec reviews each reported zero outstanding findings.
Browser interaction tests were not rerun because this effort changes no browser
interaction; application, HTTP, MCP, runtime, and CLI coverage ran in the full
non-browser suite. Nothing was staged or committed.

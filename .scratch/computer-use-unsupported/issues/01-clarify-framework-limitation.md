# 01 — Clarify the computer use limitation

**Type:** task

**Status:** resolved

**Blocked by:** None.

## Request

Add one sentence to the shared framework instructions stating that computer use
skills are not supported in this environment.

## Acceptance criteria

- The shared `FRAMEWORK_GUIDANCE` includes: "Computer use skills are not supported in this environment."
- No runtime behavior or other instructions change.

## Comments

Requested for immediate implementation by the user.

## Answer

Added the requested sentence to `FRAMEWORK_GUIDANCE` in
`src/application/activation-prompt.ts`. No other instructions or runtime behavior
changed.

Verification: all six existing prompt/runtime tests in
`test/runtime/codex-agent-runtime.test.ts` passed; `git diff --check` passed.
Reviewed the diff against the request and repository instructions. Changes remain
unstaged for user review.

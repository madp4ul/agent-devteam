# Task 156 Codex continuation and reconnect diagnostics

Type: task
Status: resolved

## Problem
T-0156 implementation conversation c449dc5a-5f06-4cea-9afc-737f6b9920b8,
Codex thread 01a15fb6-828f-7813-aece-2f4ef5a885ff, has 41 rejected recovery
probes after its first failure. Its queued activation blocks independent review.
Every retained rejection reports `Reconnecting... 2/5 (stream disconnected before
completion: websocket closed by server before response.completed)`.

## Acceptance
- Replay the reported stream pattern and preserve Codex's own recovery opportunity.
- Retain diagnostics and distinguish recovered turns from terminal failure/EOF.
- Inspect the ignored computer-use setting independently.
- Validate against a fork without executing the project's queued work.
- Leave source changes unstaged; preserve live task and conversation history.

## Evidence
Initial read-only SQLite/API inspection: first failure at 2026-10-21T18:48:04.582Z,
latest at 19:36:01.118Z, 42 failures, 41 retries. Prior turn completed at 18:47:55Z.
Reported context usage was 190321 / 475000 tokens. No proof of context overflow.

## Comments
Investigation started 2026-10-21. Local sandbox launcher also fails on locked S:
BitLocker volume; diagnostic shell reads run outside that broken launcher.

## Answer

Confirmed root cause: `projectCodexTurn` returned immediately on native
`error` reconnect notices. Returning closes the SDK generator; its `finally`
kills the child process. Every framework retry therefore prevented Codex from
reaching its native HTTPS fallback.

An ephemeral, read-only, no-tools fork of the actual thread, using the framework's
Codex CLI 0.160.0 with user config disabled, emitted reconnect notices 2/5 through
5/5, switched to HTTPS, and completed with `DIAGNOSTIC_OK`. A fresh-session control
completed directly. The original conversation and project coordination were not
mutated by either diagnostic. No context corruption or overflow was established.

Fix: retain recognized native reconnect notices as diagnostics and continue the
same iterator. Other errors, `turn.failed`, missing completion and cancellation
retain existing failure behavior. No thread replacement, scheduler policy,
conversation retirement, migration or retry-budget change is required.

### Verification

Before fix:
`node --experimental-strip-types --test --test-name-pattern='reconnect diagnostics' test/runtime/codex-turn-projector.test.ts`
failed: expected `completed`, received `failed`.

After fix:
- `pnpm typecheck` passed.
- `node --experimental-strip-types --test --test-reporter=spec 'test/runtime/*.test.ts'`
  passed: 78 passed, 0 failed, 1 skipped.
- Captured actual native stream replays to completion through the fixed projector.
- Runtime regression verifies same-thread continuation, retained diagnostics and
  usage, and MCP scope release only after recovery completes.
- Terminal failure and EOF regressions remain red-capable.

### Separate configuration warning

The user's config ended with an empty table:
`[computer_use.windows.always_allowed_app_ids]`.
Native CLI 0.160.0 strict loading rejected the field before a turn began.
Current official configuration docs describe this name as an array of strings,
not a table: https://learn.chatgpt.com/docs/config-file/config-reference .
This does not establish compatibility with the older framework binary.
Removed only the empty trailing table after backing up the original to
`C:/Users/Paul/.codex/config.toml.before-reconnect-fix-20261021.bak`.
Strict loading and a fresh no-tools diagnostic then completed successfully.
No configured app approvals existed in the removed empty table.

### Rollout

The live framework at http://127.0.0.1:3000 was paused throughout investigation.
It must be restarted using the existing `idle-games/start-agent-devteam.bat`
launcher to load the changed TypeScript module, then resumed through its normal
browser control. Existing recovery episode and queued review remain intact.
No staging, commits or pushes were performed. The independent locked-S: sandbox
launcher failure observed in this chat is outside this fix.

### Prevention

Native JSONL `error` does not always mean terminal failure. Retain the captured
native fallback fixture alongside adapter contract tests; fake streams that only
model immediate failure cannot detect this compatibility trap.

## Independent review and delivery cleanup

Reviewed the working-tree change against baseline
`6c928b12c58b5f631acbfa560ebcb99f23bb6c95` with two independent reviewers.

### Standards

No findings. The production change stays within the Codex adapter's existing
responsibility and recognizes the observed reconnect envelope narrowly.
Architecture and ADR updates satisfy the repository documentation requirements.
The regression scenarios cover distinct seams without unnecessary abstraction.

### Spec

No findings. Native recovery remains inside the same streamed turn; diagnostics,
terminal errors and incomplete-stream behavior are preserved. The captured trace
and runtime regression cover native fallback, thread continuity, usage and cleanup.
Configuration cleanup is separately documented; no scheduler or retirement change
was introduced. Live-host restart remains a separate rollout step.

### Cleanup

Removed temporary strict-config output, native fork/control captures, stderr logs,
and runtime-test output from the working tree. Retained only this issue, the
sanitized native JSONL regression fixture, production/test changes and architecture
notes. The user-config backup remains outside the repository for recovery.
Full-suite output is written outside the repository to the operating-system temp
folder. Changes remain unstaged; committing remains the user's next action.

### Final verification

`pnpm test` completed successfully: 436 tests total, 430 passed, 6 skipped,
0 failed (approximately 139 seconds). The final change also passed
`pnpm typecheck` and `git diff --check`. Both independent review axes reported
zero findings. Ready for user review and commit; Git staging is unchanged.

# 71 — Isolate Token Usage for User Follow-Ups

**What to build:** User follow-up attempts that resume an existing Codex thread
show only the attempt delta from the preceding trustworthy usage snapshot, not
the thread's cumulative usage.

**Blocked by:** None

**Status:** resolved

- [ ] Use the same resolved resume-thread identity for runtime dispatch and
  token-usage isolation.
- [ ] Pass that identity to both completed and interrupted attempt persistence
  paths.
- [ ] For a user follow-up created as a separate activation, subtract the
  immediately preceding trustworthy reported snapshot for the resumed thread
  from the new cumulative `turn.completed` snapshot.
- [ ] Continue displaying `Input` as delta input minus delta cached-input reads
  and `Output` as delta output.
- [ ] Omit isolated usage when the preceding baseline is unavailable, belongs
  to a different thread, or produces any invalid negative delta. Never present
  a cumulative resumed-thread snapshot as standalone attempt usage.
- [ ] Fresh threads and runtime replacement threads continue to use their
  reported usage without subtraction.
- [ ] Preserve existing retry, permission-continuation, and interruption
  continuation isolation semantics.
- [ ] Add an application regression test for separate user-follow-up
  activations resuming the same thread, covering both completion and
  interruption.
- [ ] Add browser regression coverage proving the compact transcript values
  use the isolated delta rather than the cumulative snapshot.

## Reproduction

1. Complete an agent attempt that reports token usage.
2. Continue its conversation through a user follow-up.
3. Let Codex resume the same thread and report a cumulative usage snapshot.
4. Open the follow-up attempt's transcript.
5. Observe that the displayed values include usage from the preceding attempt.

## Observed Example

A short follow-up completed in approximately 17.2 seconds but displayed
202,503 input and 13,704 output tokens. The expected attempt delta was 92,326
input and 533 output tokens. The displayed snapshot included 110,177 input and
13,171 output tokens from the preceding attempt.

## Root Cause

The coordinator resolves dispatch identity as:

```ts
const resumeThreadId = precedingAttempt?.threadId ?? runnable.resumeThreadId;
```

and correctly passes `resumeThreadId` to the runtime. On completion and
interruption, however, it currently passes only:

```ts
precedingAttempt?.threadId ?? undefined
```

A user follow-up creates a new activation, so it has no preceding attempt even
though its conversation supplies an existing thread through
`runnable.resumeThreadId`. Usage isolation therefore receives no resumed-thread
identity and persists the cumulative snapshot as standalone attempt usage.

Relevant implementation areas are
`src/application/internal/automation-coordinator.ts`,
`src/application/internal/automation-state-store.ts`, and the compact usage
projection rendered by `src/web/client/AgentConversationDialog.tsx`.

## Comments

- The supplied diagnosis was checked against the current implementation and
  matches the coordinator and isolation paths. The proposed correction is to
  pass the already resolved `resumeThreadId` to `completeAttempt` and
  `interruptAttempt`; tests should assert externally visible semantics rather
  than the private argument alone.

## Answer

Closed without implementation. The subsequent agent-conversation presentation
work removes token usage from individual runs and temporarily removes the
combined conversation token display as well. The incorrect per-follow-up value
therefore no longer has a user-facing surface to correct, and implementing or
testing that obsolete presentation would conflict with the replacement design.

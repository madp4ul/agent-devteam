# 96 — Recover Resumed Codex Threads from Lazy Stream Failures

**Type:** task

**What to build:** Make one best-effort replacement thread recover a resumed
Codex run whose unusable-thread failure appears when the SDK's lazy event
generator first executes, while preserving cancellation, attempt evidence,
single-replacement, and thread-continuity guarantees.

**Blocked by:** 94 — Project Codex Events into Attempt Evidence.

**Status:** resolved

## Decision source

Issue 90's [research note](../research/90-codex-sdk-runtime-evidence.md) found
that `@openai/codex-sdk` 0.146.0 `runStreamed()` initially returns a lazy async
generator. CLI spawn, resume, JSON decoding, nonzero exit, and cleanup failures
usually surface during iteration rather than from the initial
`runStreamed()` promise. The current replacement catch around that promise is
therefore not sufficient evidence that a persisted unusable thread will be
replaced.

This ticket is an observable correctness change and must remain separate from
issue 94's behavior-preserving extraction.

## Recovery contract

- [ ] Add a pinned-SDK-style characterization whose resumed `runStreamed()`
  resolves successfully but whose async event generator throws before yielding
  `thread.started`. Prove the current behavior before changing it.
- [ ] When a requested resume fails before any thread identity is established,
  start exactly one fresh replacement thread, recompose the request with
  `attempt.thread: "replaced"`, and send the honest full replacement context.
- [ ] Apply the same one-replacement policy whether the pre-identity resume
  failure is thrown eagerly by `resumeThread`/`runStreamed` or lazily during
  first stream iteration.
- [ ] Never enter a replacement loop. If the fresh replacement fails before
  identity, preserve the runtime's actionable thrown startup failure; if it
  fails after identity, return the normal inspectable failed outcome with that
  replacement thread ID.
- [ ] Once any thread identity has been established, do not start another
  thread for a later stream error. Preserve the transcript diagnostic and
  failed outcome for the identified thread.
- [ ] Do not treat a deliberate `AbortSignal` cancellation or user
  interruption as proof that a resumed thread is unusable, and do not launch a
  replacement after cancellation.
- [ ] Do not replay a stream after observable attempt evidence or coordination
  side effects. The supported replacement gate is the pre-identity failed
  resume path; malformed ordering or evidence before identity must fail safely
  rather than risk duplicate work.
- [ ] Call `lifecycle.started` exactly once for the effective thread. Do not
  publish the unavailable resume ID as a started thread.
- [ ] Return `threadContinuity: "replaced"` for every terminal outcome produced
  by the replacement thread and preserve the replacement thread ID whenever it
  was observed.
- [ ] Keep MCP acquisition and release attempt-scoped: one attached server,
  exactly one final release, and no leaked resource across the internal
  replacement.
- [ ] Keep activation identity, attempt identity, persistence, retry policy,
  usage baselines, and application recovery rules unchanged.

## Verification

- [ ] Cover eager resume construction failure, eager resumed `runStreamed`
  rejection, lazy pre-identity iterator failure, lazy failure after
  `thread.started`, replacement pre-identity failure, replacement post-identity
  failure, cancellation, and successful replacement completion.
- [ ] Assert replacement prompt composition restores self-authored and other
  context omitted only because the unavailable resumed thread was expected to
  retain it.
- [ ] Assert no duplicate transcript rows, lifecycle callbacks, coordination
  calls, or MCP releases across the failed resume and replacement.
- [ ] Keep existing attempt-recovery, restart-recovery, conversation
  continuity, prompt-composition, and real Codex integration coverage green.
- [ ] Run TypeScript typechecking, focused runtime/application tests, and the
  full Node test suite. Use a paid or live Codex probe only if pinned source and
  deterministic lazy-generator fixtures cannot establish the behavior.

## Stopping condition

Do not broaden this into general retry of streamed turns. If the runtime cannot
distinguish pre-identity unusable-resume failure from cancellation or from a
stream that may already have caused work, fail safely with retained evidence
and leave recovery to the existing explicit application workflow.

## Answer

Implemented one best-effort replacement gate around resumed Codex startup and
whole-stream projection. Synchronous resume construction failures, eager
`runStreamed()` rejections, and lazy iterator failures before the first emitted
event now recompose the attempt as `thread: "replaced"` and start exactly one
fresh thread with the complete honest context. Any emitted event closes the
lazy replay gate, established thread identity keeps later failures inspectable
on that thread, and a replacement cannot recursively replace itself.

Cancellation now suppresses replacement across construction, eager startup,
and lazy iteration. The attempt-scoped MCP configuration remains attached once
and released once by the existing outer lifecycle, while replacement outcomes
retain `threadContinuity: "replaced"`, the effective thread ID, one lifecycle
notification, and attempt-local transcript evidence.

Focused runtime coverage passes 25 tests, including eager and lazy recovery,
cancellation, evidence-before-identity, both replacement failure positions,
post-identity resumed failure, prompt restoration, lifecycle, transcript, and
release invariants. TypeScript typechecking passes. The full Node suite reports
285 passing tests and 4 expected skips; its 2 failures are the pre-existing
activation-prompt assertions already documented by issues 94 and 95 and are
outside this ticket's files and behavior. `docs/architecture.md` remains
accurate because the implementation preserves its existing replacement-thread
authority and continuity description.

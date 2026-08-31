# 94 — Project Codex Events into Attempt Evidence

**Type:** task

**What to build:** Keep `CodexAgentRuntime` as the application's single runtime
and transcript adapter while moving the complete SDK stream state machine into
one internal whole-stream projector that turns one attempt's Codex events into
live transcript, usage, and terminal facts.

**Blocked by:** 90 — Evaluate the Codex Runtime Event Seam.

**Status:** resolved

## Decision source

Implement the event-projector recommendation from
[issue 90](./90-evaluate-codex-runtime-event-seam.md) and its cited
[research note](../research/90-codex-sdk-runtime-evidence.md). The supported
source boundary is the lockfile's `@openai/codex-sdk` 0.146.0 and bundled
`@openai/codex` 0.146.0, matching OpenAI tag `rust-v0.146.0` at commit
`be449751...`.

This is a behavior-preserving refactor. Do not combine it with correcting the
lazy-stream replacement behavior identified by issue 90; that belongs to issue
96 after this projector owns event consumption.

## Module boundary

- [ ] Add one internal stateful module whose small interface consumes an
  `AsyncIterable<ThreadEvent>` plus immutable attempt/task scope, publishes
  defensive live transcript snapshots, and returns the observed thread ID,
  decoded cumulative usage when available, and one terminal result.
- [ ] Use the SDK-exported `ThreadEvent` and `ThreadItem` unions at the pinned
  boundary instead of maintaining a second permissive event union beside
  `CodexAgentRuntime`.
- [ ] Own all mutable state for exactly one attempted turn inside the projector:
  thread identity, ordered transcript rows and stable-ID replacement index,
  latest completed agent message, completed-turn marker, cumulative usage,
  unresolved required coordination failures, and permission-block summary.
- [ ] Keep client and sandbox configuration, environment filtering, Git trust,
  attachment input, MCP attachment and release, thread start/resume/replacement,
  signal forwarding, lifecycle wiring, attempt-keyed evidence storage, and
  `threadContinuity: "replaced"` provenance in `CodexAgentRuntime`.
- [ ] Keep application persistence, retry decisions, usage baseline subtraction,
  cost, and conversation projections outside the runtime and projector.
- [ ] Do not add a public projector contract, general observer framework,
  version-dialect adapter, event bus, or multiple transcript interpretation
  paths.

The illustrative internal interface is:

```ts
async function projectCodexTurn(
  events: AsyncIterable<ThreadEvent>,
  scope: Readonly<{ attemptId: string; taskId: string }>,
  ports: Readonly<{
    started(threadId: string): void;
    publish(transcript: readonly AttemptTranscriptItem[]): void;
  }>,
): Promise<{
  threadId?: string;
  transcript: readonly AttemptTranscriptItem[];
  usage?: AttemptTokenUsage;
  terminal:
    | { kind: "completed"; summary: string }
    | { kind: "permission-blocked"; summary: string }
    | { kind: "failed"; summary: string };
}>;
```

Exact names may follow nearby conventions, but do not enlarge the interface or
leak the projector's mutable state.

## Evidence and terminal invariants

- [ ] `thread.started` establishes identity and notifies the lifecycle before
  later live evidence is published. Treat a conflicting second thread ID as an
  unsupported stream rather than silently replacing provenance.
- [ ] Preserve first-seen transcript order. `item.started`, `item.updated`, and
  `item.completed` carrying the same ID replace one row in place; do not assume
  item identity is stable across separate CLI invocations or attempts.
- [ ] Preserve exact useful raw evidence for generic commands, MCP calls, and
  other tool items, including arguments, result, error, status, and bounded
  output.
- [ ] Continue to call the existing `coordinationTranscriptItem` for known
  coordination calls. It remains the sole owner of typed coordination status,
  presentation, and diagnostic semantics.
- [ ] Preserve required coordination failure tracking and its current supported
  clearing rule. Any unresolved required coordination failure outranks a
  permission block and ordinary completion.
- [ ] Preserve permission-block reporting, including the authored trimmed
  summary and current fallback summary.
- [ ] Make a completed agent message visible before the turn finishes and use
  the latest completed agent message as the successful outcome summary.
- [ ] Preserve normal-exhaustion precedence exactly: missing thread identity;
  missing `turn.completed` with diagnostic; unresolved required coordination
  failure with diagnostic; permission block; otherwise completion.
- [ ] Preserve explicit `turn.failed` and top-level `error` outcomes. For this
  ticket, an iterator exception after thread identity remains an inspectable
  failure, while an exception before identity retains the current thrown
  behavior. Issue 96 owns any replacement-policy change.
- [ ] Decode usage only when all five SDK counters are non-negative safe
  integers. Store the values as the raw cumulative thread snapshot; do not
  synthesize zero or calculate an attempt delta here.
- [ ] Add runtime guards for known top-level event envelopes because SDK 0.146.0
  casts parsed JSON without runtime validation. Unknown or malformed terminally
  relevant events must fail safely with a bounded diagnostic rather than be
  silently ignored or dump sensitive payloads.
- [ ] Create fresh projector state per attempt so resumed attempts sharing one
  Codex thread cannot share transcript or terminal state.
- [ ] Keep MCP release runtime-owned and exactly once through success, failure,
  thrown stream iteration, and existing replacement paths.

## Verification and migration

- [ ] Move, rather than duplicate, the current event-trace assertions behind
  the projector interface. Cover all eight supported event variants and all
  eight supported item variants, stable live replacement, raw generic MCP
  evidence, typed coordination presentation, live messages, both declared
  failure events, iterator throw, incomplete stream, malformed usage, unknown
  envelopes, terminal precedence, and attempt isolation.
- [ ] Include an explicit combined trace proving that a surviving required
  coordination failure outranks a completed permission report and
  `turn.completed`.
- [ ] Retain thin `CodexAgentRuntime` tests for configuration and exact Git
  trust, input and attachments, MCP setup/release, start/resume, existing eager
  replacement behavior, replacement prompt/provenance, signal forwarding,
  lifecycle notification, and handoff into `AttemptTranscriptAccess`.
- [ ] Keep `coordination-transcript-projection.test.ts` as the exhaustive test
  seam for typed coordination semantics; do not reproduce its matrix in the
  projector suite.
- [ ] Run TypeScript typechecking, focused runtime tests, and the full Node test
  suite. Inspect `docs/architecture.md`; update it only if an authoritative
  flow, state owner, runtime integration, or startup invariant changed.

## Stopping condition

Stop and retain the cohesive implementation if the projector cannot own the
whole event state machine and final precedence, if equivalent event traces must
remain duplicated at runtime and projector seams, or if the projector requires
thread construction, filesystem layout, MCP release, or application
persistence. Do not keep a pass-through module merely to shorten the runtime
file.

## Answer

Implemented one internal attempt-local whole-stream projector in
`src/runtime/codex-turn-projector.ts`. It consumes the SDK-exported
`ThreadEvent` and `ThreadItem` boundary, guards runtime event envelopes,
publishes defensive live transcript snapshots, replaces stable item rows in
first-seen order, retains generic and typed coordination evidence, decodes only
complete safe cumulative usage, and owns required-tool, permission-block, and
terminal precedence through one result.

`CodexAgentRuntime` remains the sole external adapter and still owns Codex
configuration, input and attachments, start/resume/eager replacement, signal
forwarding, MCP release, context-window evidence, attempt-keyed storage, and
thread-replacement provenance. Existing transcript event traces now exercise
the projector seam; focused projector/runtime verification passes 37 tests and
TypeScript typechecking passes. The full Node run completed with 266 passing,
3 credentialed skips, and 2 pre-existing activation-prompt assertion failures
outside this ticket's files and behavior.

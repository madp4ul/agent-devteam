# 90 — Evaluate the Codex Runtime Event Seam

**Type:** research

**What to decide:** Determine whether Codex client configuration and thread
lifecycle, streamed-event interpretation, live transcript state, terminal
outcome derivation, token-usage decoding, and local rollout context-window
measurement should remain one deep runtime module or be separated behind a
small event-projection or evidence interface that makes SDK changes safer for
the project's AI maintainer.

**Blocked by:** None — can start immediately.

**Status:** resolved

## Maintainer decision

The agent doing this research is the intended long-term maintainer and likely
implementer. Optimize for bounded SDK-upgrade work, exhaustive event handling,
live evidence correctness, and easy diagnosis of thread replacement and
failure behavior. Do not extract helpers merely to shorten the runtime file.
A well-evidenced recommendation to retain the current cohesive adapter is valid.

## Investigation

- Map the current reasons the Codex runtime changes: client and sandbox
  configuration, MCP attachment and release, thread start/resume/replacement,
  streamed event handling, transcript normalization, required coordination
  failures, permission blocks, usage, terminal outcomes, and rollout-file
  context evidence.
- Distinguish SDK transport facts from application-owned attempt facts and from
  coordination-tool semantic projection that is already localized elsewhere.
  Do not create a competing transcript interpretation path.
- Compare at least: retain the current module, introduce one stateful streamed-
  event projector used internally by the runtime, and separate local session
  evidence access while leaving event handling in the runtime.
- Evaluate whether a proposed interface can consume representative SDK events
  and return observable transcript/usage/outcome facts without knowing thread
  construction, filesystem layout, MCP server lifecycle, or application
  persistence.
- Preserve stable live-item replacement, raw generic-tool evidence, typed
  coordination presentation, required-tool failure precedence, permission-block
  reporting, incomplete-stream failure, attempt isolation, and thread-
  replacement provenance.
- Verify current SDK event and session-record assumptions against first-party
  documentation or source and record the exact supported version boundary.
- Use a repository-shaped prototype only when the competing interfaces cannot
  be compared honestly from current implementation and tests. Do not perform a
  production extraction in this ticket.

## Expected result

Write a cited research note under the effort's `research/` directory and append
the answer here. Recommend one concrete direction, including “keep the current
adapter,” and explain how it improves or preserves maintainer locality. Include
the proposed interface, ownership of mutable stream state, test seam, migration
shape, rejected alternatives, SDK-version risks, and a no-change condition. If
implementation is justified, propose fresh-context follow-up tickets.

## Acceptance criteria

- [x] Repository responsibilities and current test seams are mapped before any
  recommendation is made.
- [x] Claims about Codex SDK events, thread behavior, and local session evidence
  cite first-party documentation or source.
- [x] Alternatives are compared on depth, locality, interface size, live-state
  correctness, SDK upgrade blast radius, and test setup.
- [x] The recommendation does not duplicate the existing typed coordination-
  transcript projection or move application persistence into the runtime.
- [x] All terminal-outcome precedence and thread-continuity invariants have an
  explicit preservation and verification strategy.
- [x] The result gives a clear no-change stopping condition and proposes only
  independently green, fresh-context implementation work when justified.

## Answer

Keep `CodexAgentRuntime` as the application's single external runtime and
transcript adapter, but introduce one internal stateful whole-stream projector
where the SDK's `AsyncIterable<ThreadEvent>` becomes attempt-owned transcript,
usage, and terminal facts. Separately isolate the private local rollout reader
behind a one-method context-evidence interface. The full repository map,
candidate comparison, interface sketch, preservation matrix, migration shape,
version audit, and primary-source citations are in
[Codex Runtime Event Seam](../research/90-codex-sdk-runtime-evidence.md).

The projector is justified by behavior, not by the runtime file's size. It
owns one deep attempt-local state machine for stable live row replacement, raw
generic-tool evidence, usage decoding, required coordination failures,
permission blocks, incomplete streams, and terminal precedence. It must call
the existing `coordinationTranscriptItem` for typed coordination presentation,
so the project retains one semantic path. Client/sandbox configuration, input,
MCP lifetime, thread start/resume/replacement, attempt-keyed storage, lifecycle
notification, and `threadContinuity: "replaced"` provenance remain in the
runtime. Persistence, retry, cost deltas, and conversation projections remain
application-owned.

The supported source boundary is exact: the lockfile resolves
`@openai/codex-sdk` 0.146.0 and its bundled `@openai/codex` 0.146.0, matching
OpenAI tag `rust-v0.146.0` at commit `be449751...`. At that boundary the SDK
exports closed eight-variant event and item unions, but runtime JSON is only
cast rather than validated; item IDs support stable replacement within one CLI
invocation; `turn.completed.usage` is a cumulative thread snapshot; and local
`token_count` rollout records are private, fail-optional evidence rather than
a supported SDK contract. Every lockfile upgrade must re-audit those facts.

No prototype is needed because 34 focused runtime tests already use literal
async event streams and divide cleanly between construction, transcript
evidence, and coordination presentation. Implementation should move event
traces to the projector interface rather than layer duplicate tests, retaining
thin runtime tests for configuration, start/resume/replacement, MCP release,
input, lifecycle wiring, and evidence handoff.

Create fresh-context follow-ups for: (1) projecting Codex events into attempt
evidence without changing the external runtime contract; (2) isolating local
session evidence while preserving backward scanning, cached discovery,
percentage calculation, and fail-optional behavior; and (3) separately
aligning replacement behavior with the SDK's lazy async generator. The source
audit found that real spawn/resume/JSON failures usually surface during event
iteration, while the current replacement catch surrounds only the initial
`runStreamed()` promise; that possible behavior correction must not be hidden
inside a refactor.

Stop and retain the cohesive implementation if the projector cannot own the
whole event state machine and final precedence, duplicates runtime event tests,
or needs thread construction, filesystem paths, MCP release, or persistence.
Do not add a multicast observer or version-dialect adapter until a real second
consumer or SDK dialect exists.

# Codex runtime event seam

Research date: 2026-08-30  
Repository runtime: `@openai/codex-sdk` 0.146.0 / bundled `@openai/codex` 0.146.0  
Matching OpenAI source: tag `rust-v0.146.0`, commit
[`be449751a978f02e5bbba886999662956c7f38f5`](https://github.com/openai/codex/tree/be449751a978f02e5bbba886999662956c7f38f5)

## Recommendation

Keep `CodexAgentRuntime` as the application's single external runtime and
transcript adapter, but introduce one **internal, stateful whole-stream
projector** at the seam where `AsyncIterable<ThreadEvent>` becomes
application-owned attempt evidence. Separately isolate the private local
rollout reader behind a one-method evidence interface. Do not expose either
internal seam to the application, move persistence into the runtime, or create
another coordination-transcript interpretation path.

This is not a file-length refactor. The projector earns its seam by owning, as
one deep module, the coupled state machine for stable live-item replacement,
raw generic-tool evidence, delegation to the existing typed coordination
projection, required-tool failure tracking, permission blocks, usage decoding,
incomplete streams, and terminal precedence. `CodexAgentRuntime` retains client
and sandbox configuration, MCP attachment and release, prompt/input creation,
thread start/resume/replacement, lifecycle notification, attempt-keyed evidence
storage, and `threadContinuity: "replaced"` provenance.

The local rollout reader changes for a different reason than the event
projector: its filesystem layout and JSONL schema are private, version-sensitive
Codex evidence that can change independently of the public TypeScript event
union. Its absence must remain non-authoritative for execution.

The exact evidence boundary is the repository's lockfile resolution,
**`@openai/codex-sdk` 0.146.0 with bundled `@openai/codex` 0.146.0**, matched to
OpenAI commit `be449751...`. The public OpenAI SDK page describes lifecycle
intent but does not version or fully specify the JSON event protocol or local
rollout schema. Later lockfile resolutions require a fresh source and fixture
audit. See the [official Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk).

No repository-shaped prototype is needed. The implementation and 34 focused
runtime tests already exercise the competing seam honestly with literal async
event streams; the missing step is to move those observable traces behind the
small interface rather than duplicate them.

## Repository responsibility and test map

`src/runtime/codex-agent-runtime.ts` currently combines these reasons to
change:

| Responsibility | Current owner | Why it changes |
| --- | --- | --- |
| Client configuration | `CodexAgentRuntime.run` | approval review, Git trust, attachment writable roots, required coordination MCP configuration, inherited environment |
| Thread lifecycle | `CodexAgentRuntime.run` | start, resume, replacement fallback, signal forwarding, lifecycle callback, replacement provenance |
| Stream interpretation | the `for await` loop in `CodexAgentRuntime.run` | SDK event variants, ordering, top-level failures, incomplete streams |
| Live transcript state | runtime maps plus `toolTranscriptItem` / `upsertToolTranscriptItem` | item schemas, stable IDs, raw output, live replacement, attempt isolation |
| Coordination semantics | `coordination-tool-transcript.ts` | the project's typed tool set, authoritative acceptance, rejection and presentation rules |
| Terminal attempt facts | the event loop and post-loop precedence chain | required-tool failures, permission block, last agent response, SDK failure and completion |
| Token usage | `tokenUsageFrom` and runtime usage map | SDK usage fields and cumulative-snapshot interpretation |
| Context-window evidence | recursive session discovery and backward JSONL scan in the runtime file | private rollout layout/schema and Codex's display calculation |
| Application persistence | automation/application modules, not the runtime | durable attempt, conversation, cost, and projection rules |

The separation already visible in tests is stronger evidence than the 604-line
runtime file itself:

- `codex-agent-runtime-execution.test.ts` covers configuration, input,
  start/resume/replacement, failures, permission blocks, incomplete streams,
  usage, and rollout context evidence.
- `codex-transcript-adapter.test.ts` covers raw and typed transcript evidence,
  live replacement, message visibility, and attempt isolation.
- `coordination-transcript-projection.test.ts` exhaustively covers the existing
  typed coordination projection. That module remains the sole owner of those
  semantics.
- Application tests own retry, conversation continuity, persistence, cost, and
  user recovery. They should continue to observe only `AgentRuntime` and
  `AttemptTranscriptAccess`.

The file's history also shows distinct causes rather than one cohesive change
axis: more than twenty changes added or revised thread recovery, permission
policy, Git trust, live transcript behavior, coordination presentation, usage,
attachments, and rollout context measurement. A projector concentrates the
repeated event/evidence work without fragmenting construction or application
authority.

### Ownership after the change

```text
CodexAgentRuntime
  client/config/input/MCP/thread lifecycle/replacement provenance
        |
        v
CodexTurnProjector (attempt-local mutable stream state)
  SDK event validation and exhaustive dispatch
  live transcript + usage + terminal attempt facts
        |
        +--> existing coordinationTranscriptItem (sole typed semantic path)
        |
        +--> CodexSessionEvidenceReader after confirmed completion

Application/automation
  attempt persistence, retries, cost deltas, conversation projections
```

The projector must not know thread construction, filesystem layout, MCP server
lifecycle, or application persistence. The session reader must not know stream
events or terminal outcomes.

## Candidate comparison

| Candidate | Depth and locality | Live-state and outcome safety | SDK upgrade blast radius | Test setup | Decision |
| --- | --- | --- | --- | --- | --- |
| Retain the cohesive runtime | Externally deep and simplest for its one production caller; all Codex behavior stays in one file. Internally, unrelated client, event, and private-rollout changes remain interleaved. | Current behavior is well covered, but terminal and transcript traces require fake client/thread construction. | One file, but event/item/usage and rollout changes touch separate helper clusters and broad runtime tests. | Fake `CodexClientLike`, thread, streamed result, request, MCP adapter, and sometimes filesystem. | Reject as the long-term internal shape; retain the external interface. |
| Stateful whole-stream projector | One entry point hides a substantial attempt-local state machine. Construction and replacement provenance remain together in the runtime. | Best fit: one owner finalizes transcript, usage, required failures, permission, and terminal precedence; coordination semantics are delegated, not copied. | Event and item changes land in one exhaustive projector and fixture suite; runtime changes only if construction semantics change. | Literal `AsyncIterable<ThreadEvent>` plus scope and callbacks; no client, filesystem, MCP lifecycle, or persistence. | **Choose.** |
| Extract only local session evidence | A genuinely deep one-method local-I/O module hides discovery, caching, JSONL scanning, decoding, and percentage math. | Safely isolates fail-optional context measurement, but leaves the larger event/outcome change cluster untouched. | Rollout changes are bounded; public event upgrades are not. | Temporary session tree at the reader interface. | Also justified, but as a separate small follow-up, not the answer to event safety by itself. |
| Canonical multicast evidence feed | Can hide decoding and produce immutable revisions for many consumers. | Strong single interpretation, but revisioning, fan-out, runtime codecs, and backpressure rules add new failure modes. | Potentially good for multiple transports or consumers. | Simple event streams, but a larger interface and more machinery. | Reject until a second evidence consumer or SDK dialect exists. |

The chosen seam is internal and in-process, so the “two adapters make a real
seam” rule does not require inventing a production/test port. Its leverage is
that both the runtime and direct contract tests consume the same whole-stream
behavior while callers retain the stable external runtime interface.

## Proposed internal interfaces

The illustrative shape is deliberately small; exact names may change during
implementation:

```ts
type CodexTurnScope = Readonly<{
  attemptId: string;
  taskId: string;
}>;

type CodexTurnPorts = Readonly<{
  started(threadId: string): void;
  publish(transcript: readonly AttemptTranscriptItem[]): void;
}>;

type ProjectedCodexTurn = Readonly<{
  threadId?: string;
  transcript: readonly AttemptTranscriptItem[];
  usage?: AttemptTokenUsage;
  terminal:
    | { kind: "completed"; summary: string }
    | { kind: "permission-blocked"; summary: string }
    | { kind: "failed"; summary: string };
}>;

async function projectCodexTurn(
  events: AsyncIterable<ThreadEvent>,
  scope: CodexTurnScope,
  ports: CodexTurnPorts,
): Promise<ProjectedCodexTurn>;

interface CodexSessionEvidenceReader {
  readLatestContextWindowUsage(
    threadId: string,
  ): Promise<AttemptContextWindowUsage | null>;
}
```

The projector owns all mutable stream state for exactly one attempt: thread ID,
ordered transcript rows and ID-to-index mapping, latest completed agent
message, completed-turn marker, decoded usage, unresolved required coordination
failures, and permission-block summary. Every published transcript is a
defensive snapshot. Attempt-keyed maps remain in `CodexAgentRuntime`, so two
attempts that resume one Codex thread cannot share projector state.

Use the SDK-exported `ThreadEvent` and `ThreadItem` unions at the pinned boundary
instead of maintaining a second permissive event union beside the runtime.
Because SDK 0.146.0 merely casts parsed JSON to `ThreadEvent`, add runtime guards
for known envelopes and an explicit unsupported-event diagnostic; compile-time
exhaustiveness alone is insufficient. Unknown item kinds may still become
generic raw tool evidence when enough fields are present, but an unknown
top-level event must not silently yield a successful attempt.

`threadContinuity: "replaced"` is intentionally absent from the projector. It
is an application-owned fact learned while the runtime chooses start versus
resume and decorates the projected result. Likewise, the projector captures
the SDK's raw cumulative usage snapshot; cost delta calculation remains in the
application.

## Preservation invariants and verification

The implementation must freeze the following behavior at the projector
interface and retain thin runtime integration coverage:

1. `thread.started` establishes identity and calls `started` before later live
   evidence is published. A conflicting second thread ID fails safely.
2. `item.started`, `item.updated`, and `item.completed` with the same ID replace
   one row at its first-seen position. ID stability is assumed only within the
   one pinned streamed invocation.
3. Generic MCP evidence retains raw server, tool, status, arguments, result,
   and error. Known coordination calls invoke `coordinationTranscriptItem` and
   retain both its typed presentation and raw evidence.
4. Required coordination failures remain tracked until the current supported
   success rule clears them. Any surviving required failure outranks a
   permission block and ordinary completion.
5. A completed permission report retains the authored trimmed summary and
   becomes `permission-blocked` only after successful turn completion and only
   when no required coordination failure survives.
6. A completed agent message is visible live before `turn.completed`; the last
   completed agent message is the successful summary.
7. On normal stream exhaustion, preserve exact precedence: missing thread
   identity; missing `turn.completed` plus diagnostic; surviving required tool
   failure plus diagnostic; permission block; otherwise completion.
8. `turn.failed` and top-level `error` remain explicit failed outcomes. An
   iterator exception after thread identity remains inspectable failed evidence;
   pre-identity iterator behavior must be characterized together with the
   replacement policy before it changes.
9. Usage is present only when all five counters decode as non-negative safe
   integers. Preserve the cumulative snapshot; never synthesize a zero or
   perform attempt delta calculation in the projector.
10. Context evidence is read only after confirmed completion. Missing,
    malformed, unreadable, late, or version-changed rollout evidence returns
    `null` and never changes the run outcome.
11. Every attempt creates fresh projector state. Runtime storage continues to
    key transcript, usage, and context evidence by attempt ID.
12. MCP release remains runtime-owned and executes exactly once in `finally`
    for success, replacement, failure, and thrown startup/iteration paths.

Move the existing event-trace assertions to projector-interface tests rather
than layering duplicate tests. Retain runtime-level tests only for client and
config construction, input/attachments, MCP acquire/release, start/resume,
replacement prompt/provenance, signal forwarding, lifecycle wiring, and the
handoff of projected evidence into the existing read interfaces. Keep the
existing coordination projection tests unchanged. The interface is the new
test surface; private reducers/codecs are not additional seams.

## Migration shape and fresh-context follow-ups

Do not perform the production extraction in this research ticket. Split it
into these independently green follow-ups:

1. **Project Codex events into attempt evidence.** Add the internal whole-stream
   projector, move the current event loop and terminal finalizer as one slice,
   drive it with all eight supported event variants and all eight item variants,
   and replace overlapping runtime event tests. Keep the external runtime and
   application contracts unchanged.
2. **Isolate local Codex session evidence.** Move recursive discovery, cached
   thread-to-file lookup, backward JSONL scanning, `token_count` decoding, and
   the 12,000-token-baseline percentage calculation behind
   `CodexSessionEvidenceReader`; preserve temporary-directory tests and
   fail-optional behavior.
3. **Align thread replacement with lazy SDK streams.** Characterize a real
   0.146.0-style async generator whose spawn/resume failure occurs on first
   iteration. Decide and specify when a pre-identity resume failure starts one
   replacement thread, then change replacement behavior and provenance in its
   own correctness ticket. The current `runStreamed()`-promise catch must not be
   assumed to cover this path.

Each follow-up leaves the suite green and unstaged for user review. The first
two are behavior-preserving refactors; the third is intentionally separate
because it may correct observable failure/replacement behavior.

## Rejected alternatives and stopping condition

Do not extract small stateless helpers merely to shorten the runtime file. A
pure reducer that exposes its entire mutable state is shallow; multiple event
listeners invite divergent transcript and terminal interpretations; a public
projector interface leaks SDK transport facts into the application; and a
general observer/multicast framework has no second consumer today.

Stop after characterization and keep the cohesive implementation if the
projector cannot own the whole event state machine and final precedence, if
runtime and projector tests must both retain the same event traces, or if the
projector needs to know thread construction, filesystem paths, MCP release, or
application persistence. Also stop the session-reader extraction if it becomes
only a pass-through instead of hiding discovery, schema decoding, caching, and
fail-optional behavior. Reconsider a version/dialect adapter only when two
actual SDK event dialects must coexist.

## Primary-source version audit

The important boundary is exact: the findings below are supported for the
repository's lockfile resolution, **0.146.0**, and the matching OpenAI source
commit above. They are not promises about later SDK or CLI releases. The public
OpenAI SDK page describes starting, continuing, and resuming local threads, but
does not version or fully specify the JSON event protocol or local rollout
schema; those details must be treated as pinned-source behavior rather than a
stable cross-version contract. See the [official Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk).

## Exact dependency boundary

The manifest requests `@openai/codex-sdk` with the semver range `^0.146.0`, but
the lockfile resolves exactly `0.146.0` and records its integrity hash. The SDK
package in turn depends on `@openai/codex` exactly `0.146.0`; the lockfile pins
the matching platform packages. Therefore source conclusions should be tied to
the lockfile, not to the broader manifest range.

Primary evidence:

- [`package.json`](../../../package.json) declares the range at line 35.
- [`pnpm-lock.yaml`](../../../pnpm-lock.yaml) resolves it at lines 17-19,
  records the SDK and CLI artifacts at lines 102-108, and records the exact SDK
  -> CLI dependency at lines 1153-1164.
- The [installed SDK package manifest](../../../node_modules/@openai/codex-sdk/package.json)
  identifies itself as 0.146.0, points to OpenAI's `openai/codex` repository,
  and depends on `@openai/codex` 0.146.0.
- OpenAI's `rust-v0.146.0` tag resolves to commit `be449751...`; this was
  independently verified with `git ls-remote` against the official repository.

Because `^0.146.0` permits later compatible releases if the lock is refreshed,
an SDK upgrade review must compare the new lock resolution and bundled CLI,
not merely observe that `package.json` did not change.

## Thread lifecycle facts

The public documentation says the TypeScript library can start, continue, and
resume local threads; calling `run()` again continues the same thread and
`resumeThread(threadId)` reconstructs a past one. The tagged implementation
makes the mechanics more precise:

1. `startThread()` creates a `Thread` with a null internal ID.
2. `runStreamed()` passes that ID to the exec wrapper. When the stream produces
   `thread.started`, the SDK saves `thread_id` on the `Thread` object.
3. A later run on the same object passes the saved ID. The exec wrapper launches
   `codex exec --experimental-json` and appends `resume <threadId>` when an ID is
   present.
4. `resumeThread(id)` simply constructs a `Thread` already seeded with that ID.
5. Each SDK run spawns a CLI process; the `Thread` object preserves identity,
   not a durable in-process transport connection.

Sources: [official SDK documentation](https://learn.chatgpt.com/docs/codex-sdk),
tagged [`codex.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/codex.ts#L21-L53),
tagged [`thread.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/thread.ts#L44-L107),
tagged [`exec.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/exec.ts#L96-L193),
and the [installed implementation](../../../node_modules/@openai/codex-sdk/dist/index.js)
at lines 34-95, 173-255, and 509-533.

### Lazy-stream consequence

`runStreamed()` returns an object containing an async generator. Constructing
that generator does not execute its body. CLI spawn, resume, stdout parsing,
non-zero exit, and most cleanup errors therefore surface when the consumer
iterates `events`, not necessarily from `await thread.runStreamed(...)`.
The installed implementation demonstrates this split at lines 51-54 and
77-94; process failures are raised by the exec generator at lines 252-303.

This matters directly to issue 90: a resume-replacement policy cannot assume
that catching only the initial `runStreamed()` promise catches resume failure.
The event-consumption boundary must own or deliberately translate iteration
exceptions. This is an inference from ordinary async-generator semantics plus
the cited implementation, not a separate promise in the public docs.

## Streamed event contract at 0.146.0

The public `ThreadEvent` declaration is a discriminated union of exactly eight
variants:

| Event | Declared payload / role |
| --- | --- |
| `thread.started` | `thread_id`; documented as the first event for a new thread |
| `turn.started` | no payload |
| `item.started` | `ThreadItem` |
| `item.updated` | `ThreadItem` |
| `item.completed` | `ThreadItem` |
| `turn.completed` | five-field `usage` |
| `turn.failed` | `{ error: { message } }` |
| `error` | top-level unrecoverable stream error with `message` |

The corresponding `ThreadItem` union has eight variants:
`agent_message`, `reasoning`, `command_execution`, `file_change`,
`mcp_tool_call`, `web_search`, `todo_list`, and item-level `error`. The
`mcp_tool_call` shape includes server, tool, arguments, status, optional result,
and optional error, which is the SDK-level raw evidence available to the
runtime.

Sources: tagged [`events.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/events.ts#L5-L84),
tagged [`items.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/items.ts#L5-L128),
and the [installed declarations](../../../node_modules/@openai/codex-sdk/dist/index.d.ts)
at lines 3-167.

### Exhaustiveness is compile-time only

The SDK implementation parses each stdout line with `JSON.parse(item) as
ThreadEvent`; it does not runtime-validate the discriminant or payload before
yielding it. It only performs two special mutations: saving the ID on
`thread.started` and defaulting a missing `cache_write_input_tokens` to zero on
`turn.completed`. See tagged [`thread.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/thread.ts#L74-L97)
and installed implementation lines 77-90.

Consequently, a TypeScript exhaustive switch protects against changes visible
in upgraded declarations, but does not protect a 0.146.0 consumer from an
unexpected runtime JSON variant or malformed payload. An internal projection
seam should preserve unknown/unparseable evidence diagnostically and fail
safely where terminal correctness depends on it; it should not silently claim
that the declared union was exhaustively handled at runtime.

### Item identity and live replacement

The 0.146.0 exec event processor maps a raw Codex item ID to a generated exec
item ID when an item starts and reuses/removes that mapping when the item
completes. Todo-list updates likewise reuse one stored item ID until terminal
completion. This is first-party evidence for using `item.id` as the replacement
key within one streamed run. See the tagged
[`event_processor_with_jsonl_output.rs`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L486-L589)
and its [todo-list update path](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L940-L976).

The guarantee should not be widened beyond that stream/version. IDs are
generated by a fresh event processor for each CLI invocation, so they are not
documented as globally stable across separate turns or resumed CLI processes.
Attempt isolation remains application-owned.

## Terminal signals and failure behavior

At the SDK surface, successful termination is `turn.completed`; declared turn
failure is `turn.failed`; a top-level `error` is separately declared as an
unrecoverable stream error. An async generator may also end or throw without
yielding either terminal turn event. Therefore incomplete-stream handling is an
application invariant, not something the event union makes impossible.

The underlying 0.146.0 processor adds useful precedence evidence. A critical
server error is emitted immediately as top-level `error` and saved. If the turn
later reports failed, the processor chooses the turn's own error first, then
the saved critical error, then the literal fallback `"turn failed"`, and emits
`turn.failed`. On completion it emits `turn.completed`. See tagged
[`event_processor_with_jsonl_output.rs`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L690-L716)
and [terminal-turn mapping](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L858-L918).

The SDK's buffered `run()` helper is not the governing behavior for this
project: in 0.146.0 it collects completed items and handles `turn.completed`
and `turn.failed`, but it does not explicitly handle top-level `error`. The
project correctly consumes `runStreamed()` itself, but its projector/tests
must retain explicit coverage for both failure variants, iterator exceptions,
and clean end-of-stream before `turn.completed`. See tagged
[`thread.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/thread.ts#L109-L142)
and installed implementation lines 97-120.

## `turn.completed.usage` semantics

The declared `Usage` has five counters:

- `input_tokens`
- `cached_input_tokens`
- `cache_write_input_tokens`
- `output_tokens`
- `reasoning_output_tokens`

The three detail counters overlap their parents: cached/cache-write tokens are
input details, and reasoning tokens are an output detail. The non-overlapping
raw total is `input_tokens + output_tokens`; the five fields must not all be
summed. The SDK does not expose the upstream `total_tokens` field in this event.
See tagged [`events.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/events.ts#L20-L47),
OpenAI's [prompt-caching usage documentation](https://developers.openai.com/api/docs/guides/prompt-caching#how-caching-works),
and tagged Codex [`TokenUsage`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/protocol/src/protocol.rs#L2191-L2206).

Despite comments calling this usage “during the turn,” the 0.146.0 exec
processor stores the latest `ThreadTokenUsage` notification and copies its
**`total`** member into `turn.completed.usage`; it does not copy `last`.
The event is therefore a cumulative thread snapshot and can include earlier
activity after resume. See tagged
[`event_processor_with_jsonl_output.rs`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L107-L128)
and its [turn-completion path](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L497-L523).

Implications for the event seam:

- Preserve all five raw values exactly after validating finite, non-negative
  integers.
- Do not label the snapshot attempt-local unless application-owned continuity
  and baseline subtraction establish that delta.
- Treat missing/malformed usage as unavailable; do not synthesize an
  authoritative zero.
- The SDK itself defaults only a missing `cache_write_input_tokens` to zero for
  compatibility. Other fields receive no runtime validation.

## Local rollout/session token evidence

The SDK source says resumable threads are persisted under
`~/.codex/sessions`. This local JSONL is not part of the TypeScript
`ThreadEvent` union. At 0.146.0, persisted records include an outer
`RolloutItem::EventMsg`, whose JSON form for token evidence is:

```text
type = "event_msg"
payload.type = "token_count"
payload.info.total_token_usage
payload.info.last_token_usage
payload.info.model_context_window
```

`total_token_usage` is cumulative metered thread usage. `last_token_usage` is
the latest response/context-base usage, while `model_context_window` is the
effective window associated with the snapshot. Codex's own active-context
calculation starts from `last_token_usage.total_tokens` and adds estimates for
local items appended after the most recent model-generated item. See tagged
[`TokenUsageInfo` accounting](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/protocol/src/protocol.rs#L2073-L2112)
and tagged [`ContextManager::get_total_token_usage`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/context_manager/history.rs#L285-L318).

The project's current adapter recursively finds a JSONL filename containing
the thread ID, scans backward for the newest parseable `token_count`, and reads
`last_token_usage.total_tokens` plus `model_context_window`; see
[`src/runtime/codex-agent-runtime.ts`](../../../src/runtime/codex-agent-runtime.ts)
lines 346-418. This is appropriately fail-optional, but it is a **private,
version-sensitive evidence seam**, for four reasons:

1. The public TypeScript SDK does not declare the rollout record schema.
2. The public `turn.completed` event does not expose `last` or the context
   window, so the rollout cannot be replaced with that event without losing
   semantics.
3. `last_token_usage.total_tokens` is a context base, not guaranteed exact
   post-turn occupancy when local trailing items exist.
4. Directory layout, filename convention, record envelope, field naming, and
   the 12,000-token display baseline can change independently of the SDK's
   TypeScript event declarations.

The reader should therefore remain non-authoritative for execution: missing,
late, malformed, unreadable, or changed rollout evidence must suppress the
meter rather than change the attempt outcome. If isolated, its interface should
return a small evidence value or “unavailable,” and should not know how thread
construction, terminal outcomes, or application persistence work.

## Upgrade audit for the eventual seam

For every change to the locked SDK/CLI version, verify at least:

1. the SDK and bundled CLI still resolve to the intended same version/commit;
2. whether `ThreadEvent` or `ThreadItem` gained variants or changed payloads;
3. whether stdout JSON is now runtime-validated or remains an unchecked cast;
4. whether item IDs remain stable from start/update to completion within a run;
5. whether CLI/resume failures still surface during generator iteration;
6. whether top-level `error`, `turn.failed`, and premature stream end retain
   their current relationship;
7. whether completed usage uses cumulative `total` or turn/request-local
   `last`, and whether any counters were added;
8. whether rollout location/envelope and `token_count.info` fields still match;
9. whether Codex's active-context calculation or display baseline changed.

Representative contract tests should use literal fixtures for all eight event
variants, all eight item variants, repeated updates with one item ID, unknown
event/item discriminants, malformed usage, both declared failure variants, an
iterator throw, premature stream completion, resumed cumulative usage, and
missing/malformed rollout evidence. These tests can exercise a projection or
evidence interface without constructing a real SDK client, filesystem tree,
MCP server, or application repository.

## Uncertainties that must remain explicit

- The current public SDK documentation is not a versioned protocol reference.
  It confirms lifecycle intent, not the exhaustive 0.146.0 wire contract.
- The TypeScript event declarations do not promise forward-compatible unknown
  event handling, and the implementation performs no runtime schema check.
- OpenAI does not document local rollout JSONL as a stable TypeScript SDK API.
  Direct parsing is diagnostic/local evidence, not transport authority.
- `last_token_usage.total_tokens` is not a formally promised exact post-turn
  occupancy value; Codex may add local estimates after that measured base.
- Stable exec item IDs are established by the pinned event processor within one
  invocation, not documented globally across invocations or versions.
- The manifest's caret range means the repository can move beyond this evidence
  boundary when the lockfile is regenerated. Re-run this audit then.

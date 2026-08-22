# Initial Prompt Caching and Conversation Cost

## Question

For the current agent-coordination framework and its installed Codex SDK, which
input is cached, what changes when an existing Codex conversation is continued
instead of starting fresh, where can the architecture lose cache value, and
which improvements are both low-risk and evidence-based? As a secondary
question, how large is the framework-owned initial prompt relative to the
Codex-owned startup material?

## Version and evidence boundaries

This report inspects the repository as of 2026-08-22. It resolves
`@openai/codex-sdk` **0.146.0** in `pnpm-lock.yaml`; the installed SDK launches
the matching Codex CLI and resumes by invoking `codex exec ... resume
<thread-id>` ([installed SDK implementation](../../../node_modules/@openai/codex-sdk/dist/index.js),
[installed SDK declarations](../../../node_modules/@openai/codex-sdk/dist/index.d.ts)).
Matching `rust-v0.146.0` source links are used where behavior below the public
TypeScript contract matters.

Claims are classified as follows:

- **Documented fact** — stated by current official OpenAI documentation.
- **Source fact** — directly visible in this repository, installed declarations,
  or matching official Codex source.
- **Source-code inference** — the most direct implication of those sources, but
  not an API guarantee.
- **Local measurement** — deterministic character/word counts of locally
  composed strings, not tokenizer or billing measurements.
- **Unknown** — hidden, model-dependent, provider-dependent, or not exposed by
  the installed SDK.

No paid model calls were made for this report. Consequently it does not claim a
live cache-hit rate or monetary saving for a particular deployment.

## Executive conclusion

Continuing a conversation is a meaningful improvement, but not because old
context becomes free. A continued turn still includes and bills the prior
conversation context. When the prior context remains an exact prefix and the
cache entry is available, those tokens can be billed at the cached-input rate;
when the cache misses, the same growing context is ordinary input again.
OpenAI explicitly documents both properties: previous context in a continued
response remains billed input, while append-only conversations are a preferred
prompt-caching pattern ([conversation state](https://developers.openai.com/api/docs/guides/conversation-state),
[prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching)).

The framework's current architecture is well aligned with that pattern:

1. Ordinary later activations resume the stored Codex thread.
2. Previously delivered task description, comments, and activity are omitted.
3. A new activation receives a bounded delta; a retry receives an even smaller
   continuation prompt.
4. Tool schemas are registered in a deterministic order and do not contain the
   attempt-scoped API token or task ID.

This makes the old “pay the entire initial prompt on every interaction” concern
substantially less relevant for ordinary continued work. It does **not** remove
the need to monitor long conversations: cached tokens are still metered, long
history can eventually dominate even at a discount, cache entries can expire
or be evicted, and compaction trades a shorter future prompt for loss of the old
exact prefix.

The most useful next action is measurement, not another prompt rewrite: retain
the five SDK usage counters and add analysis grouped by thread, model, elapsed
time since the previous turn, fresh/resumed/replaced status, and compaction.
The existing transcript persistence already converts the SDK's cumulative
thread snapshot into an attempt delta when it has a valid baseline.

## What “cached” means

### Matching and eligibility

**Documented facts.** Prompt caching is automatic for eligible requests, but
reuse requires an exact shared prefix. Stable content should appear first and
dynamic content last. The rendered tool list, tool order, descriptions and
parameter schemas, structured-output schema, images, and relevant prompt
settings participate in the match. A changed suffix does not invalidate an
unchanged earlier prefix ([prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

The default eligibility floor starts at 1,024 tokens. GPT-5.6 and newer use a
strict 1,024-token minimum; older supported models have a model-dependent
1,024–2,048-token threshold and best-effort reuse. Hits are reported in
128-token increments. Therefore a small framework string below the threshold
can still be cached when it is preceded by enough stable Codex material; its
standalone size is not the decisive criterion.

Routing combines a hash of the initial prompt prefix with `prompt_cache_key`.
A stable key improves the chance that matching requests reach a machine holding
the entry, but cannot make different prefixes match. OpenAI recommends splitting
a key after roughly 15 requests per minute rather than overloading one key.

For GPT-5.6 and newer, the default implicit breakpoint is the latest user or
tool message. Append-only conversations can therefore reuse earlier eligible
breakpoints and write the newly extended prefix. Up to four explicit
breakpoints can mark intentionally reusable prefixes, and the service considers
the latest 80 conversation breakpoints. Top-level Responses `instructions`
cannot itself carry an explicit breakpoint; an explicit breakpoint requires a
developer message represented in `input` ([Responses create reference](https://developers.openai.com/api/reference/cli/resources/responses/methods/create),
[prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

### Billing and retention

**Documented facts.** `cached_tokens` is a subset of input tokens read from the
prompt cache. On models that report it, `cache_write_tokens` is a subset of input
tokens written to the cache. Neither is an additional raw-token bucket. The
installed SDK exposes them as `cached_input_tokens` and
`cache_write_input_tokens`; Codex maps them from the Responses input-token
details ([SDK type](../../../node_modules/@openai/codex-sdk/dist/index.d.ts),
[matching Codex parser](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/codex-api/src/sse/responses.rs#L116-L150)).

For GPT-5.6-family pricing, an uncached/nonwritten input token is charged at
1.0× the model's input price, a cache write at 1.25×, and a cache read at 0.1×.
The 1.25× write rate is the total rate, not a surcharge added to 1.0×. The
documented TTL is 30 minutes and is refreshed by a write or successful reuse.
Earlier caching-capable models have model-specific cached-input rates and no
cache-write fee; their default in-memory entries generally expire after 5–10
minutes of inactivity and at most one hour, while supported extended retention
is best-effort up to 24 hours ([prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

Thus “same thread” is neither necessary nor sufficient for a hit:

- A fresh thread may reuse a shared exact startup prefix if its key, routing,
  model, settings, rendered tools, and retention conditions align.
- A resumed thread may miss after TTL expiry or eviction, after a prefix-changing
  configuration change, or after compaction rewrites the history.

## What Codex 0.146.0 sends

### Thread continuation

**Source facts.** The TypeScript SDK describes one `Thread` as a conversation
with multiple consecutive turns and persists resumable threads under the Codex
home directory. `resumeThread(id)` constructs a thread with that ID; the next
run passes it to `codex exec resume` and sends the new prompt on stdin
([SDK declaration](../../../node_modules/@openai/codex-sdk/dist/index.d.ts),
[SDK implementation](../../../node_modules/@openai/codex-sdk/dist/index.js)).
The framework records the latest successful thread ID on the conversation and
passes it into the next dispatch
([automation coordinator](../../../src/application/internal/automation-coordinator.ts),
[Codex runtime](../../../src/runtime/codex-agent-runtime.ts)).

**Source-code inference.** A resumed CLI process reconstructs the persisted
conversation and sends the relevant full model context; persistence is local
conversation continuity, not a server-side exemption from input billing. The
fact that the framework starts a new CLI process for each activation does not by
itself damage a server-side prompt cache. What matters is the reconstructed
request's exact prefix and routing identity.

### Cache key and unsupported controls

**Source facts.** Matching Codex 0.146.0 builds every Responses request with a
`prompt_cache_key`; absent an internal override, its value is the Codex response
metadata's session ID
([Codex client](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/core/src/client.rs#L452-L464),
[request construction](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/core/src/client.rs#L796-L882)).
The same request serializes base instructions, conversation input, and the
rendered tool definitions. For Responses Lite models, tools and base
instructions are inserted as leading developer items; otherwise they occupy
top-level `instructions` and `tools` fields.

The 0.146.0 wire type contains `prompt_cache_key` but no
`prompt_cache_retention`, and it contains no prompt-cache-breakpoint field
([Codex request type](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/codex-api/src/common.rs#L235-L258)).
The public TypeScript `CodexOptions` and `ThreadOptions` likewise expose no
cache key, retention, breakpoint, or cache mode
([installed declaration](../../../node_modules/@openai/codex-sdk/dist/index.d.ts)).

**Source-code inference.** Continuing the same persisted Codex session should
retain the routing key that Codex derives from the session identity. Creating a
new framework conversation creates a new Codex session and therefore a different
default key, reducing reliable cross-conversation reuse of an otherwise shared
startup prefix. This inference should be confirmed with captured request
metadata or a controlled live run before it is treated as a billing guarantee.

**Unknown.** The SDK does not expose whether a particular response used an
implicit or explicit cache breakpoint, which exact prefix was matched, why a
miss occurred, or which logical prompt component contributed each cached token.
Its aggregate counters cannot separate “Codex base instructions,” “tool
schemas,” “project instructions,” “framework prompt,” and “conversation
history.”

## What this framework sends

### Fresh, resumed, and retry prompts

**Source facts.** Prompt composition has three paths
([activation prompt](../../../src/application/activation-prompt.ts)):

| Dispatch | Framework text sent as the new user turn |
| --- | --- |
| Fresh activation or deliberate full rebase | Full framework, process, board, role, participants, complete task record, activation source, and continuation facts |
| Distinct activation in an existing conversation | Compact authoritative bootstrap, current structural facts, changed description, and only comments/activity not delivered earlier |
| Retry or interruption continuation in the same activation | Compact recovery guidance and attempt facts only |

The delivery module persists the last delivered description and comment/activity
sequence per conversation, so unchanged unbounded task text is not copied into a
later ordinary activation
([conversation context delivery](../../../src/application/internal/conversation-context-delivery-module.ts)).
The new activation text is passed to the resumed Codex thread as the next user
turn; it does not replace or edit prior history.

### Local size measurements

**Local measurement, not tokenization.** Using the repository's runtime fixture
with an empty task description, no comments, no activity, and no other
activations produced:

| Locally controlled string | Characters | Whitespace-delimited words |
| --- | ---: | ---: |
| `FRAMEWORK_GUIDANCE` alone | 3,736 | 566 |
| Clean fresh full activation | 6,073 | 892 |
| Clean distinct resumed activation | 1,687 | 213 |
| Clean retry continuation | 330 | 47 |

These counts are reproducible from `composeActivationPrompt`; they are not token
counts because the exact tokenizer/model serialization is not exposed at this
boundary. They nevertheless show a real architectural reduction: for this
fixture, an ordinary resumed activation sends 72% fewer new framework-controlled
characters than a fresh activation, and a retry sends 95% fewer.

Description and comment payload grows linearly in characters. A changed
description is sent once to that conversation; later activations say it is
unchanged. New comments and activity are likewise delivered once. A 10,000-
character changed description therefore adds roughly 10,000 characters to one
activation rather than to every later activation. It then remains in the Codex
history and contributes to the growing context of future model calls, normally
as a cacheable earlier prefix.

### Tool stability

**Source facts.** The framework registers its fourteen MCP tools in one fixed
source order with stable names, descriptions, and Zod-derived schemas
([MCP server](../../../src/mcp/stdio-server.ts)). Attempt-specific task and agent
IDs plus the bearer token are carried in the MCP server's environment, not in
the tool schemas supplied to the model
([CLI wiring](../../../src/cli.ts)).

**Inference.** This is cache-friendly: rotating authorization tokens do not
change the model-visible tool prefix. Changes to the MCP tool definitions,
Codex version, enabled built-in tools, model, approval/sandbox settings, project
instructions, or their ordering can still invalidate part of the prefix.

## Continuing versus starting fresh

### Costs that continuation avoids

Continuation avoids reconstructing useful semantic context in a new user
prompt and often avoids repeated discovery tool calls. In this framework it
also avoids repeating the full process/board/role/task composition. These are
real savings independently of prompt caching: fewer newly appended tokens, fewer
model calls, and fewer tool-result tokens entering subsequent calls.

Issue 56's live investigation found the dominant waste was not merely the
initial prompt. Five short attempts accumulated 108,353–443,340 input tokens;
the largest made 13 model calls and reported 399,104 cached plus 44,236 uncached
input tokens. Repeated broad tool discovery and oversized mutation results were
then reduced ([Issue 56](../issues/56-reduce-agent-run-context-overhead.md)).
That observation remains important: the number and size of intermediate
tool/model rounds can outweigh a few thousand characters of framework bootstrap.

### Costs that continuation retains or introduces

Every model call sees a growing conversation until Codex compacts it. If `C` is
old context and `N` is new material, a cache hit does not make the input `N`; it
makes it approximately `C` at the cached-input rate plus `N` at the applicable
ordinary/write rate. A miss makes approximately `C + N` ordinary/write input.
At a 0.1× cache-read price, 100,000 cached tokens have the same input-price
weight as 10,000 uncached tokens, before accounting for cache writes and model-
specific pricing. That is why long conversations remain worth monitoring.

Continuation can also preserve stale or irrelevant material that a fresh
thread would omit. The framework mitigates duplication but does not selectively
delete old Codex tool output or reasoning. Codex's automatic compaction is the
eventual context-management boundary.

### Compaction

**Documented fact.** Compaction replaces long history with a shorter canonical
state representation. It reduces subsequent context size but can reset exact-
prefix reuse because the earlier prompt has been rewritten
([compaction guide](https://developers.openai.com/api/docs/guides/compaction),
[prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)).

**Source fact.** Codex 0.146.0 compaction rebuilds history and reinjects current
canonical initial context before the last real user message or summary
([Codex compaction source](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/core/src/compact.rs#L342-L350),
[history construction](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/core/src/compact.rs#L533-L649)).
The framework does not implement its own Codex-history compaction and correctly
treats it as runtime context management inside the same conversation.

The economic choice is therefore not “cache or compact.” Before compaction, a
large exact prefix may be cheap but nonzero; after compaction, the first rewritten
prompt may miss or incur a write, but later turns can cache the shorter prefix.
The crossover is workload- and model-dependent and should be measured.

## Where the framework can lose cache value

| Situation | Evidence grade | Likely effect | Framework responsibility |
| --- | --- | --- | --- |
| Ordinary resumed activation with unchanged model/tools/settings | Source-code inference | Strong cache candidate: prior history remains an exact prefix and Codex supplies a session-derived key | Already favorable |
| More than the retention interval between activations | Documented fact | Same thread can miss after expiry/eviction | Observe; cannot fix with prompt ordering |
| Retired, unavailable, or failed-to-resume thread replaced with a fresh one | Source fact | New session/key and full composition; likely loss of the conversation cache | Deliberate recovery cost |
| Process rebase forces full composition in the existing thread | Source fact | Large new suffix; does not rewrite old history, but the rebased content is newly billed/written | Deliberate correctness cost |
| Model, reasoning controls, Codex version, enabled tools, or tool schemas change | Documented/source fact | Earlier match may shorten or disappear | Keep stable during a conversation where correctness permits |
| Codex compaction | Documented/source fact | Old exact prefix is rewritten; first post-compaction call may miss/write | Runtime trade-off; measure |
| New task description/comments/activity | Source fact | New suffix is uncached or cache-written once, then eligible as prior prefix | Already delivered once |
| New conversation for each ordinary interaction | Source fact about old design; inference about cache | Different session-derived key and repeated full prompt reduce reliable reuse | Fixed by conversation continuity |
| Cross-conversation reuse of identical Codex/framework startup | Unknown/inference | Exact text may match, but per-session keys reduce reliable routing reuse | Potential opportunity, not exposed by SDK |
| GPT-5.6 explicit stable-prefix breakpoints or explicit-only mode | Source fact | Installed Codex wire/API surface cannot request them | Upstream SDK/CLI limitation |
| Extended cache retention | Source fact | Installed Codex 0.146.0 wire type exposes no retention control | Upstream SDK/CLI limitation |

No architecture-specific defect was found that rewrites earlier conversation
messages on an ordinary activation or injects the attempt token into tool
schemas. Those would have been high-impact cache destroyers; the implementation
avoids both.

## Low-hanging improvements

### 1. Add cache-efficiency analysis before changing prompts

The SDK reports only a cumulative thread-total usage snapshot at
`turn.completed`; Codex 0.146.0's JSON event processor selects the `total`, not
the `last`, counter. The framework already persists both the reported snapshot
and, when the resumed thread identity and prior baseline agree, a nonnegative
attempt delta
([existing usage research](./codex-sdk-token-usage-semantics.md),
[attempt isolation](../../../src/application/internal/automation-state-store.ts)).

Use those attempt deltas to report, offline or in diagnostics:

- cache-read ratio: `cachedInputTokens / inputTokens`;
- cache-write ratio where present;
- uncached input: do not derive by subtracting both cache read and cache write
  unless the provider contract proves they partition input;
- fresh/resumed/replaced status, model, number of model/tool rounds, and elapsed
  time from the preceding completed turn;
- whether compaction occurred before a sudden cache-ratio change.

This is the only reliable way to tell whether theoretical cache friendliness
produces real savings in this deployment.

### 2. Preserve the current append-only delivery design

Do not re-send the full task record “for safety” on every ordinary activation.
Keep stable task text in inherited history and append only changed description,
new comments/activity, and the exact activation source. The current delivery
cursors are the main framework-owned cache and context-size optimization.

### 3. Keep model-visible tools and settings stable within a conversation

Continue registering tools in deterministic order. Avoid per-activation tool
descriptions, schemas, or filtered tool arrays. Where a future API surface
supports it, prefer stable tools plus `allowed_tools` over mutating the tools
array. Treat a model or tool-contract change as a cache-affecting event and make
it visible in analysis.

### 4. Avoid avoidable conversation replacement

Keep the current resume-first behavior and replace only on an unusable resume or
explicit retirement. A fresh replacement correctly restores full operating
context, but it should remain observable because it loses both semantic
continuity and likely session-key cache locality.

### 5. Re-evaluate when Codex exposes cache controls

When a later supported Codex SDK exposes `prompt_cache_retention` or explicit
breakpoints, evaluate:

- extended retention for workflows whose activations commonly exceed the
  default TTL;
- one explicit breakpoint after stable Codex/project/framework instructions;
- implicit-plus-explicit mode when conversation history will continue growing;
- explicit-only mode for a stable prefix followed by one-off, high-churn task
  text, to avoid paying for cache writes that will never be reused.

Do not patch the installed SDK or depend on undocumented config passthrough for
this ticket. Those controls affect billing and routing and should enter through
a supported, tested interface.

### 6. Benchmark compaction rather than assuming a threshold

Compare the cumulative input-price equivalent before and after actual Codex
compactions. A useful experiment holds model/tools constant and records several
turns at increasing history sizes, then repeats after compaction. The decision
metric is cost plus latency and task quality, not raw token count alone.

## Initial framework prompt versus Codex-owned prompt

This split cannot be presented as an exact usage or cost value with the current
SDK.

What is knowable:

- The framework-owned string is deterministic and locally measurable. Its
  invariant `FRAMEWORK_GUIDANCE` is 3,736 characters / 566 whitespace words in
  this checkout; a clean full activation fixture is 6,073 characters.
- Codex 0.146.0's model catalog supplies model-specific base instructions. The
  current GPT-5.6 entries contain a substantial Codex-owned instruction
  template, and Codex also renders built-in/MCP tools and project/user context
  ([matching model catalog](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/models-manager/models.json#L68-L156)).
- Issue 56's earlier live inspection estimated roughly 17,000 characters of
  runtime instructions, 4,000 of project context, and 12,000 of activation
  composition before hidden tool schemas. Those are historical character
  measurements, not a stable current token breakdown.

What is not knowable from `turn.completed.usage`:

- the exact token count of each logical segment after model-specific rendering;
- which segment was cached or written;
- whether two segments share a tokenizer boundary that changes their standalone
  token counts;
- the monetary contribution of a segment when one request contains a mix of
  uncached, cache-write, and cache-read input.

A controlled differential experiment could estimate marginal tokens: run the
same model/config/tools with and without a framework suffix, repeat inside and
outside the retention window, and compare usage details. It would still be an
estimate tied to that model, Codex version, provider, and prompt ordering—not a
general-purpose UI number. Consequently Issue 63 should not add a precise
“framework tokens” or “initial prompt cost” field. A research note plus
thread-level cache-efficiency diagnostics is the honest outcome.

## Recommended disposition for Issue 63

Close Issue 63 without implementing the speculative prompt-breakdown UI.

Record these conclusions in the issue:

1. Exact component attribution is unavailable from the SDK and standalone local
   token estimates would misrepresent caching and billing.
2. Conversation continuity already removes the principal framework-owned
   repetition and is architecturally cache-friendly.
3. Continued history is still billed and can grow expensive; its actual
   cache-read/write/miss behavior should be measured from attempt-isolated SDK
   counters.
4. No clear framework cache-destroying bug was found. The main remaining gaps—
   explicit breakpoints and retention controls—are absent from Codex SDK/CLI
   0.146.0's supported surface.
5. Revisit prompt or compaction tuning only after measurements identify a
   repeatable miss pattern or a newer supported Codex surface exposes the
   relevant controls.


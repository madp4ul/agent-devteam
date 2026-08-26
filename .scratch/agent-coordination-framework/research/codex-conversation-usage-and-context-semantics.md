# Codex conversation usage and active-context semantics

Research date: 2026-08-26  
Runtime examined: `@openai/codex-sdk` / bundled Codex CLI `0.146.0`  
Tagged source commit: [`be449751`](https://github.com/openai/codex/tree/be449751a978f02e5bbba886999662956c7f38f5)

## Answer

For Codex 0.146.0, TypeScript SDK `turn.completed.usage` is a **cumulative
thread snapshot**, not usage local to the SDK `run()` call or framework turn.
The declaration says “during a turn,” but the implementation stores the latest
app-server `ThreadTokenUsage` update and constructs `turn.completed.usage` from
its `total` member. It does not use `last`.

That cumulative total is the element-wise sum of the usage returned by every
completed upstream Responses API request in the Codex thread. A single Codex
turn can make several such requests while alternating between model responses,
tool calls, and tool results. Each completion is appended before Codex decides
whether another sampling request is needed. Consequently, 400,000 cached input
tokens can be ordinary metered work accumulated across many requests even when
no individual request had a 400,000-token active context.

The correct conversation cost input is therefore:

```text
first framework turn on a new Codex thread = first cumulative snapshot
continued framework turn on the same thread = new snapshot - preceding trustworthy snapshot
conversation usage = sum of those isolated non-overlapping deltas
```

Equivalently, when the same thread and pricing basis remain continuous, the
latest cumulative snapshot already represents the conversation's total metered
token quantities. The application must not price and sum unmodified cumulative
snapshots from every framework turn.

## Primary-source trace

### 1. What the TypeScript SDK emits

The public TypeScript event union contains `turn.started`, item events,
`turn.completed`, `turn.failed`, and `error`; it does not contain Codex's
underlying `token_count` / `thread/tokenUsage/updated` event. Its `Usage` type
contains only the five input/output counters and describes them as turn usage.
See the tagged [`events.ts`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/sdk/typescript/src/events.ts#L20-L83).

The CLI JSON event processor keeps the latest `ThreadTokenUsage` notification.
Its `usage_from_last_total()` copies `usage.total`, and the completed-turn path
puts that result in `TurnCompletedEvent`. See
[`event_processor_with_jsonl_output.rs`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L117-L128)
and its [notification/completion handling](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L497-L523).

The app-server type makes the distinction explicit: `ThreadTokenUsage` has
`total`, `last`, and `model_context_window`. See the tagged
[`ThreadTokenUsage` protocol](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1465-L1505).

Conclusion: the SDK comment is inaccurate for 0.146.0. The implementation is
authoritative for this pinned dependency, and it emits `total`.

### 2. What `total` and `last` accumulate

Each upstream `ResponseEvent::Completed` carries one response's token usage.
Codex immediately records it, then the outer turn loop may issue another
sampling request when the model requested tool follow-up. See the tagged
[`ResponseEvent::Completed` branch](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/session/turn.rs#L2341-L2378)
and the [outer sampling loop](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/session/turn.rs#L285-L425).

`TokenUsageInfo::append_last_usage()` adds that response usage into
`total_token_usage` and replaces `last_token_usage` with the response usage;
`TokenUsage::add_assign()` sums every counter independently. See
[`TokenUsageInfo`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/protocol/src/protocol.rs#L2073-L2112)
and [`TokenUsage::add_assign`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/protocol/src/protocol.rs#L2261-L2270).

Compaction requests also record their completed-response usage through the same
accounting path, so their metered work belongs in the cumulative cost total.
See tagged [`compact.rs`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/compact.rs#L726-L742).

### 3. Why the cumulative counter survives resume

Codex persists `TokenCount` events in the rollout. On resume it finds the most
recent recorded `TokenCount`, restores its complete `TokenUsageInfo` into
session state, and appends subsequent response usage to it. See
[`last_token_info_from_rollout`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/session/mod.rs#L1485-L1491)
and the [resume seeding path](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/session/mod.rs#L1335-L1365).

Therefore a framework baseline is trustworthy only when all of these hold:

- the next runtime dispatch actually resumed the same Codex thread;
- the baseline is that thread's immediately preceding raw SDK snapshot;
- a missing intervening snapshot is not treated as zero;
- every category delta is nonnegative; and
- a replacement/fork/reset is treated as a new counter lineage.

When those conditions hold, category-wise subtraction recovers the exact usage
added since the earlier snapshot. If any condition fails, isolated cost is
unknown; presenting the cumulative snapshot as a turn-local amount would be
misleading.

## Billing interpretation

OpenAI's Responses API reports usage on each response, including input, cached
input detail, output, and total tokens. The official prompt-caching guide shows
separate usage for Request 1 and Request 2 and explicitly explains that reused
tokens are paid at the cached-input rate. It also illustrates repeated reads:
one cache write plus nine reads across ten requests still has a nonzero total
cost. See the [request-usage example](https://developers.openai.com/api/docs/guides/prompt-caching#how-caching-works)
and [cache pricing explanation](https://developers.openai.com/api/docs/guides/prompt-caching#how-caching-works).

Thus “tokens OpenAI meters each time” is the right cost quantity. If one
50,000-token prefix is read from cache in ten model requests, the cumulative
usage legitimately gains roughly 500,000 cached input tokens. Compaction limits
the context supplied to an individual request; it does not erase already
metered requests from lifetime usage.

The SDK's `input_tokens` includes cached/cache-write input details, and
`output_tokens` includes reasoning-output details. Cost code must partition
those categories according to the applicable price table, not add the detail
counters on top of their parent counters. The official guide's
[`calculateInputCost` example](https://developers.openai.com/api/docs/guides/prompt-caching#calculate-input-cost)
uses exactly that partition.

## Active context after a turn

The public TypeScript SDK does **not** expose a post-turn context-occupancy or
context-window field. `turn.completed.usage` has neither `last` nor
`model_context_window`, and its selected `total` is lifetime metered usage.

Codex's lower-level surfaces do expose the ingredients:

- rollout/session JSONL `event_msg` records contain `token_count.info` with
  `total_token_usage`, `last_token_usage`, and `model_context_window`;
- app-server `thread/tokenUsage/updated` exposes the corresponding `total`,
  `last`, and `modelContextWindow` values;
- `last_token_usage.total_tokens` is the latest upstream response's
  `input_tokens + output_tokens`, not the whole Codex turn's billed total.

Codex itself uses `last_token_usage.total_tokens` as the active-context base
and adds a local estimate for model-visible items appended after the latest
model-generated item. See
[`ContextManager::get_total_token_usage`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/core/src/context_manager/history.rs#L285-L318)
and [`TokenUsage::tokens_in_context_window`](https://github.com/openai/codex/blob/be449751a978f02e5bbba886999662956c7f38f5/codex-rs/protocol/src/protocol.rs#L2233-L2258).

This makes the final `last_token_usage.total_tokens` a useful post-turn
active-context signal in the common case, but it is not a separate exact
occupancy field promised by the SDK. Local trailing items can require the same
estimate Codex applies internally. A future UI should therefore obtain this
through a supported app-server/SDK field and label it “latest active context”
or “context used,” never “total tokens” or “conversation usage.” Parsing the
private rollout JSONL is useful for diagnosis but is a fragile product
integration boundary.

## Recommendation for issues 76 and 77

1. Keep the same-thread trustworthy baseline subtraction for each resumed
   framework turn. Removing it would overcount the conversation by repricing
   earlier cumulative usage on every continuation.
2. Aggregate the isolated category quantities once for the conversation and
   render one cost breakdown. Preserve each raw cumulative snapshot only as
   diagnostic evidence, clearly labeled as Codex-reported cumulative usage.
3. Preserve pending/lower-bound behavior when a baseline or price is missing;
   do not substitute zero or the raw cumulative snapshot.
4. Treat a 400,000 cached-input observation as evidence of repeated metered
   requests first, not of a 400,000-token active context.
5. Create a follow-up for active-context display only after choosing a supported
   transport for app-server `last` plus `modelContextWindow` (or after an SDK
   upgrade exposes them). Do not infer occupancy from SDK cumulative `total`.

## Implemented follow-up

Issue 77 uses the completed thread's local rollout as a fail-optional adapter
until the SDK exposes the same facts. It reads the newest `token_count` record,
uses `last_token_usage.total_tokens` and `model_context_window`, and reproduces
Codex's current 12,000-token-baseline percentage calculation. The adapter is
version-sensitive by design: missing or changed evidence suppresses the meter
without affecting agent execution.

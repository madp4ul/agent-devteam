# Codex SDK Token-Usage Semantics

## Question

For `@openai/codex-sdk` 0.146.0, what do the five fields on
`turn.completed.usage` mean, which fields overlap, and is there a correct
non-overlapping representative total?

## Version boundary and sources

The repository resolves `@openai/codex-sdk` **0.146.0**. Its installed
declarations are the immediate contract for this application; the matching
`rust-v0.146.0` tag in the official `openai/codex` repository shows how Codex
constructs those values from Responses API usage. The current official prompt
caching guide supplies the cache terminology.

Sources:

- [installed SDK declaration](../../../node_modules/@openai/codex-sdk/dist/index.d.ts)
- [official SDK event type at `rust-v0.146.0`](https://github.com/openai/codex/blob/rust-v0.146.0/sdk/typescript/src/events.ts#L17-L34)
- [official Responses usage parser at `rust-v0.146.0`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/codex-api/src/sse/responses.rs#L116-L150)
- [official cache-write parser test at `rust-v0.146.0`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/codex-api/src/sse/responses.rs#L760-L784)
- [official Codex `TokenUsage` implementation at `rust-v0.146.0`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/protocol/src/protocol.rs#L1914-L1929)
- [official OpenAI prompt-caching guide](https://developers.openai.com/api/docs/guides/prompt-caching#requirements)

## Conclusion

Yes. The correct raw, non-overlapping total token count for one SDK
`turn.completed` usage payload is:

```text
total tokens = input_tokens + output_tokens
```

Do **not** add `cached_input_tokens`, `cache_write_input_tokens`, or
`reasoning_output_tokens` to that total. They are detail counters already
contained in the broader input or output counters:

| SDK field | Meaning | Relationship |
| --- | --- | --- |
| `input_tokens` | All input tokens in the SDK's reported usage scope | Top-level input count |
| `cached_input_tokens` | Input tokens read from prompt cache | Subset/detail of `input_tokens` |
| `cache_write_input_tokens` | Input/prompt tokens written to prompt cache | Subset/detail of `input_tokens` |
| `output_tokens` | All output tokens in the SDK's reported usage scope | Top-level output count |
| `reasoning_output_tokens` | Output tokens used for reasoning | Subset/detail of `output_tokens` |

The SDK omits the upstream `total_tokens` field from its public `Usage` type,
but Codex retains that field internally. The tagged parser maps the Responses
API's top-level `input_tokens`, `output_tokens`, and `total_tokens` separately,
while it maps `cached_tokens` and `cache_write_tokens` out of
`input_tokens_details` and `reasoning_tokens` out of
`output_tokens_details`. Its explicit cache-write test uses:

```text
input_tokens                100
  cached_input_tokens        40
  cache_write_input_tokens   60
output_tokens                10
  reasoning_output_tokens     5
upstream total_tokens       110
```

That fixture is unambiguous: the total is `100 + 10 = 110`, not the sum of all
five SDK fields. It also demonstrates that cache-read and cache-write counts
are input details, while reasoning is an output detail. The OpenAI caching
guide independently describes `cached_tokens` as prompt tokens read from cache
and `cache_write_tokens` as prompt tokens written to cache, and shows both
under the prompt/input token details object.

Do not assume that cache reads and cache writes are mutually exclusive or that
they partition `input_tokens`; the public contract does not promise that.
Likewise, do not add either detail to input or derive another category by
subtracting both. Their only required relationship for the representative
total is that neither is an additional top-level token bucket.

## Scope caveat: the SDK event is a thread-total snapshot

Despite the SDK comments describing usage "during the turn," the tagged
0.146.0 JSON event processor stores the latest `ThreadTokenUsage` notification
and builds `turn.completed.usage` from its **`total`** member, not its `last`
member. `ThreadTokenUsage` defines `total` and `last` separately, and both carry
all six internal counters, including upstream `total_tokens`.

Sources:

- [JSON event processor selects `usage.total`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L107-L117)
- [processor emits that value at turn completion](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/exec/src/event_processor_with_jsonl_output.rs#L476-L502)
- [app-server `ThreadTokenUsage` defines `total` and `last`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/app-server-protocol/src/protocol/v2/thread.rs#L1375-L1440)

Therefore the five-field SDK payload is internally consistent and has the
`input_tokens + output_tokens` total formula, but it must not be assumed to be
an isolated attempt delta when a Codex thread is resumed. Capturing it verbatim
is sufficient to preserve exactly what the SDK reported, but labeling it as
usage caused only by the current attempt can overstate resumed attempts by
including earlier thread activity. Issue 53 needs an explicit product choice:
either label it as the Codex-reported cumulative snapshot or establish a
reliable baseline-and-delta mechanism before promising per-attempt usage.

## Presentation recommendation for issue 53

Show `input_tokens + output_tokens` as the primary **total tokens** for the
reported usage scope, with all five SDK values in the secondary breakdown. Use
"attempt" only when the persistence logic has established attempt isolation in
light of the cumulative-snapshot caveat above. This is a raw token count, not a
cost estimate. Different input categories can have different prices, and the
prompt-caching guide notes a distinct cache-write rate for the GPT-5.6 family,
so the five counters cannot be converted into currency without additional
model, provider, pricing, and billing context.

Codex core also defines a separate `blended_total()` as non-cached input plus
output for one of its own displays. That deliberately excludes cached reads
and is therefore not the raw total token usage requested here. It should not be
copied as the attempt's total or labeled as total tokens. Source:
[official `blended_total()` implementation](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/protocol/src/protocol.rs#L2061-L2076).

## Implementation guardrail

Compute the primary total only after validating the five event fields as
finite, non-negative integers. Preserve all five reported values exactly. If a
completed turn has no usable usage payload, present usage as unavailable rather
than synthesizing zeros; that is an application policy from issue 53, not an
SDK semantic.

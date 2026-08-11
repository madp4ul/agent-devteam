# Token-Usage UI Patterns

## Question

How do first-party coding-agent interfaces present token usage, especially the
difference between live context-window occupancy and cumulative run/session
usage, and what does that imply for issue 53's completed-attempt transcript?

## Comparison

| Product and surface | Current context-window measure | Cumulative usage | Cost | Cache presentation |
| --- | --- | --- | --- | --- |
| Codex CLI persistent status line | Optional `Context N% used` or `Context N% left`; not present in the default model-and-directory status line | Optional `N used`, `N in`, and `N out` status items use the thread's accumulated totals | No currency cost in these token status items | The detailed token formatter shows non-cached input as `input`, then cached reads separately as `(+ N cached)`; its compact `used` value is a special cache-excluding "blended" total |
| Claude Code status line and `/context` | Status-line examples foreground a percentage/progress bar; `/context` gives a live category breakdown | The status-line token fields are explicitly current-context values, not cumulative session totals; `/usage` is the separate current-session summary | Optional estimated session USD cost; documented as locally computed and potentially different from the bill | `current_usage` separates fresh input, cache creation/write, and cache reads; combined current input folds all three together |

## Codex CLI

Codex 0.146.0 keeps live context pressure and accumulated usage as separate
status-line choices. `ContextUsed` and `ContextRemaining` render a percentage,
whereas `UsedTokens`, `TotalInputTokens`, and `TotalOutputTokens` read from the
thread-total usage snapshot. `UsedTokens` calls `blended_total()` and renders
`N used`; input and output can instead be shown independently as `N in` and
`N out`. These are configurable rather than foregrounded by default: the
default status line contains only the model/reasoning choice and current
directory.

No official source reviewed here establishes an equivalent token display in
the Codex desktop app, so this note does not infer desktop parity from the CLI.

Sources:

- [status-line token and context renderings](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/tui/src/chatwidget/status_surfaces.rs#L630-L669)
- [default status-line items](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/tui/src/chatwidget.rs#L471-L474)
- [Codex's accumulated-versus-current token model](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/tui/src/token_usage.rs#L30-L47)

Codex's detailed formatter renders:

```text
Token usage: total=<blended> input=<non-cached> (+ <cached> cached)
output=<output> (reasoning <reasoning>)
```

This is an important semantic dependency, not just typography: the displayed
`input` first subtracts cached reads, and `blended_total()` is non-cached input
plus output. Cached input is therefore disclosed parenthetically but excluded
from that foregrounded total. Reasoning is similarly shown as a parenthetical
output detail. The pattern cannot be copied while calling the result a raw
total, because Codex deliberately applies cache-specific accounting.
[Source: official formatter and arithmetic](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/tui/src/token_usage.rs#L20-L80).

## Claude Code

Claude Code's customizable status line is primarily a live-operational
surface. Its documentation examples show current context as a percentage or
progress bar and may add estimated session cost. As of version 2.1.132,
`context_window.total_input_tokens` and `total_output_tokens` mean tokens
currently in the context window, not cumulative session totals. The input-only
context percentage sums fresh input, cache creation, and cache reads; it
excludes output. The `current_usage` object exposes those cache components
separately when a detailed view is wanted.
[Source: official status-line data model and examples](https://code.claude.com/docs/en/statusline#context-window-fields).

Claude Code puts cumulative inspection elsewhere: `/usage` reports current-
session API token statistics and an estimated total cost, while `/context`
shows the live context breakdown. The cost is explicitly a client-side
estimate that may differ from the bill; subscription users instead see plan-
usage bars and activity. This avoids presenting a context percentage as though
it were cumulative work or spend.
[Source: official cost and usage documentation](https://code.claude.com/docs/en/costs#using-the-usage-command).

For cache visibility, Claude Code names both directions rather than using one
generic "cached" bucket: `cache_creation_input_tokens` are tokens written to
cache and `cache_read_input_tokens` are tokens served from cache. Its prompt-
caching guide recommends watching the two as separate live counters.
[Source: official prompt-caching guide](https://code.claude.com/docs/en/prompt-caching#check-cache-performance).

## Implications for issue 53

1. Treat a completed attempt's token summary as **aggregate usage for that
   completed run**, not as current context-window occupancy. It should use counts,
   not a percentage or gauge; no live counter is needed.
2. If the transcript follows Codex CLI by foregrounding its cache-excluding
   `blended_total()`, label that number as “used” rather than as the raw SDK
   total. The authoritative raw total remains `input_tokens + output_tokens`;
   the related semantic proof is in
   [the SDK usage note](./codex-sdk-token-usage-semantics.md).
3. Keep cache details secondary and label direction explicitly: cached input
   (read) and cache-write input. Do not copy Codex's `input (+ cached)` wording
   unless the displayed input number has also excluded cached reads.
4. Label the section **Token usage**, not cost. Claude Code's dollar figure
   requires a separate estimate and billing context, while Codex's examined
   token surfaces do not claim a currency value.
5. A transcript-only summary matches the products' information hierarchy:
   always-visible UI is reserved for live context pressure when configured;
   detailed or cumulative usage belongs to an inspection surface.

No third-party tools or community extensions were used as evidence.

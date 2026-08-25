# Codex compaction-threshold parity

Research date: 2026-08-25  
Runtime examined: `@openai/codex-sdk` / bundled Codex CLI 0.146.0

## Answer

Yes. The framework currently inherits the ordinary Codex model default for automatic compaction. It does **not** ask Codex to use the model/API's advertised maximum context window, and it does not set a separate, earlier threshold.

For the examined runtime and current model catalog, the important numbers are:

| Concept | Current value | Meaning |
|---|---:|---|
| Model/API maximum context | 1.05M for GPT-5.4 | A model capability ceiling, not the default Codex working window. [GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4) |
| Codex resolved raw context window | 272,000 | The catalog value Codex actually uses by default for the examined models. The bundled CLI reports this without making a model request. |
| Codex effective context window | 258,400 | `272,000 * 95%`. This is the usable/reported window after Codex's safety margin; it is **not** the compaction trigger. [`TurnContext::effective_context_window`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/core/src/session/turn_context.rs) |
| Automatic compaction threshold | 244,800 | `272,000 * 90%`. When no explicit limit is configured, Codex derives this from the resolved raw context window. [`ModelInfo::auto_compact_token_limit`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/protocol/src/openai_models.rs) |
| Long-context pricing boundary | 272,000 input tokens | Requests above this boundary have higher rates on applicable models; it is a billing rule, not a compaction setting. [GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4) |

Consequently, the current default compaction point is about 245k tokens, before the 272k long-context pricing boundary and far before a one-million-token model ceiling. The concern in issue 74 should therefore be framed as **preserving Codex's cost-aware default**, not merely preventing the framework from compacting earlier than Codex.

## How the default resolves

Codex exposes three related configuration keys:

- `model_context_window`: the tokens available to the active model.
- `model_auto_compact_token_limit`: the threshold that triggers automatic compaction; when unset, Codex uses the model default.
- `model_auto_compact_token_limit_scope`: which tokens count toward the limit; `total` is the default, while `body_after_prefix` changes the accounting after a compaction prefix.

These definitions are in the official [Codex configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

The exact 0.146.0 resolution logic is in the tagged OpenAI source:

1. `resolved_context_window()` chooses the catalog `context_window`, falling back to `max_context_window` only if the former is absent.
2. `auto_compact_token_limit()` computes 90% of that resolved window.
3. With no explicit auto-compact setting, that 90% value is returned. With an explicit setting, Codex returns the smaller of the configured value and the 90% value.

See [`ModelInfo::resolved_context_window` and `ModelInfo::auto_compact_token_limit`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/protocol/src/openai_models.rs). A configured context window is also clamped to the model catalog's `max_context_window` before these calculations; see [`ModelInfo::with_config_overrides`](https://github.com/openai/codex/blob/rust-v0.146.0/codex-rs/models-manager/src/model_info.rs).

This is why `95%` and `90%` must not be conflated. For a raw window of 272,000:

```text
effective context window       = 272,000 * 0.95 = 258,400
automatic compaction threshold = 272,000 * 0.90 = 244,800
```

The bundled 0.146.0 catalog reported `context_window=272000` and `effective_context_window_percent=95` for `gpt-5.4`, `gpt-5.5`, and the examined GPT-5.6 variants. It reported a one-million-token `max_context_window` for `gpt-5.4`, but still a 272,000 default `context_window`. This can be reproduced without a model request using the bundled CLI's `debug models --bundled` command. It is direct evidence that the maximum and the default working window are separate settings.

## Why the framework has parity today

The dependency chain is version-aligned: the repository resolves `@openai/codex-sdk` 0.146.0, which depends on and bundles `@openai/codex` 0.146.0 (`package.json:32`, `pnpm-lock.yaml:17-19`, `pnpm-lock.yaml:102-108`, `node_modules/@openai/codex-sdk/package.json:2-8`, `node_modules/@openai/codex-sdk/package.json:67`). The official SDK implementation wraps and spawns the local bundled CLI, serializing generic SDK configuration into CLI `--config` overrides (`node_modules/@openai/codex-sdk/dist/index.js:173-179`, `node_modules/@openai/codex-sdk/dist/index.js:233-255`). Thus SDK threads use Codex's own model catalog and compaction implementation; the SDK does not independently manage a conversation window.

The framework constructs that SDK configuration in `src/runtime/codex-agent-runtime.ts:86-113`. It supplies approval, sandbox, and MCP-related overrides, but does not supply `model_context_window`, `model_auto_compact_token_limit`, or `model_auto_compact_token_limit_scope`. It supplies the selected model only as a thread option (`src/runtime/codex-agent-runtime.ts:119-125`) and forwards the process environment (`src/runtime/codex-agent-runtime.ts:319-325`). Therefore the normal Codex configuration layers and model defaults remain authoritative for compaction.

That behavior also matches a real, no-cost inspection of an existing framework-created rollout: its metadata identifies `originator="codex_sdk_ts"` and CLI 0.146.0, and its turn context reports `model_context_window=258400`, the expected 95%-effective value (`C:\Users\Paul\.codex\sessions\2026\08\23\rollout-2026-08-23T23-15-42-01a0307a-b1cb-7642-94ad-a63729067dc0.jsonl:1-2`). No paid model probe was run.

Codex configuration precedence also supports this conclusion. CLI flags and `--config` overrides outrank project configuration, which outranks profiles and user configuration, which outrank system and built-in defaults. See [Configuration basics: precedence](https://learn.chatgpt.com/docs/config-file/config-basic). Because the framework emits no compaction override, it does not displace a user's/project's explicit setting or Codex's built-in/model default.

## Explicit control, if it is intentionally needed

No new setting is required to obtain ordinary Codex behavior. In fact, hard-coding `244800` would make parity less durable: a future model catalog or CLI may choose another context window or policy, while an omitted value continues to follow Codex.

If the product deliberately needs a process-specific cost ceiling, the existing SDK configuration channel can express it:

```ts
const codex = new Codex({
  config: {
    model_context_window: 272_000,
    model_auto_compact_token_limit: 244_800,
    model_auto_compact_token_limit_scope: "total",
  },
});
```

The SDK accepts scalar/nested configuration and flattens it into dotted CLI `--config` overrides (`node_modules/@openai/codex-sdk/README.md:121-149`, `node_modules/@openai/codex-sdk/dist/index.d.ts:218-235`). Two constraints matter:

- Codex clamps `model_context_window` to the selected model's catalog maximum.
- Codex clamps the explicit compaction limit to at most 90% of the resolved context window. An explicit value can force **earlier** compaction, but cannot use this key to postpone compaction beyond Codex's 90% safety boundary in 0.146.0.

For ordinary parity, leave the scope at its default, `total`. Selecting `body_after_prefix` would deliberately change which tokens are counted and would no longer be parity with an unconfigured Codex session.

If this becomes a supported framework feature, it should be an optional **process-level** policy, authored together with the process's model and pricing assumptions. The process definition already owns agent model/reasoning selection (`src/application/internal/process-definition.ts:18-26`) and pricing metadata (`src/application/internal/process-definition.ts:28-39`; `docs/process-definition-reference.md:51-81`). A threshold copied globally into the runtime would silently become stale or inappropriate when processes select different models.

Recommended policy shape:

- Omitted fields mean “inherit Codex model defaults” and remain the default.
- An explicit override records the model, desired context window, compaction threshold, and scope together.
- Validate that the requested threshold is no greater than 90% of the requested context, while still treating Codex's runtime catalog and clamping as authoritative.

## Cost concepts that should remain separate

**Long-context pricing** is a per-request billing boundary. For GPT-5.4, the official model page states that prompts over 272k input tokens are priced at 2x input and 1.5x output for the full session. It does not define when Codex compacts. [GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4)

**Prompt caching** discounts eligible repeated prompt prefixes and can reduce latency and billed input cost; it does not remove those tokens from the active conversation and does not choose the compaction threshold. [OpenAI prompt caching guide](https://developers.openai.com/api/docs/guides/prompt-caching)

**Compaction** replaces older conversation history with a smaller representation so subsequent turns carry less active history. It is the mechanism relevant to the user's concern about every follow-up repeatedly loading a very large conversation.

## Caveat and follow-up

The parity is policy/configuration parity, not a guarantee that Codex Desktop and the TypeScript SDK always ship the same binary on the same day. At research time, the SDK was pinned to CLI 0.146.0 while the installed Desktop task metadata reported a newer 0.149.0 alpha build. Either product could receive a model-catalog or formula update first.

The durable response is to keep the SDK/CLI dependency current and add a zero-cost upgrade check that inspects the bundled model catalog and verifies the no-override path. Do not replace Codex's evolving model default with a global numeric constant merely to eliminate this version-drift caveat.

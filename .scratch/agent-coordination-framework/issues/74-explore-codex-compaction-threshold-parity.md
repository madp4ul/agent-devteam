# 74 — Explore Codex Compaction-Threshold Parity

**Type:** research

**What to decide:** Determine whether framework-launched Codex SDK threads use
the same effective automatic-compaction policy as ordinary Codex sessions, and
whether the framework should explicitly configure that policy to prevent
premature loss of useful conversation history.

**Blocked by:** None

**Status:** open

## Motivation

The framework must not accidentally compact an agent conversation earlier than
Codex normally would. The primary concern is retained working context and task
quality, not the separate GPT-5.6 long-context pricing boundary. An explicit
threshold may provide a stable safety invariant, but pinning a number without
understanding Codex's model defaults could instead become stale or unsafe as
models and SDK runtimes evolve.

Prompt caching and compaction are independent. The existing
[caching and conversation-cost research](../research/initial-prompt-caching-and-conversation-cost.md)
found that resumed framework conversations preserve append-only history and a
session-derived prompt-cache key. This ticket should not reopen prompt-shape
optimization unless compaction evidence identifies a concrete cache regression.

## Investigation

- Establish the effective `model_auto_compact_token_limit` and
  `model_auto_compact_token_limit_scope` for the model and Codex runtime used by
  the framework when no override is supplied.
- Compare the configuration layers and runtime/model-catalog versions used by
  the Codex desktop app, ordinary Codex CLI sessions, and the TypeScript SDK's
  `codex exec` process. Do not assume equal behavior merely because they share
  Codex concepts or user configuration.
- Verify that the framework does not currently lower the model context window
  or automatic-compaction threshold through SDK options, environment shaping,
  project configuration, or resume behavior.
- Determine how much safety headroom Codex requires below the model's hard
  context window and whether an explicit threshold can preserve normal Codex
  behavior without risking oversized-request failures.
- Observe at least one controlled pre/post-compaction thread when feasible:
  record active-context usage, compaction timing, retained task facts, cache
  read/write counters, and subsequent input usage. Avoid paid probes when local
  configuration or source evidence already answers a question.
- Decide whether any explicit policy belongs in framework runtime
  configuration, process configuration, or nowhere. Account for model changes,
  SDK upgrades, user overrides, and the risk that a pinned absolute threshold
  becomes stale.

## Expected result

Record the supported effective behavior and choose one of:

1. inherit Codex's model default because parity is already demonstrated;
2. explicitly set a model-aware threshold that preserves ordinary Codex
   context retention; or
3. expose an authored override while keeping a safe, documented default.

If a configuration change is warranted, create a focused implementation ticket
with tests proving the framework does not compact earlier than the chosen
policy and does not exceed the runtime's safe request boundary.

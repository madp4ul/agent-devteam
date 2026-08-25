# 74 — Explore Codex Compaction-Threshold Parity

**Type:** research

**What to decide:** Determine whether framework-launched Codex SDK threads
inherit Codex's normal model-aware automatic-compaction boundary, so a model's
larger advertised context ceiling does not silently make every follow-up carry
an unnecessarily expensive prompt, and identify the supported explicit control
if a process ever needs a different cost boundary.

**Blocked by:** None

**Status:** resolved

## Motivation

The framework must preserve Codex's cost-aware default. Some models expose a
much larger maximum context than Codex normally uses for agentic work. If SDK
threads selected that maximum or had no automatic-compaction boundary, every
later model call could repeatedly carry an unnecessarily large conversation.
The primary concern is therefore avoiding that cost growth while continuing to
trust Codex's model-aware trade-off between cost and retained working context.

An explicit threshold is useful only if SDK threads do not already inherit the
ordinary Codex policy. Pinning a number merely for parity could instead become
stale as model catalogs and SDK runtimes evolve.

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
with tests proving the framework compacts by the chosen cost boundary and does
not exceed the runtime's safe request boundary.

## Answer

Choose option 1: inherit Codex's model default. The framework already has the
desired cost behavior and should not add an explicit numeric threshold for
parity.

For the pinned TypeScript SDK and bundled Codex CLI 0.146.0, the examined Codex
catalog resolves a 272,000-token raw context window even where GPT-5.4 advertises
a roughly one-million-token maximum. With no explicit override, Codex derives
automatic compaction at 90% of that resolved window: **244,800 tokens**. The
separate 95% effective context value is 258,400 tokens; it is not the compaction
trigger. Thus the observed "around 250k" compaction is Codex's own default and
occurs before the 272,000-token long-context pricing boundary.

The production runtime passes no `model_context_window`,
`model_auto_compact_token_limit`, or
`model_auto_compact_token_limit_scope` override. The SDK wraps its bundled
`codex exec`, forwards the ordinary configuration environment, and uses Codex's
catalog and compaction implementation. User and trusted-project overrides also
remain effective through normal Codex configuration precedence.

If a deliberate process-specific ceiling is needed later, the SDK's supported
generic `config` option can pass all three keys. Such a feature should be
optional process-owned policy authored with its model and pricing assumptions;
omission must continue to mean "inherit Codex." Do not hard-code 244,800 in the
framework: that would turn today's derived, model-aware default into a stale
global constant. No implementation ticket is warranted for parity.

Desktop and SDK binaries can update on different schedules, so this conclusion
is policy/default-resolution parity rather than a permanent promise of binary
or catalog identity. Dependency upgrades should include a zero-cost inspection
of the bundled catalog and no-override path.

Full formulas, source citations, configuration precedence, explicit override
examples, cost distinctions, and version caveats are recorded in
[Codex compaction-threshold parity](../research/codex-compaction-threshold-parity.md).

# 36 — Configure Agent Models and Reasoning

**What to build:** A process author can select the Codex model and reasoning
effort for each agent definition, while omitted values continue to inherit the
user's ordinary Codex configuration.

**Blocked by:** 15 — Start a Validated, Paused Process; 16 — Execute the First Task Activation

**Status:** resolved

- [x] Each process agent may declare optional `model` and `reasoningEffort`
  fields beside its role, summary, and instructions. Omission means **inherit
  the launching user's Codex defaults**; the framework does not invent a model
  or reasoning default of its own.
- [x] Schema validation rejects empty model identifiers and unsupported
  reasoning-effort syntax with source-located diagnostics. Because model
  availability can depend on the user's account and installed Codex runtime,
  availability failures remain actionable runtime-start failures rather than a
  hardcoded catalog that becomes stale.
- [x] Model and reasoning configuration participates in the semantic process
  fingerprint, survives the applied process projection, and is supplied with
  the targeted agent on every activation and retry.
- [x] `CodexAgentRuntime` passes explicit values through the SDK thread options
  as `model` and `modelReasoningEffort`; inherited values are omitted so Codex
  retains its normal configuration precedence.
- [x] If the pinned Codex SDK cannot express the intended current reasoning
  efforts, update it deliberately and verify compatibility rather than casting
  around its public thread-option type.
- [x] Task and attempt inspection identify the requested model and reasoning
  effort, or clearly say **Codex default** when inherited. The interface does
  not claim an inherited value was resolved unless Codex reports it.
- [x] Per-agent model selection changes neither role instructions, coordination
  tools, sandbox mode, approval policy, nor the shared user-controlled
  permission boundary.
- [x] The software-delivery example explicitly configures every agent initially
  with `gpt-5.6-sol` and `medium`, matching the current behavior while making
  role-by-role changes discoverable and reviewable.
- [x] Schema, fingerprint, application, runtime-adapter, and controlled SDK
  tests cover explicit values, inheritance, two agents with different settings,
  retries retaining the same settings, and actionable invalid or unavailable
  configuration.

## Comments

- User review after issue 20 confirmed that the board currently selects only an
  agent identity and role. All roles share one runtime and inherit the launching
  account's Codex model configuration because the application passes no model
  thread option.
- This is the explicit next implementation ticket. It is a delivery gate before
  issues 21 and 22 so subsequent process fixtures, fingerprints, persistence,
  and concurrency behavior are built on the final agent-definition shape.

## Answer

Implemented optional per-agent Codex model and reasoning-effort configuration
through schema validation, semantic fingerprinting, applied process state,
immutable activation and attempt snapshots, runtime dispatch, and task/attempt
inspection. Omitted values remain visibly and operationally delegated to the
launching user's Codex defaults. The pinned SDK already exposes the required
public thread options and supported effort union, so no dependency update or
type cast was needed.

The software-delivery example now configures every role with `gpt-5.6-sol` and
`medium`. Verification passed with typechecking, a production build, 59 local
tests (plus one intentionally skipped real-Codex integration), and all 8 browser
scenarios. Independent Standards and Spec reviews found no remaining issues.

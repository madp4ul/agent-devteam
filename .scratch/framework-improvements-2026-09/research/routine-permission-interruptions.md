# Routine permission interruptions: native reviewer guidance

Research date: 2026-10-04. Ticket: [04](../issues/04-reduce-routine-permission-interruptions.md).

## Evidence and chosen direction

The reported incidents occurred on another PC. Exact commands, reviewer rationales,
effective policy, and successful continuation text are unavailable here. The switch
to Astra is a reported correlation, not a demonstrated regression. Diagnosis remains
open. Initial research used no model runs. Subsequent usability proof below used
authenticated runs in a disposable workspace, without changing project dependencies
or active user configuration.

The user chose to explore a per-agent allowance list beside agent definitions,
feeding native `auto_review.extra_policy`. This establishes a design direction;
the schema, grant scope, lifecycle and implementation below are proposals requiring
specification. The research does not recommend automatic fabricated user assent.

Current code fixes `approval_policy = "on-request"` and `approvals_reviewer =
"auto_review"` for new and resumed attempts, inherits the sandbox mode, and adds
attachment-directory writable roots for attachment-bearing runs.
[Runtime](../../../src/runtime/codex-agent-runtime.ts).
`FRAMEWORK_GUIDANCE` distinguishes role/process responsibilities from authority:
authored context cannot redefine framework policy, and permission approval is
user-controlled. Ordinary role instructions therefore do not constitute a new grant.
[Prompt composition](../../../src/application/activation-prompt.ts).
The previous recovery solution explicitly retained user continuation after unresolved
blocks. [Issue 54](../../agent-coordination-framework/issues/54-enable-automatic-approval-review-for-agent-runs.md).

## Official support and compatibility

The current configuration reference documents additive `auto_review.extra_policy`
as local Markdown included alongside the main policy. Managed `guardian_extra_policy`
takes precedence. `auto_review.policy` is a separate replacement mechanism with
managed `guardian_policy_config` precedence. Managed requirements may constrain the
approval policy and reviewer values. Granular approval settings govern whether
prompts surface; disabling a category auto-rejects rather than approves it.
[Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference).

Auto-review receives the exact request and compact transcript, retaining sandbox
boundaries. Denials require safer alternatives or user intervention. A TUI `/approve`
override covers an exact action for one retry and still undergoes review. Official
replacement-policy guidance requires preserving the complete active policy and says
not to override if it is inaccessible. The docs recommend precise command rules and
narrow writable roots to reduce routine review volume.
[Auto-review](https://learn.chatgpt.com/docs/sandboxing/auto-review).

Installed SDK declarations and implementation confirm generic structured `config`
and raw `configOverrides`, launching `codex exec --experimental-json`. Their
`ThreadEvent` union lacks approval request/decision and reviewer-rationale events.
The installed SDK and its bundled native CLI both report version 0.154.0.
[Package](../../../node_modules/@openai/codex-sdk/package.json),
[declarations](../../../node_modules/@openai/codex-sdk/dist/index.d.ts),
[implementation](../../../node_modules/@openai/codex-sdk/dist/index.js).

Read-only CLI checks used `--version`, `debug --help`, and `app-server --help`.
CLI help exposes `--strict-config` for unrecognized config fields. SDK transport and
version checks alone do not prove effective additive-policy behavior. No effective
policy RPC or model-backed reviewer probe has been run here. Earlier 0.146.0 research
cannot establish current compatibility.

A read-only UTF-8 string scan of the bundled executable found `auto_review` and
`guardian_policy_config`, but no `extra_policy` or `guardian_extra_policy`. This is
a compatibility warning, not a definitive configuration-schema test. Additive
policy support must not be assumed merely because current official docs describe it.

A stronger offline check then launched the actual bundled executable with
`app-server --strict-config --listen stdio://`, using isolated temporary directories
as child-process `CODEX_HOME` values. Standard input closed immediately, with no
initialization request or inference turn. Four isolated config cases produced:

| Config case | Exit | Result |
| --- | --- | --- |
| `approvals_reviewer = "auto_review"` | 0 | Known baseline recognized |
| `[auto_review] unknown_probe_key = "benign probe"` | 1 | Unknown control rejected |
| `[auto_review] extra_policy = "benign probe"` | 1 | `unknown configuration field auto_review.extra_policy` |
| `[auto_review] policy = "benign probe"` | 0 | Replacement field recognized |

**The installed bundled CLI 0.154.0 does not recognize the chosen additive-policy
field under strict configuration validation.** A compatible CLI upgrade/version
decision is required before implementing this direction. Ordinary permissive config
may ignore an unknown field; a successful SDK launch is not sufficient verification.
Do not silently substitute replacement `policy`, which has different semantics and
requires preserving the complete active policy. Re-run this offline check on the
affected machine and after any proposed upgrade, then verify effective inherited
policy composition separately.

## Proposed per-agent shape

Illustrative YAML, not an agreed schema:

```yaml
agents:
  - id: implementer
    # existing name, role, instructions, model, etc.
    allowances:
      - id: local-validation
        description: >-
          Run this task workspace's existing build, lint and test scripts,
          including writing their ordinary temporary output within the workspace.
```

Use a distinct `allowances` field instead of extracting authority from `instructions`.
The user who controls process configuration must explicitly approve these grants.
Loading an arbitrary repository/process file must not silently turn its text into
user authorization. The exact trusted source and author/provenance model need a
decision; a YAML field alone proves neither authorship nor consent.

An alternative closer to the existing instructions-file pattern is an optional
allowance-file reference beside each agent definition. Capture its trusted source
content and hash during process application; never reload it from an agent-editable
task worktree to create authority. The parent inspection found that the current
process schema rejects unknown agent properties and fingerprints instruction-file
contents; allowance content needs equivalent explicit validation/versioning.
[Schema](../../../schemas/process-definition.schema.json),
[process loading](../../../src/application/internal/process-definition.ts).

The runtime can format the selected agent's approved entries as additional reviewer
context identifying agent, process, task workspace, approved scope and grant revision.
It should state that these are user-defined permissions for the named scope, while
native policy and managed restrictions remain authoritative. The runtime must not
write “I allow it” as a user utterance or represent its own judgment as user consent.

This is reviewer guidance, **not a hard whitelist**. The native reviewer remains
nondeterministic and can deny listed actions; absence from this list need not forbid
ordinary actions otherwise permitted by policy. Natural-language allowances do not
deterministically validate command arguments or side effects. A hard allow-only
execution boundary would require a different design.

## Inherited policy and lifecycle questions

Passing generated `auto_review.extra_policy` as a CLI override can replace the user's
existing local value. Do not assume the native setting appends across configuration
layers. Specification must choose how to obtain and preserve effective inherited
extra policy, combine it with the approved per-agent scope, and retain managed
precedence. Managed policy may suppress local text; the framework must not evade
that with prompt injection. Never replace the main reviewer policy merely to add
allowances. Unsupported/missing policy discovery must produce an explicit
configuration limitation rather than silently discard policy.

Suggested lifecycle, pending the repository's process-versioning decision:

- Capture approved allowance entries and their provenance/revision with the
  authoritative run request. Persist enough evidence to explain the supplied policy.
- Apply native reviewer guidance on every SDK attempt, including resumed threads;
  do not depend on full role prompts being repeated. Existing prompt composition
  abbreviates returning activations and continuations.
- Define whether policy is immutable for an activation or refreshed at each attempt.
  A later revocation must prevent new attempts from using stale grants, even where
  task context/history is a dispatch snapshot. This needs an explicit exception or
  version check in the chosen snapshot model.
- An in-flight process already has its configuration. Editing the allowance list
  cannot revoke it retroactively. Decide whether immediate revocation interrupts
  running attempts or takes effect at the next attempt; disclose that boundary.
- Recovered/replacement conversations must apply the current valid delegation and
  retain original evidence without presenting expired grants as current.
- Keep task comments, pins, agent messages and coordination tools unable to create,
  broaden or revoke user grants. Process-edit authority itself must be identified.

Parent source inspection reports that applied process changes stale pending
activations, while an already active attempt retains its loaded configuration.
Pausing automation prevents new starts and drains active work; immediate withdrawal
requires interrupting the active attempt as well as applying the changed trusted
process. Therefore pause alone is not revocation of an in-flight allowance.
These details must be reconciled with snapshot persistence in the specification.

The domain model currently describes shared user capability boundaries rather than
per-role permission policy. Per-agent delegated reviewer scope requires explicitly
reviewing that wording and decision, even while native runtime enforcement remains
authoritative. [Domain model](../../../CONTEXT.md).

## Alternatives and tradeoffs

These are design judgments; no option has demonstrated reduction for these incidents.

| Option | Expected scope/benefit | Approval risk | Audit/cost and recovery |
| --- | --- | --- | --- |
| User-approved per-agent additive policy | More explicit reviewer context using existing runtime | Reviewer may misinterpret vague grants or still deny | Low integration cost if effective policy is accessible; record grant/revision; revoke for future attempts |
| Direct bounded user preauthorization | Minimal experiment to test missing authorization | Ambiguous wording and retained-history limits | Lowest change cost; retain actual author/context; existing continuation |
| Precise native allow rules | Skip review for stable command shapes outside sandbox | Broad prefixes admit unintended arguments/targets | Test matching; remove rule/restart; requires real patterns and PowerShell proof |
| Narrow writable-root correction | Removes escalation for intentionally writable locations | Broad roots expand file authority | Simple configuration; restore roots/restart; needs diagnosed target |
| Replacement reviewer policy | Deep customization | Losing existing rules | Higher maintenance; preserve/restore complete active policy |
| `never` or broad full access | Suppress prompts; full access expands execution authority | Loss of review or broad authority | Simple config, substantial trust change; restore boundaries |
| Framework allowance messages | May influence subsequent context | Fabricated authority or repeated assent after denial | Extra retry/provenance machinery; inappropriate default |
| App-server plus delegated matcher | Decision at concrete approval request | Matching errors and opaque side effects | High runtime migration/persistence/lifecycle cost; decline ambiguity |

Native rules support allow/prompt/forbidden with strictest matching decision winning;
allow runs matching commands outside sandbox without prompting. Rules load at startup,
project rules require trust, and matching can be checked with `codex execpolicy check`.
The documented compound-script handling covers bash/zsh/sh, not established
PowerShell behavior. [Rules](https://learn.chatgpt.com/docs/agent-configuration/rules).

`never` suppresses approval prompts without independently removing filesystem/network
restrictions. Full access pairs `danger-full-access` with `never`; therefore `never`
alone is not a general remedy for work needing escalation.
[Sandboxing](https://learn.chatgpt.com/docs/sandboxing).

App-server exposes approval RPCs with action/context identifiers, accept/decline/cancel
decisions, session approvals, execpolicy amendments and scoped permission subsets.
This supports a concrete decision boundary, but requires transport/request state,
cancellation/restart recovery, transcript/usage adaptation and versioned schemas.
It does not provide delegated authority by itself.
[App-server](https://learn.chatgpt.com/docs/app-server).

## Live verification and historical next-work proposal

### 2026-10-04 live usability proof

Stable npm `latest` was SDK 0.160.0, with an exact dependency on CLI 0.160.0.
An isolated temporary install left the project's 0.154.0 dependency unchanged.
Its Windows executable accepted `extra_policy` under strict validation and rejected
an unknown control. SDK inspection verified exact multiline/escaped text on fresh
and resumed subprocess arguments.

Two live SDK runs (fresh/resumed), using `on-request`, `auto_review`, a read-only
sandbox and GPT-6 Astra, failed to deliver their extra-policy markers. Scoped
escalated writes were allowed. Read-only app-server `config/read` showed the
field loaded; `configRequirements/read` returned no managed requirements.

The actual reviewer was `codex-auto-review`. Its catalog field
`model_messages.auto_review.policy_template` had 9,734 characters and contained
`{{ tenant_policy_config }}` but no `{{ extra_policy }}`. The renderer substitutes
that slot without an append fallback; its unit test explicitly expects omission
when the slot is missing.
[Renderer](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/prompts/src/guardian_instructions.rs#L55-L62),
[omission test](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/prompts/src/guardian_instructions_tests.rs#L49-L52).
The checked 0.162.0-alpha.12 renderer also has no fallback.

The positive proof used the native experimental template override with only the
[public 0.160.0 template](https://raw.githubusercontent.com/openai/codex/rust-v0.160.0/codex-rs/prompts/templates/guardian/policy_template.md).
Removing its extra-policy slot matched the active supplied template exactly after
LF normalization (SHA-256
`f47fbb2bdba5e7528bfae7f5e2844a7d45a3a922fa74b718f22b22917376cfcf`).
No main policy text was replaced or lost. The native override path is confirmed by
[configuration source](https://github.com/openai/codex/blob/rust-v0.160.0/codex-rs/core/src/config/mod.rs#L3793-L3811).

| SDK run with the missing slot restored | Observed result |
| --- | --- |
| Fresh | Extra policy denied one disposable write. Reviewer base instructions contained `EXTRA_REVIEWER_DELIVERED_04_PUBLIC_TEMPLATE`; rationale repeated it, outcome was deny and command status was declined. |
| Resumed | Changed extra policy authorized a different disposable write. Reviewer base instructions contained `EXTRA_REVIEWER_ALLOW_04_RESUMED` without the prior denial marker; rationale repeated the new marker, outcome was allow and command exited 0. |

Markers were supplied only in reviewer policy, not the coding agent's user prompt.
Guardian rollouts confirmed base-instruction presence and decision evidence without
printing private policy text. This proves actual delivery/application and per-run
refresh on resume, not merely serialization. It does not measure real development
interruption reduction or guarantee future review decisions.

Automatic approval review rejected the initial cached-template test as potential
internal-policy disclosure; it did not execute. After verifying public-source
equality locally, the safer test used exclusively public template text and was
approved. No rejected action was bypassed.

Recommendation: stable SDK 0.160.0 makes the mechanism usable **with explicit
template compatibility handling**. Upgrade alone is insufficient on this account.
Prefer a corrected supplied template; a temporary experimental override needs an
explicit choice and checks preserving current complete policy, avoiding stale
policy pinning, and retiring the override when the native slot exists. Intake 04
was converted to grilling for those choices and the allowance/lifecycle design. The accepted decision below now supersedes that intermediate state.

1. Specify user-authorized allowance ownership, field shape, precise scope, provenance,
   snapshot/resume/revocation semantics, inherited-policy composition and managed
   precedence. Explicitly keep the main reviewer policy and independent boundaries.
2. Resolve the demonstrated CLI 0.154.0 incompatibility, then verify replacement
   executable recognition and effective configuration without inference;
   then authorize a controlled reviewer probe separately if needed. Test inherited
   local text, managed precedence, missing/blank lists and unsupported configuration.
3. Implement transport only after those decisions, with meaningful tests for fresh,
   resumed and recovered attempts, per-agent isolation, provenance, preservation of
   unrelated settings and revocation. No prompt-authored fabricated assent.
4. Retain incident diagnosis as separate evidence work on the affected machine:
   command/directory, first sandbox failure versus escalation rationale, effective
   runtime/policy, role instructions, and actual successful user continuation.

Follow-through now stays in [intake 04](../issues/04-reduce-routine-permission-interruptions.md),
now converted to implementation after user approval. This supersedes the preliminary separate
allowance research split. Implementation tickets follow the agreed specification;
this note does not mark the feature implemented or prove an Astra regression.

The two existing focused runtime tests for automatic reviewer configuration and
explicit coordination permission reporting passed during initial investigation.
These verify framework configuration/outcome handling, not a live reviewer's
approval rate. No production runtime or dependency changes were made; research/tracker edits
remain unstaged.

## Accepted decision and maturity assessment — 2026-10-04

The user stated that all questions were answered and approved implementation as
an optional add-on to the existing approval mechanism. User-defined guidance
alongside agent definitions is passed to native Auto-review while supported.
If the add-on no longer works, execution falls back to today's behavior. A real
reviewer denial still requires the existing explicit user-continuation path;
it must not trigger a retry with the add-on removed.

The documented setting is credible enough for an isolated optional integration,
but no explicit feature-specific stability guarantee was established. The
experimental template override is the weakest compatibility seam. A pinned SDK
cannot freeze supplied model templates, and public release status is not a
promise that every configuration feature stays unchanged. Removal is possible,
not established as likely or inevitable.
[Configuration reference](https://learn.chatgpt.com/docs/config-file/config-reference),
[feature maturity](https://learn.chatgpt.com/docs/feature-maturity),
[SDK documentation](https://learn.chatgpt.com/docs/codex-sdk).

The implementation must preserve complete current policy, prefer corrected
native delivery, retire temporary repair when unnecessary, and fall back if safe
composition or delivery cannot be established. Do not permanently replace a
changing reviewer template with the old public template used in the proof.

The [agreed specification](../04-reviewer-allowances-spec.md) records the user
contract, implementation defaults, trust/lifecycle constraints and verification.
[Ticket 04](../issues/04-reduce-routine-permission-interruptions.md) is the single
implementation ticket in the current intake. Earlier proposed research/grilling
steps are historical, not outstanding approval gates. Production code and the
project dependency remain unchanged at this documentation handoff.

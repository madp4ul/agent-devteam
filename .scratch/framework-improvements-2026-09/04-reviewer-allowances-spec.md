# Ticket 04 — Optional per-agent reviewer allowances

Agreed direction: 2026-10-04. Implementation authorized by the user.
Delivery: [ticket 04](issues/04-reduce-routine-permission-interruptions.md).
Evidence: [research and live probes](research/routine-permission-interruptions.md).
This specification stays in the current intake at the user's request; no separate
effort or further design interview is required.

## User-approved behavior

The user defines extra guidance alongside process agent definitions describing
work that agent is authorized to do. The framework passes that guidance to the
existing native Auto-review reviewer as an optional add-on. It should reduce
requests to repeat authorization already given by the user.

This is standing authorization guidance, not a guarantee that every matching
command will be approved, nor a hard allow-only command enforcement system.
Independent runtime, sandbox, managed-policy and user capability boundaries
remain authoritative. Keep `on-request` plus `auto_review` and the existing
permission-block/user-continuation mechanism.

If the add-on is unsupported or stops working, disable it and fall back to today's
behavior. Compatibility failure must not make agent execution depend on this
feature. A reviewer **denial** is not a compatibility failure: preserve the denial
and existing explicit user-continuation path. Never retry a denied action by
dropping guidance, fabricate user assent, or broaden sandbox access.

The user accepts that the feature may change or disappear. Removal is a risk,
not a prediction. Implementation should isolate that risk rather than replace the
working baseline approval mechanism.

## Verified usability and maturity

- Repository SDK/CLI 0.154.0 rejects `auto_review.extra_policy` under strict
  validation. Stable SDK 0.160.0 bundles CLI 0.160.0 and accepts it.
- Native SDK fresh/resumed runs transported the exact policy. Actual delivery
  failed with the account's supplied `codex-auto-review` template because it
  lacks `{{ extra_policy }}`. Config acceptance alone proves insufficient.
- A native `auto_review.experimental_policy_template` override using the public
  0.160.0 template restored delivery. The public template matched the active
  supplied template after removing only the extra-policy slot and normalizing
  line endings. This preserved all existing main policy text in the proof.
- Live fresh-run denial and resumed-run allowance each used their own marker
  supplied only in reviewer policy. Reviewer base instructions and rationales
  proved application and refresh; the controlled command outcomes matched.
- `extra_policy` is documented; the template override is experimental and absent
  from the public configuration reference checked during research. Stable npm
  release status does not establish a compatibility promise for either feature.
- SDK pinning does not freeze server-supplied model templates. Template delivery
  can change independently of dependency updates. There is no evidence proving
  the original reported Astra regression or a measured interruption reduction.

Primary sources and reproducible evidence are linked in the research note.

## Implementation defaults and constraints

The following are implementation guidance derived from the approved behavior,
not additional choices explicitly dictated by the user. Resolve routine details
within these constraints without reopening the completed design interview.

### Definition, trust and lifecycle

Prefer an optional `allowances` list of nonblank natural-language strings on each
process agent definition. Absence means baseline behavior. Use precise examples
in process documentation; do not infer authorization from arbitrary task content,
role instructions or agent-edited workspace files.

Use the authoritative user-applied process definition. Include allowance content
in its semantic version/fingerprint. Apply only the selected agent's guidance;
record the applied version and exact guidance or immutable equivalent evidence
for each attempt, including whether the add-on was active or unavailable.
Follow released migration conventions if persistence changes require migration.

Refresh guidance when starting fresh, resumed, replacement and recovered attempts.
Use existing process-version/stale-activation rules when a definition changes.
An already running turn retains its start-time configuration. Existing pause
drains running work; immediate revocation requires the existing interruption
mechanism before restarting under revised guidance. Do not invent live revocation
of an already submitted reviewer request.

### Runtime adapter and policy composition

Keep native config names, supported-version checks, template handling and fallback
inside a small runtime adapter. Allowance data must not depend on Codex config
syntax. Update the SDK dependency to a verified compatible stable release;
0.160.0 is the proven baseline, not a claim about all future releases.

Preserve inherited extra reviewer guidance and native managed-policy precedence.
Setting a scalar config override does not automatically append existing text.
Establish safe composition before enabling the add-on; if existing effective
guidance cannot be preserved, use baseline behavior and report the reason.
Do not move guidance into another policy field to evade managed precedence.

Prefer a supplied template that already delivers the extra-policy slot. A
temporary experimental template repair is acceptable only when compatibility
checks establish preservation of the complete current policy. The research's
public-template equality proof is evidence for that particular template, not
permission to replace future templates with a permanently pinned old policy.
If preservation or delivery cannot be established, omit the add-on. Retire the
repair when supplied native delivery works.

Capability checks must cover actual delivery, not just config parsing or SDK
argument serialization. Use local compatibility checks plus controlled native
verification for supported releases/template changes; do not incur an extra
reviewer/model call for every normal task attempt.

### Fallback and diagnostics

Fallback omits add-on configuration and retains today's baseline settings. Record
a concise compatibility reason so silent loss of guidance is inspectable; the
add-on being unavailable alone does not create formal user attention or block work.

A rejected optional configuration before a turn starts can be retried using
baseline configuration. Once work may have started, do not blindly replay a turn
or side effects; follow existing failure/recovery handling. Scope fallback to
recognized add-on compatibility failures, not arbitrary SDK or command errors.

Do not introduce a custom reviewer, automatic permission replies, new approval
wizard, process-specific sandbox roots, or replacement main reviewer policy.

## Delivery and verification

Existing seams to inspect before coding:

- `schemas/process-definition.schema.json` and
  `src/application/internal/process-definition.ts`: validation and fingerprint.
- Applied-process persistence and activation scheduling: authoritative agent
  selection, per-attempt evidence and process-version/recovery behavior.
- `src/runtime/codex-agent-runtime.ts`: per-attempt SDK client construction,
  fresh/resumed execution and baseline approval configuration.
- Existing permission projection and explicit user continuation: preserve behavior.

Meaningful tests must cover omitted/blank/invalid definitions, fingerprint changes,
per-agent isolation, fresh/resumed/replacement policy refresh, preserved inherited
and managed policy behavior, unsupported keys and missing-template delivery,
safe fallback, and reviewer denial without automatic downgrade/retry.
Retain a controlled native verification path for actual reviewer delivery and
application; a mock of config arguments alone cannot establish that behavior.

Run appropriate type checks and relevant tests once implementation exists. Update
`docs/architecture.md` and domain/ADR documentation in the implementation change
when implemented ownership or runtime flow changes. Documentation-only preparation
does not imply that production behavior or dependencies have changed.

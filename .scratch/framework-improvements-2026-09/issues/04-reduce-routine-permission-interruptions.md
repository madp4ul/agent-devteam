# 04 — Reduce routine command permission interruptions

**Type:** task
**Status:** resolved
**Blocked by:** None
**Labels:** user-review
**Next step:** User review.
**Specification:** [Optional per-agent reviewer allowances](../04-reviewer-allowances-spec.md).

## Accepted decision — 2026-10-04

The user considers the design questions answered and authorizes implementation.
Add user-defined allowance guidance alongside agent definitions and pass it to
native Auto-review while supported. If the add-on becomes unavailable, continue
with today's approval behavior. This accepts compatibility risk without making
execution depend on the add-on. A real reviewer denial still follows the existing
permission-block and explicit user-continuation path.

The specification retains the demonstrated missing-template-slot issue, maturity
limits, safe composition and fallback constraints, and implementation defaults.
Do not repeat the research or reopen a design interview as a prerequisite.

## Implementation acceptance criteria

- [x] Validate optional agent allowance guidance and include it in process versions.
- [x] Use the authoritative applied process; isolate selected-agent guidance and
      retain per-attempt provenance through fresh, resumed and recovered execution.
- [x] Upgrade to a verified compatible SDK and isolate native policy integration.
- [x] Preserve inherited/managed policy and complete current reviewer instructions;
      detect missing delivery rather than treating config acceptance as proof.
- [x] Fall back to baseline on recognized add-on incompatibility, without replaying
      work that may have started or retrying reviewer denials with weaker guidance.
- [x] Verify lifecycle, composition, delivery and fallback with meaningful coverage;
      document the implemented runtime/domain changes and remaining limitations.

## Problem and goal

The user reports more command denials since switching agents to GPT-6 Astra,
despite role instructions saying the work should be allowed. This is an observed
correlation, not an established model or approval-system regression. In reported
cases, replying with essentially “I allow it” allowed the agent to continue.

The goal is fewer interruptions for mundane work the user intends to authorize.
The user prefers a simple solution and considers a custom approval system a
potentially expensive last resort.

## Alternatives raised by the user

- Improve the current approval arrangement through a simpler supported mechanism.
- Explore framework-provided allowance prompts as a last resort.
- Explore process-defined allowlisted actions checked by a separate review agent;
  after a match, the framework would automatically provide an allowance message.

These are research hypotheses, not authorization to implement automatic assent.
Any design must distinguish actual user-delegated authority from agent inference
and represent the author/source of an automated decision honestly.

## Historical investigation criteria

- [ ] Capture representative commands, denial reasons, effective runtime policy,
  role instructions, and the subsequent user continuation that succeeded.
- [ ] Distinguish approval-review rejection from sandbox restrictions, missing
  permissions, unclear authorization, and agent reluctance to request approval.
- [x] Evaluate current supported configuration and explicit preauthorization
  mechanisms before proposing another reviewer or prompt-based workaround.
- [x] Compare alternatives for interruption reduction, scope, false approvals,
  auditability, operational cost, and failure/recovery behavior.
- [ ] If delegation is proposed, define who grants it, action matching, ambiguity,
  revocation, and boundaries the framework cannot override.
- [ ] Record a recommendation and publish follow-up implementation tickets if needed.

## Existing boundary to preserve

The domain model currently assigns permission policy to the runtime and reuses
shared user capability boundaries, rather than process/role permissions.
[Previous approval work](../../agent-coordination-framework/issues/54-enable-automatic-approval-review-for-agent-runs.md)
introduced automatic review and explicit user continuation for unresolved blocks.
A process allowlist or framework-authored approval mechanism would require an
explicit review of those decisions, not an assumed extension of role instructions.

## Research result and resolved design handoff

Stable `@openai/codex-sdk` 0.160.0 bundles Codex CLI 0.160.0 and can transport
native additional reviewer policy on fresh and resumed runs. Authenticated SDK
probes verified that the reviewer receives and applies it **with a template
compatibility fix**. This proves mechanism usability, not a measured reduction
in the original reported interruptions.

The account's supplied `codex-auto-review` template lacks `{{ extra_policy }}`.
Without that slot, the setting loads but its text is silently omitted. The checked
alpha renderer has the same behavior. A temporary native
`auto_review.experimental_policy_template` override using the public 0.160.0
template restored delivery. That public template matched the active template
exactly except for the missing slot; the main policy was preserved.

The fresh-run reviewer denied a controlled write using a marker found only in
the extra policy. On resume, its base instructions contained the new allowance
marker instead of the old denial marker, and it approved a different disposable
write with the new marker in its rationale. No project dependency or active user
configuration changed. [Detailed evidence](../research/routine-permission-interruptions.md).

The agreed specification now governs implementation. The original incident cannot
be diagnosed without examples from the affected PC; that does not block the
user-approved optional add-on. Preliminary separate allowance tickets are
superseded; delivery stays in this ticket and the current intake.

## Comments

- 2026-10-04: After the maturity discussion, the user approved an optional add-on
  with fallback to today's behavior and stated that all design questions were
  answered. Converted this same ticket to implementation and retained the agreed
  specification in the current intake. Production implementation remains pending.

- 2026-10-04: User requested continued verification, then conversion of this
  ticket or a follow-up in the current intake. Converted this ticket to grilling
  after live fresh/resumed delivery proof. Upgrading alone is insufficient with
  the supplied template; its compatibility fix remains an explicit design choice.
  No implementation or production dependency/configuration changes were made.
- 2026-10-04: Offline strict-config probes show that bundled Codex 0.154.0 rejects
  `auto_review.extra_policy` as an unknown configuration field. The baseline and
  replacement `auto_review.policy` pass; an unknown control fails. No model call
  or active configuration change was made. The selected additive approach needs
  a compatible runtime; replacement policy is not an equivalent fallback.
  [Findings](../research/routine-permission-interruptions.md) and
  [follow-up research/design tickets](../../agent-reviewer-allowances/map.md)
  retain the recommendation and open decisions. Incident diagnosis remains open.
- 2026-10-04: User selected further research into an explicit allowance list
  alongside each agent definition, supplied as native extra reviewer policy.
  This matches the original per-agent allowlist suggestion. Research should
  evaluate trusted user authorship, runtime compatibility, inherited-policy
  composition, process-version/attempt provenance, and revocation. No specific
  policy, schema, or implementation has been approved yet.
- 2026-10-04: Investigation started. The reported denials occurred on another PC;
  the user cannot supply representative commands or denial/continuation logs in
  this session. Research can establish framework behavior and supported options,
  but cannot establish the reported cause or a model regression. Findings will
  be retained in [research notes](../research/routine-permission-interruptions.md).
- 2026-09-20: User-described GitHub issue. No runtime change or workaround applied.

## Answer

2026-10-04: Implemented the optional native reviewer add-on. Process agents accept
`allowances` lists; the applied definition and semantic version own their source.
Released migration 0009 retains applied guidance and per-attempt snapshots.
Runtime lifecycle records configuration availability, compatibility reason and
policy/template hashes without copying private reviewer policy into attempt history.

Pinned SDK/CLI 0.160.0. The isolated runtime adapter reads effective native config
and catalog metadata, preserves inherited local extra guidance, and repairs only
the exact verified public template's missing extra-policy slot. Native templates
with the correct slot need no override. Unknown versions/providers/templates,
managed requirements or failed inspection use baseline approval behavior.
A recognized optional-config rejection may retry baseline only before any event;
reviewer denials and work that may have started are never downgraded or replayed.
No new sandbox/network/Git capability or automatic user assent was introduced.

Fresh, resumed and replacement turns use current selected-agent guidance. Tests
verify that unapplied file edits cannot alter running-host authority, another
agent receives no inherited role grants, and removing allowances makes queued
work stale until user rebase. Historical attempt evidence survives that change.
Architecture, process reference, glossary and ADR 0024 document ownership and
compatibility limits. Earlier incident criteria remain historical: this does
not establish the reported Astra regression or an approval-rate improvement.

Validation: `pnpm typecheck` passed. Full `pnpm test`: 378 tests, 373 passed,
zero failed, five opt-in native/platform probes skipped. The new native probe
was separately enabled and passed: reviewer-only markers demonstrated an exact
fresh-run denial and a different authorized write after resume with changed
policy; disposable files were removed. Migration startup/upgrade/rollback tests
pass with existing released fixtures unchanged and a new 0009 fixture.

Standards review: no findings. Specification review: one missing lifecycle test
was addressed and re-reviewed; no remaining findings. Changes are unstaged; no
staging, commits or pushes were performed. Ready for user review.

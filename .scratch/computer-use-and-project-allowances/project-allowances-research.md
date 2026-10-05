# Launch-time project allowance guidance

Investigation for [ticket 02](issues/02-launch-time-project-allowances.md), 2026-10-05.
This is an implementation recommendation; no runtime, process or live policy was changed.

## Recommendation

Add `start --additional-allowances <text>` as a launch-only, project-wide source
of reviewer authorization guidance. Keep the text separate from the process
agent's allowance list and append it after that list when composing native
`auto_review.extra_policy`. Preserve inherited native guidance first. Every
framework-dispatched agent receives the project source, including agents with
no process allowances. This does not grant Computer Use app access, widen
sandbox/network/managed permissions or resolve ticket 01.

Hold active launch configuration in one application instance, immutable until
restart. Persist it only as historical attempt evidence, never as configuration
to reload. Select it at attempt claim, not activation creation. Each new attempt
uses the current launch configuration; an existing attempt retains its selected
sources and submitted configuration. Process changes retain the current
fingerprint and stale-work gate; launch changes do not make activations stale.

## Findings from the implemented system

| Boundary | Evidence and implication |
| --- | --- |
| CLI | [`src/cli.ts:50`](../../src/cli.ts#L50) creates one project host; lines 131–141 pass project-scoped runtime dispatch to `CoordinationApplication.start`. `readOption` at line 229 simply reads the next token: a missing final value becomes omission and a following option can become its value. The new flag needs explicit validation before state binding/host startup. |
| Claim | [`activation-scheduling-module.ts:64`](../../src/application/internal/activation-scheduling-module.ts#L64) selects queued, non-stale work. Lines 97–113 read the applied selected agent; lines 128–141 snapshot process allowances in `attempts.reviewer_allowances_json`. A role with no process allowances currently has no evidence object. Select project guidance in this same claim transaction. |
| Dispatch | [`automation-coordinator.ts:251`](../../src/application/internal/automation-coordinator.ts#L251) claims before workspace provisioning; lines 371–403 build the runtime request and lifecycle callback. Carry the claim's copied guidance into that request rather than reading live configuration again. |
| Delivery | [`codex-agent-runtime.ts:119`](../../src/runtime/codex-agent-runtime.ts#L119) prepares policy only for nonempty process allowances. Preparation precedes fresh/resumed thread selection; `replacementRequest` at lines 304–318 spreads the original request. Broaden the gate to either source and preserve request fields on replacement. |
| Composition | [`codex-reviewer-allowances.ts:61`](../../src/runtime/codex-reviewer-allowances.ts#L61) renders process source/version/agent and JSON entries, prepends inherited `extra_policy`, and hashes the result. It currently returns hashes rather than exact composed text. Append a distinctly labeled project section; do not put project text into `agent.allowances`. |
| Native policy | [`native-reviewer-policy-inspector.ts:28`](../../src/runtime/native-reviewer-policy-inspector.ts#L28) reads effective configuration against the task workspace; lines 86–87 read config and managed requirements. Preserve that scope. The current protocol returns effective config, not individual layer identity (`includeLayers: false`); label inherited text as effective native configuration for that workspace, without inventing a config-file owner. |
| Evidence updates | [`active-attempt-module.ts:305`](../../src/application/internal/active-attempt-module.ts#L305) reconstructs evidence from just process version/list and callback fields. It would erase added sources. Preserve immutable source fields explicitly while updating delivery evidence; preserve earlier configuration selections when fallback changes status. |
| Reads | [`task-projection-store.ts:817`](../../src/application/internal/task-projection-store.ts#L817) reads the existing JSON column and exposes it as attempt evidence. [`runtime-contract.ts`](../../src/application/runtime-contract.ts) owns request, lifecycle and evidence types. Extend those contracts and make historical missing fields explicit. No database schema alteration is necessary for additive JSON evidence. |
| Restart | [`active-attempt-module.ts:69`](../../src/application/internal/active-attempt-module.ts#L69) retains interrupted host attempts as failed and applies ordinary technical recovery. Do not revise their source evidence. Startup is paused and process version changes alone drive stale work in [`process-state-store.ts:154`](../../src/application/internal/process-state-store.ts#L154). |

The governing contracts are [ADR 0024](../../docs/adr/0024-treat-reviewer-allowances-as-an-optional-runtime-add-on.md),
[the allowance reference](../../docs/process-definition-reference.md#optional-reviewer-allowances),
[architecture](../../docs/architecture.md#automation-and-agent-runtime), and
[the domain context](../../CONTEXT.md). They distinguish allowance guidance from
permission policy and require visible compatibility fallback. The recommendation
extends their trusted sources; it does not supersede their restrictions.

## Implementation contract

### Input and ownership

- Use the singular optional free-text flag `--additional-allowances`. Preserve
  the exact received nonblank string, including multiline text; use `trim()`
  only to decide whether it is absent. Empty/whitespace text adds nothing.
- Reject a missing value, a value position occupied by another option, or
  repeated occurrences with exit code 2 and a specific usage diagnostic before
  project-state operations. Support `--additional-allowances=<text>` if text
  begins with `--`; document that form. Do not silently take the first duplicate.
- Add a separate optional field to `RuntimeDispatchOptions`, passed through CLI
  composition. The automation instance owns a copied immutable launch source
  (text, launch/session UUID, content hash, normalized repository path, source
  kind `launch-argument`, option name). Generate identity once per host launch,
  not per attempt; repeated launches with identical text share a content hash
  but have different session identity. The database/attempt scope and repository
  path bind evidence to the project; a UUID is identity, not a permission token.
- Pass that source into `claimNextRunnable` and copy it onto `ClaimedActivation`
  and a separate `AgentRunRequest` field. Avoid global variables, mutable shared
  runtime state, process YAML mutation or recovery from old attempt evidence.
- Do not add file, task-comment, MCP, browser editing, environment auto-loading,
  per-agent or persisted project-configuration sources in this version. A human
  launcher may explicitly supply the argument every time; its presence is the
  authorization source, not discovery of a repository file by the framework.

### Composition and exact evidence

At claim, record process definition version, selected agent identity, exact
process list, and project source (including absence) as a versioned evidence
envelope in the existing JSON column. Create it when either framework source is
present. Leave the ordinary no-source path unchanged. At runtime preparation,
compose exactly once in this order:

1. The inherited native `extra_policy`, preserved verbatim.
2. The existing labeled process section when the process list is nonempty.
3. A labeled project launch section with project/source identity and exact text,
   explicitly supplemental to the existing reviewer policy and restrictions.

Render free text as data (for example a JSON string in the source section) so
user text cannot accidentally obscure the framework's source delimiters. Keep
raw text in evidence too. Source labels express provenance, not stronger policy
priority. Conflicting text remains subject to existing policy and review.

Extend `ReviewerPolicyConfiguration`/preparation to return only the relevant
inherited guidance string, its native workspace/config source identity and hash,
and the exact rendered `extra_policy` string and hash selected for delivery.
Do not dump unrelated config/authentication into evidence or console output.
Persist runtime evidence through the existing application lifecycle callback,
before running the selected client. Store the template hash and verified native
version alongside the source evidence. This is the exact additional guidance
configured for the attempt, not proof that the reviewer read it or approved work.

Keep `pending`, `active` and `unavailable` meanings. For compatibility failure
before composition, retain selected framework sources and a reason; explicitly
mark inherited/composed evidence unavailable instead of guessing. Preserve the
prepared/submitted guidance when a subsequent recognized configuration rejection
switches to baseline, with a delivery selection history (optional selected, then
baseline selected). The final status is `unavailable`; rejected optional text
must not be described as baseline-delivered. Unexpected interruption can leave
`pending`, meaning unverified delivery. Baseline native policy is not fully
snapshotted by this feature. Historical JSON without the new envelope remains
readable and reports unrecorded fields, never reconstructed launch/native text.

Keep all native compatibility gates and template repair restrictions unchanged
([adapter lines 29–59](../../src/runtime/codex-reviewer-allowances.ts#L29)). Only
recognized optional-config rejection before any observable event permits baseline
replay ([runtime lines 240–246](../../src/runtime/codex-agent-runtime.ts#L240)).
Real denials retain existing explicit continuation, and cancellation or possibly
executed work never gets a new automatic replay rule.

### Lifetime and recovery

| Situation | Guidance rule |
| --- | --- |
| Fresh attempt, resumed thread, replacement thread | Same immutable selected sources for that attempt, submitted through runtime config on every path; do not rely on old thread prompt text. |
| Queued activation across restart | Read current launch source at claim. No launch fingerprint/stale gate; startup pause is the user checkpoint. |
| Automatic technical retry, explicit retry, interruption Continue | New attempt selects current launch source. Preserve activation reason, conversation, existing retry policy and process stale-work checks. |
| Restart with changed text or no option | Future attempts use changed text or no project guidance. Never rehydrate authorization from history, local Git binding or process state. |
| Running attempt / claimed work preparing a workspace | Retain the claim's sources. No hot editing API. Pause drains running work; use existing interruption for immediate revocation before relaunching. |
| Provisional claim released, workspace startup failure or obsolete stall recovery | Keep current scheduler deletion/release semantics; no new evidence-only attempt. A subsequent real claim selects the current source. |
| Host stops after claim | Preserve whatever attempt evidence recovery currently retains, including pending/unknown delivery; a later attempt gets the new launch source. |
| Another project in the same Node process/runtime | Its own instance/claim has its own source. Never cache project guidance on a shared runtime or merge it into shared native configuration. |

Process allowance changes still affect the semantic process fingerprint and
require stale-work approval. Launch text/session identity belongs only in launch
and attempt evidence. A launch-only change does not require a full model prompt
composition or process rebase: reviewer config is refreshed independently on each
attempt. No guidance is appended cumulatively from preceding resumed attempts.

## Validation and documentation

Ran `node --experimental-strip-types --test test/runtime/codex-reviewer-allowances.test.ts test/application/reviewer-allowances.test.ts`:
8 passed, 0 failed. These are existing mocked-runtime/disposable-fixture tests,
not proof of the proposed feature or a live Computer Use/native reviewer check.
No live policy or managed settings were inspected or edited.

Extend those suites with project-only and mixed sources, inherited exact text,
blank/omitted values, fresh/resumed/replacement propagation, no accumulation,
shared-runtime project isolation, exact history and fallback selection history.
Add retained-database restart tests for changed/removal guidance with queued,
backoff retry and interrupted/continued work; process-only changes must still
produce stale work. Cover provisional release and stopped-host pending evidence.
CLI subprocess tests must check bad input before binding and exact argv text
with spaces, quotes and multiline strings. The existing opt-in
[native probe](../../test/integration/real-codex-reviewer-allowances.test.ts)
can verify project-only reviewer consumption when explicitly run during delivery;
do not run model calls as part of ordinary unit tests.

Document simple Windows usage in `docs/tutorials/start-a-process.md`, e.g.
`node --experimental-strip-types src/cli.ts start --project . --additional-allowances "Run project validation in the approved browser."`.
The existing `start.cmd` forwards `%*`; test PowerShell and cmd quoting rather
than promising arbitrary quote/metacharacter preservation through pnpm/cmd.
Recommend a direct Node argument-array launcher for complex multiline text.
Add startup output that reports source presence/identity and the omission/removal
rule without logging its private text. Update the runtime/configuration reference,
domain source wording, architecture ownership/flow, and an ADR extending 0024
in the implementation change. These docs remain descriptions of the currently
implemented system until then.

## Delivery

The user requested direct implementation under ticket 02. The proposed follow-through tickets were removed; this note records investigation evidence, not an additional delivery workflow.


# 02 — Add project-wide reviewer allowance text at framework launch

**Type:** task
**Status:** resolved
**Blocked by:** None

## Problem and desired behavior

A reusable process serves projects with different skills and external capability
needs. Process allowances authorize role responsibilities; project authorization
must not require copying or specializing the shared process definition.

Add an optional start parameter, provisionally
`--additional-allowances "<user-authored text>"`. Append this text to the process
allowances supplied to every framework-launched agent in this project, including
roles with no process allowances. Keep this first version project-wide, with no
per-agent configuration or new permission-management UI.

A project launcher could describe authorized Computer Use validation in relevant
apps. This is reviewer guidance, not a Computer Use app grant; do not present it
as a fix for issue 01. The two efforts can proceed independently.

## Acceptance criteria

- Parse the optional text at startup, reject missing arguments clearly, and
  document Windows quoting and CLI usage. Omitted/blank text adds no guidance.
- Source standing authorization from user-controlled launch configuration, not
  agent-edited files or task comments.
- Compose inherited reviewer guidance, process allowances and launch text
  additively with distinguishable sources and existing restrictions preserved.
  Project-only text triggers optional delivery even for agents with no allowances.
- Apply to fresh, resumed and replacement attempts across every project agent;
  keep projects isolated. Running attempts retain their submitted guidance.
- Snapshot exact effective guidance and source identity with each attempt,
  alongside native delivery status and compatibility reasons. Preserve history
  when launch text changes.
- Restart without the option removes it for future attempts; do not silently
  persist an invisible grant. Define how queued work and retries observe changed
  launch guidance consistently with snapshots and current stale-work rules.
- Preserve shared process files and their semantic fingerprint; identify launch
  guidance separately where needed for authorization evidence.
- Reuse optional native reviewer delivery and visible baseline fallback. No
  sandbox/network/managed-policy widening, synthetic approval, policy replacement,
  or automatic desktop app approval.
- Test composition, roles without process allowances, project isolation,
  fresh/resumed/replacement delivery, restart change/removal and historical
  evidence. Update runtime/configuration docs and architecture/ADR when their
  contracts change.

## Relevant boundaries

CLI composition in `src/cli.ts`; attempt claim/snapshot in
`src/application/internal/activation-scheduling-module.ts`; runtime composition
in `src/application/internal/automation-coordinator.ts`; native delivery in
`src/runtime/codex-agent-runtime.ts` and `src/runtime/codex-reviewer-allowances.ts`.
Existing contracts: `docs/process-definition-reference.md` and ADR 0024.

## Comments

- 2026-10-05: User requested simple launch text appended for all agents, keeping
  project-specific authorization out of reusable processes.

- 2026-10-05: Claimed for implementation-ready investigation; feature implementation is deferred.

- 2026-10-05: User requested direct implementation under this ticket. Removed follow-through tickets 05–07; implementing the complete feature here.

## Answer

Implemented directly under this ticket. `start --additional-allowances <text>`
now supplies launch-only project guidance to every agent, including roles with
no process allowances. The CLI rejects missing/duplicate input before state
operations, supports equals syntax, and treats blank text as absent.

Each project host copies its launch source in memory. Attempt claim snapshots
exact text and launch/project identity alongside the selected process source;
runtime composition preserves inherited native policy, then process guidance,
then project guidance. Fresh, resumed and replacement attempts use that same
claim. Future queued/retry/continuation attempts use current launch text, and
restart without it removes project guidance. Process fingerprints and existing
stale-work rules remain unchanged.

Native configuration selections retain exact prepared additional policy,
inherited guidance, version/workspace identity, hashes and compatibility reasons.
Baseline fallback preserves the rejected optional selection without claiming
reviewer consumption. Historical evidence never becomes active authorization.
No native policy, app access, sandbox or managed permissions were widened.

Updated runtime/reference/tutorial/domain/architecture documentation and
[ADR 0025](../../../docs/adr/0025-scope-project-reviewer-guidance-to-host-launch.md).
Removed follow-through tickets 05–07 and their active tracker links at the user's
request; delivery is complete within ticket 02.

## Validation

- `pnpm typecheck`: passed.
- Full `pnpm test`: 389 tests, 383 passed, 6 opt-in integration tests skipped,
  0 failed. Live model probes were extended for project guidance but not enabled.
- Windows tests invoke the real `start.cmd` through cmd.exe and PowerShell and
  verify exact quoted launch argv, with build/runtime invocation intercepted.
- Application/runtime tests cover project-only and mixed sources, inheritance,
  fresh/resumed/replacement delivery, running-source immutability, shared-runtime
  project isolation, restart change/removal, queued work, automatic retries,
  permission/interruption continuations, exact history and compatibility fallback.
- `git diff --check`: passed. Changes remain unstaged; no commits or pushes.

## Standards

No findings. Application-owned snapshots, runtime-owned policy composition and
architecture/domain documentation conform to the repository's working agreement.

## Spec

No findings. All ticket 02 acceptance criteria are implemented. Independent review
also verified the Windows launcher coverage added after its initial inspection.


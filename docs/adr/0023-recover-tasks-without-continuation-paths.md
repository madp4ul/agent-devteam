# Recover tasks without continuation paths

Status: accepted

Accepted on 2026-10-03. Implemented on 2026-10-04. Delivery is recorded in
[stall recovery delivery](../../.scratch/stall-recovery/map.md). Its
[specification](../../.scratch/stall-recovery/spec.md) contains the exact contract.

## Decision

Stall recovery fills a missing continuation path, rather than judging work quality
or elapsed idle time. An active mapped task in a watched column is recoverable
only without unfinished activation, unresolved outgoing waiting relationship,
unresolved attention, or task suspension. Existing pause/startup/process rules
remain authoritative.

Every waiting relationship suppresses recovery regardless of target state because
its resume owner receives ordinary activation on target Completion (ADR 0019).
Do not recursively judge target progress. Prevent new cycles through authoritative
validation of the combined retained dependency/parent-child graph, including
satisfied edges that could become waiting again on reopening.

Activate the current column watcher with immutable detection provenance, current
context, recovery number, and instructions to establish continuation or ask the
user for help. Recheck before first dispatch and skip obsolete recovery with history; this
narrow exception does not change ordinary queue semantics or retarget activations.

Allow three recovery activations per episode. Regular activation, waiting, or
user attention resets count; an unwatched column or Completion ends the episode.
Recovery itself and prose-only edits do not reset it. Pause/interruption preserve
count. Technical retries repeat one activation under existing failure policy.
If recovery three finishes normally without continuation, create framework
attention explaining exhaustion without claiming to diagnose the agent.

Give users 60 seconds after addressing the last attention reason or dismissing
an activation, including interruption dismissal. Otherwise detect immediately
after settlement/relevant changes and on resume. Persist count/deadline as an
engineering default; startup remains paused.

## Consequences

- The coordination core owns eligibility, deduplication, budget, grace, provenance,
  and escalation alongside authoritative activation/attention commands.
- Agents can intentionally wait without token-consuming recovery runs.
- Regular handoffs reset the budget even without useful progress; ordinary
  handoff-loop detection is outside this decision.
- Users can acknowledge a problem before completing its resolution without
  recovery interrupting that short interaction sequence.
- Cycle checks include satisfied edges; automatic legacy-cycle repair is outside scope.
- Released migrations, restart reconciliation, adapter presentation, and targeted
  agent guidance must accompany implementation of the new lifecycle.

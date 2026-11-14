# 02 — Durable claims, waiting and automatic handoff

**What to build:** Agents claim/release resources for their task; FIFO handoff
assigns ownership and reliably activates the original participant, with full UI
inspection and task lifecycle integration.
**Blocked by:** 01 — Project shared-resource catalog.
**Status:** done
**Spec:** [Shared resources](../spec.md)

- [x] Atomic immediate grant or durable pending claim, unique task/resource active claim; retries safe.
- [x] One scoped release operation cancels pending or releases held; any same-task agent, never cross-task.
- [x] FIFO grant activation, ordinary queue ordering, no immediate-grant activation, persistence across restart.
- [x] Pending claims suppress stall recovery but permit other activations; held claims do not suppress it.
- [x] Human Completion clears claims; agent Completion and task/resource archival reject active claims.
- [x] Immutable lifecycle timeline, inspection and task sidebar; resource owner/queue and requesting-agent links/labels.
- [x] Grant context names exact claim and current held/released status, including retry/continuation; no activation cancellation.
- [x] Process changes preserve responsible-agent integrity using existing validation conventions.
- [x] API guidance on release discipline, tests at application/API/browser seams, typecheck.

Implementation uses migration 0017, task-owned durable claims and the existing
ordinary activation queue. Grant context refreshes the exact claim on every
attempt, including the short continuation prompt. Removed requesters remain
visible in process impact; a handoff retains a stale activation for the original
agent until the user restores or resolves the process change.

Validation: resource lifecycle application tests, relationship and stall-recovery
regressions, released migrations, catalog tests, authenticated HTTP/MCP, browser
owner/queue/sidebar flows in dark and light modes, and typechecking. Final full
suite and Standards/Spec review run with the combined delivery.

# 14 — Establish the Board Foundation

**What to build:** A focused integration spike that proves whether Kanboard can
serve as the first version's human-facing board while the coordination framework
retains its authoritative state, event provenance, and atomic command contract.
The result must either establish a narrow, maintainable Kanboard integration or
select and demonstrate the agreed custom-board fallback.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] A local containerized spike presents a usable Kanban board and full task
  entry point alongside the coordination service.
- [x] Reapplying a process definition preserves stable board, column, and agent
  identities and does not damage existing live tasks.
- [x] Task creation, movement, comments, mentions, and relationship changes
  preserve the event and author information required by activation provenance.
- [x] The spike demonstrates a coherent ownership and transaction strategy for
  current board state, activity, and resulting activations.
- [x] Narrow extensions can expose exceptional run state, attention, and task
  actions without a broad fork or extensive core-template replacement.
- [x] The deployment can access host Git repositories, framework-owned task
  workspaces, Codex authentication, and project containers as required.
- [x] The outcome records a clear Kanboard go/no-go decision against the spec's
  fallback criteria; a no-go includes a working accessible move interaction on
  the custom-board foundation.
- [x] Automated integration checks capture the proven contracts so later
  tickets can rely on the selected board foundation.

## Answer

The spike selected **NO-GO for Kanboard** because its independently committed
UI writes and post-commit webhooks cannot participate in the framework's
authoritative transaction, and documented move events do not identify the
acting user. The implemented [custom-board foundation and decision record](../../../spikes/board-foundation/DECISION.md)
prove the required command contract, provenance, recovery controls, accessible
move path, and container boundaries. Its [ticket-15 handoff](../../../spikes/board-foundation/HANDOFF.md)
distinguishes durable interface obligations from disposable spike code. Ticket
15 remains unstarted.

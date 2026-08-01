# 14 — Establish the Board Foundation

**What to build:** A focused integration spike that proves whether Kanboard can
serve as the first version's human-facing board while the coordination framework
retains its authoritative state, event provenance, and atomic command contract.
The result must either establish a narrow, maintainable Kanboard integration or
select and demonstrate the agreed custom-board fallback.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] A local containerized spike presents a usable Kanban board and full task
  entry point alongside the coordination service.
- [ ] Reapplying a process definition preserves stable board, column, and agent
  identities and does not damage existing live tasks.
- [ ] Task creation, movement, comments, mentions, and relationship changes
  preserve the event and author information required by activation provenance.
- [ ] The spike demonstrates a coherent ownership and transaction strategy for
  current board state, activity, and resulting activations.
- [ ] Narrow extensions can expose exceptional run state, attention, and task
  actions without a broad fork or extensive core-template replacement.
- [ ] The deployment can access host Git repositories, framework-owned task
  workspaces, Codex authentication, and project containers as required.
- [ ] The outcome records a clear Kanboard go/no-go decision against the spec's
  fallback criteria; a no-go includes a working accessible move interaction on
  the custom-board foundation.
- [ ] Automated integration checks capture the proven contracts so later
  tickets can rely on the selected board foundation.


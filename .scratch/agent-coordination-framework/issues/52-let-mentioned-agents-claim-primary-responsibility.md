# 52 — Let Mentioned Agents Claim Primary Responsibility

**What to build:** An agent activated by a mention can claim primary workflow
responsibility by moving the task into a different column it watches without
queuing a redundant second activation for itself.

**Blocked by:** 20 — Consult Agents and Notify the User

**Status:** resolved

- [x] When the currently running activation has reason `agent-mention` and its
  target agent moves the current task into a different watched column assigned
  to that same agent, the move succeeds and records the ordinary task movement,
  current column, revision, and activity while creating no column-entry
  activation.
- [x] The running mention activation remains the one expectation responsible
  for work after the move. Success has no implicit effect; failure,
  interruption, continuation, and retry preserve that activation under the
  normal lifecycle.
- [x] Suppression is deliberately narrow. A column-entry or final-blocker-
  clearance activation that moves between two columns watched by its own target
  agent still creates the existing distinct column-entry activation. This
  preserves valid processes with consecutive same-agent columns.
- [x] A move into a column watched by a different agent still creates that
  destination agent's activation. User moves and moves performed outside the
  currently running mentioned-agent case retain ordinary column-entry
  semantics.
- [x] Merely having an activation for the destination watcher queued, running,
  failed, or suspended does not generally suppress a new column-entry
  activation. The exception is based on the actor's current mention activation,
  destination watcher identity, and successful responsibility-changing move.
- [x] A move to the task's already-current column remains the inert adapter
  interaction owned by issue 39. It performs no mutation and is not treated as
  a responsibility claim.
- [x] Application-level lifecycle tests cover the suppressed claim, the
  same-agent column-entry counterexample, a different destination watcher,
  retry or interruption after a claim, and exact task activity and activation
  ordering.
- [x] MCP contract coverage proves `move_current_task` reports the successful
  move without implying that a redundant activation was queued.

## Comments

- Issue-38 grilling identified a targeted-work pattern that does not fit a full
  workflow round trip. An agent may mention a specialist several columns away,
  ask for bounded work, and let that specialist decide whether to reply directly
  or send the result through the normal validation route.
- A mention ordinarily leaves primary responsibility represented by the task's
  existing board position. The mentioned specialist nevertheless has full
  task-scoped capabilities. Moving the task into a column it watches is an
  explicit claim of primary responsibility, not a second request for work it is
  already performing.
- The requesting agent's suggestion to mention it back is contextual guidance,
  not binding authority. The mentioned agent remains responsible for weighing
  a fast direct return against the process's normal review and approval path.
- The earlier lifecycle decision intentionally created an activation for every
  watched-column entry, including same-agent re-entry. This ticket changes only
  the mention-activated responsibility-claim case; it does not remove general
  support for consecutive columns watched by the same agent.

## Answer

The authoritative move command now recognizes a responsibility claim only
when a validated running `agent-mention` attempt moves its task into a
different column watched by that activation's target agent. The movement,
revision, attempt provenance, and ordinary task activity are preserved while
the existing mention activation remains solely responsible for the work; no
column-entry activation or activation-created activity is added.

Application behavior tests cover the claim, retrying the same activation after
failure, the consecutive same-agent column-entry counterexample, and handoff to
a different destination watcher. An MCP contract test exercises
`move_current_task` through a live attempt-scoped transport and confirms its
success payload exposes only the continuing mention activation. The lifecycle
specification and domain glossary now record the narrow exception.

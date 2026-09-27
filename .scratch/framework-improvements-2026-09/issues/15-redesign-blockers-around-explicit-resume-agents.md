# 15 — Redesign blockers around explicit resume agents

**Type:** task
**Status:** open
**Blocked by:** None.
**Next step:** Implement the agreed relationship-resume model in this ticket.

## What to build

Replace task-wide execution blocking with explicit resume responsibility on
each parent-child or dependency relationship. An unresolved relationship says
that its source task is **waiting on** its target task; it does not suppress any
activation on the source task. When the target enters Completion, the
relationship queues an activation for its explicitly assigned resume agent so
that agent can reassess the source task.

Keep this design and its implementation in this existing ticket. Do not split
it into a separate specification or child implementation tickets.

## Agreed behavior

### Waiting does not disable work

- Remove unresolved relationships from activation eligibility. Column-entry,
  agent-mention, user-follow-up, retry, and relationship-satisfaction
  activations remain eligible under their ordinary rules while a task is
  waiting on other tasks.
- Preserve strict per-task activation order and the one-running-attempt-per-task
  invariant. “Wake immediately” means append a queued activation immediately;
  it does not interrupt or overlap a running activation.
- Replace task-level **Blocked** language and `blocking` projection terminology
  with **Waiting on** language. Do not imply that agents cannot interact with a
  waiting task.
- This runtime concept remains separate from `Blocked by` metadata in local
  Markdown implementation tickets.

### One explicit resume owner per relationship

- Every newly created `parent-child` or `dependency` relationship has exactly
  one resume agent. This is responsibility for reassessing the waiting task,
  not an event subscription.
- Store the stable agent ID on the relationship. Display-name changes therefore
  require no repair.
- Browser creation requires the user to select a current agent explicitly; the
  user cannot be selected as the resume target.
- Agent creation requires an explicit MCP value: either the literal `self` or a
  stable agent ID. `self` is resolved to the calling agent's stable ID before
  persistence. Omitting the value is invalid.
- A relationship created against a target already in Completion is allowed for
  traceability and still records a resume agent, but creates no activation at
  creation time.
- Keep exactly one resume agent for now. Agents that want later involvement
  should coordinate through comments and requests to the owner rather than
  replacing the owner or turning resume responsibility into a subscriber list.

### Assignment inspection and editing

- Show the resume agent anywhere the relationship is inspected by a user or an
  agent.
- Allow the resume agent to be changed while the relationship is currently
  unresolved. Record the actor, previous agent, and new agent as immutable
  activity on both related task timelines.
- Once the target is in Completion, the relationship is currently satisfied and
  its assignment is not editable: the activation has already been queued with a
  fixed target.
- If the target later leaves Completion, the relationship becomes unresolved
  again and its resume assignment becomes editable for the next completion.
- Browser editing uses the ordinary relationship UI. MCP editing accepts an
  explicit source-task selector (`current` or a concrete task ID), relationship
  ID, and resume target (`self` or a concrete agent ID). Agents may edit
  relationships on active tasks other than their activation's current task.

### Satisfaction and activation

- Replace the misleading `blockers-cleared` activation reason with a
  relationship-specific reason such as `relationship-satisfied`.
- Each entry of the target task into Completion records a fresh
  `relationship.satisfied` event and appends one activation for that
  relationship's resume agent. The activation points to the exact satisfaction
  event and exposes the relationship ID, relationship type, related task, and
  current task state. It must not claim that all relationships are satisfied.
- Queue that activation even when other relationships remain unresolved, the
  source task's current column is unwatched, or another agent watches the
  current column. Explicit resume responsibility is independent of column
  ownership, like an agent mention.
- Two relationships satisfied close together produce two distinct activations,
  including when they target the same agent. Preserve their event provenance
  and normal queue order; do not coalesce them.
- A relationship-satisfied activation remains independent after creation.
  Later relationship removal, reassignment becoming possible after reopening,
  task movement, or other activity does not cancel or retarget it. Existing
  activation dismissal remains the explicit way to abandon queued work.
- Process pause, task suspension, retries, interruptions, running work, and
  later process-definition changes continue to apply through the existing
  activation lifecycle rather than relationship-specific exceptions.

### Reopening, removal, archival, and unmapped tasks

- Moving a completed target back out of Completion makes the relationship
  unresolved again. Its next entry into Completion records and queues another
  satisfaction activation. This gives the owner an opportunity to correct work
  that may have proceeded after a premature completion.
- Removing a relationship is corrective cleanup. Preserve immutable
  `relationship.removed` activity on both task timelines but create no resume
  activation, regardless of whether it was the last unresolved relationship.
- Allow agents to remove relationships through MCP on any active task, using
  the same `current` or explicit task-ID selector. Preserve the browser's
  existing removal capability and confirmation.
- Reject archival while the task has unresolved outgoing relationships. The
  relationship must first be satisfied or explicitly removed so the required
  future activation is not made impossible by archival.
- If the waiting/source task is unmapped when its target completes, still queue
  the activation. Keep it visibly dormant under the existing unmapped-task
  rules until the user remaps the task; do not discard the continuation
  expectation.

### Process evolution and migration

- A process definition that removes an agent referenced by an unresolved
  relationship still applies and leaves the app accessible in its normal
  paused startup state. Do not fail startup and do not delete the relationship.
- Extend the existing process-impact review with unavailable or missing resume
  assignments. Each entry links to the ordinary task UI; repair uses the normal
  relationship edit or removal controls, not a special mutation path.
- Prevent automation from resuming until every unresolved missing or unavailable
  assignment is repaired or its relationship is removed, matching the existing
  stale-activation review pattern.
- Released migration preserves all existing relationships and does not infer a
  resume agent from the current column watcher. Historical satisfied
  relationships need no repair. Unresolved legacy relationships with no stored
  agent appear in process-impact review and require the same explicit edit or
  removal.

## Current implementation inventory

The implementation must update these existing seams together:

- `ActivationSchedulingModule.claimNextRunnable` currently excludes every
  queued activation whose task has an unresolved dependency or child. Remove
  that relationship-based eligibility predicate while preserving suspension,
  retry, staleness, mapping, and activation-order checks.
- `TaskCommandStore` currently detects only final clearance and either releases
  a queued column-entry activation or creates `blockers-cleared` for the current
  column watcher. Replace that path with one activation per satisfied
  relationship for its stored resume agent; relationship removal creates none.
- Task relationship persistence and projections currently store only ID, type,
  source task, and target task, while task summaries expose
  `blocking { blocked, blockerTaskIds }`. Add resume ownership and replace that
  presentation with waiting state.
- Activation contracts, released schema constraints and migrations, prompt
  rendering, transcript presentation, and conversation history currently know
  `blockers-cleared`. Migrate them to the relationship-specific reason with
  exact source-event provenance.
- Browser task cards, current-activity summaries, relationship rows and removal
  confirmation, timeline labels, conversation labels, and tests currently use
  Blocked/final-blocker language. Replace it with Waiting on and explicit resume
  ownership, with readable dark- and light-mode states.
- Browser relationship creation currently supports child creation and dependency
  selection, and browser removal is user-only. Add required agent selection and
  ordinary reassignment controls without introducing a separate repair UI.
- MCP currently exposes `create_child_task` and `add_dependency` only for the
  current task and has no relationship edit/removal tools. Add explicit resume
  arguments and cross-task edit/removal selectors, update the agent API,
  transcript evidence, runtime tool allowlist, and `docs/agent-mcp-reference.md`.
- Process-impact projection and startup UI currently cover unmapped tasks and
  stale activations. Extend that same mechanism for unresolved missing or
  unavailable resume assignments.
- Relationship, activation, process-evolution, projection, MCP/API, prompt, and
  browser coverage must be rewritten around the new semantics rather than
  retaining final-blocker assumptions.

## Acceptance criteria

- [ ] A task with one or more unresolved relationships can run user follow-ups,
  mentions, column entries, and retries normally.
- [ ] Browser and MCP relationship creation reject a missing or invalid resume
  agent; MCP accepts both `self` and stable IDs.
- [ ] Resume ownership is inspectable and editable on unresolved relationships,
  including through cross-task MCP targeting, with dual-timeline history.
- [ ] Every target entry into Completion creates exactly one ordered activation
  per attached relationship for its assigned agent, even when other
  relationships remain unresolved.
- [ ] Satisfaction activations remain separate from existing queued/running
  work and from one another; none are coalesced or retargeted.
- [ ] Removal by user or agent preserves history and never creates or cancels an
  activation.
- [ ] Reopening and recompleting a target queues a new activation; relating an
  already-completed target does not queue one immediately.
- [ ] Waiting state and resume ownership are clear in task cards, task details,
  timelines, agent projections, and activation prompts without execution-block
  language.
- [ ] Archival rejects unresolved outgoing relationships, while unmapped source
  tasks retain dormant satisfaction activations until remapped.
- [ ] Migration and process changes surface missing/unavailable assignments in
  existing startup-impact review and allow ordinary edit/removal repair before
  automation resumes.
- [ ] `CONTEXT.md`, `docs/architecture.md`, the MCP reference, and any durable
  decision documentation are updated with the changed activation eligibility,
  relationship ownership, and authoritative wake-up flow.
- [ ] Application, migration, MCP/API, runtime prompt, and dark/light browser
  tests cover the agreed lifecycle and pass with the repository's normal
  verification commands.

## Related work

This redesign supersedes the relevant semantics from
[`agent-coordination-framework` issue 21](../../agent-coordination-framework/issues/21-split-relate-unblock-work.md),
which implemented task-wide blocking and final-blocker reactivation.

Cross-task relationship editing and removal are deliberate instances of the
broader capability direction in [issue 09](09-redesign-cross-task-mcp-capabilities.md).
Implement the explicit operations agreed here without attempting to settle all
of issue 09's remaining MCP redesign questions.

## Comments

- 2026-09-23: Added from user dictation. The user expects another grilling
  session and explicitly wants the current all-agent execution block removed.
- 2026-09-28: Grilling completed with the user. The agreed design is consolidated
  into this existing ticket by explicit request; do not create a separate spec
  or implementation tickets for it.

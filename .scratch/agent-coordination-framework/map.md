# Agent Coordination Framework Product Design

Type: wayfinder:map

## Destination

A clear, agreed product design for the first usable version of the agent
coordination framework, detailed enough to turn into a software specification,
without choosing the implementation yet.

## Notes

- This is a local, single-user framework for coordinating software-development
  agents across configurable boards.
- Prefer a local Docker Compose deployment using one or more containers.
- Read [the initial idea](./notes.md) for the decisions and examples captured
  before this map was charted.
- Use the canonical language in [the domain glossary](../../CONTEXT.md).
- Decision sessions should use the `grilling` and `domain-modeling` skills.
- External facts should be gathered with the `research` skill.
- Questions about behavior or appearance may use the `prototype` skill.
- Planning produces decisions only; implementation starts after this map is
  complete and its results have been turned into a specification.

## Decisions so far

- [Define the First Usable Workflow and Success Criteria](./issues/01-define-first-usable-workflow.md)
  — Use an architecture-led implementation workflow with independent design
  and verification agents, visible rework, cross-stage consultation, and
  explicit human approval before an agent merges the result.
- [Determine the Codex Integration Boundary](./issues/02-determine-codex-integration-boundary.md)
  — Use the TypeScript Codex SDK with one fresh thread per activation,
  best-effort thread reuse for its retries, and a project-scoped MCP server for
  board tools; reserve direct App Server use for richer Codex-native UI.
- [Determine the Board UI Foundation](./issues/03-determine-board-ui-foundation.md)
  — Start from Kanboard behind a framework-owned adapter and narrow plugin,
  with a focused spike and a custom Pragmatic Drag and Drop UI as fallback.
- [Define the Process Authoring Experience](./issues/04-define-process-authoring-experience.md)
  — Define processes as schema-backed YAML plus referenced Markdown instruction
  files, edited with existing tools and checked by location-aware validation;
  build no dedicated authoring UI or VS Code extension in the first version.
- [Define the Agent Activation and Run Lifecycle](./issues/05-define-agent-run-lifecycle.md)
  — Queue one immutable, targeted activation per trigger in strict chronological
  order; use explicit inert completion, bounded technical retries, user recovery,
  activity history, and fresh Codex context between distinct activations.
- [Define Board and Task Interactions](./issues/06-define-board-interactions.md)
  — Use a board-first user experience with integrated explicit attention,
  direct full-task pages, contextual actions, a unified timeline, and bounded
  summary-first agent discovery through explicit, paginated column queries.
- [Define Durable Board State and Recovery](./issues/07-define-durable-board-state.md)
  — Keep authoritative current state and immutable activity together with
  atomic conflict-safe commands, durable at-least-once activation recovery,
  explicit user interruption and continuation, and preserved archived history.
- [Define the Git Task-Workspace Lifecycle](./issues/08-define-git-workspace-lifecycle.md)
  — Provision one framework-owned detached Git worktree lazily per task, reuse
  it across that task's runs, leave branch topology to the process, and remove
  it only through guarded archival cleanup.

- [Define Agent Permissions and Approval Boundaries](./issues/09-define-safety-boundaries.md)
  — Reuse one user-controlled Codex policy for all agents; add no framework or
  process permissions, and turn unresolved approval requirements into explicit
  user-attention blocks rather than automatic retries.

- [Define Process Definition Evolution and Reloading](./issues/10-define-process-definition-evolution.md)
  — Load one validated semantic definition at startup; quarantine unmapped live
  state, preserve framework-owned completion, and require user approval before
  stale activations continue under the current process.

- [Define Automation Observability and Recovery](./issues/11-define-automation-observability-and-recovery.md)
  — Keep the board primary with an on-demand process-wide live-run menu, put
  history and contextual recovery on task details, use a pragmatic transcript
  overlay, and make process pause a startup-default drain rather than an
  interruption.

- [Define User Notification and Attention Delivery](./issues/12-define-user-notification-delivery.md)
  — Add opt-in, best-effort desktop notifications for new attention reasons
  while keeping acknowledgement and resolution exclusively on the board.

- [Validate the End-to-End Product Design](./issues/13-validate-end-to-end-product-design.md)
  — Skip a broad interactive prototype because credible coverage would cost
  too much and narrow coverage would mislead; use specification synthesis as
  the next consistency check and reserve prototypes for focused uncertainties.

- [Establish the Board Foundation](./issues/14-establish-board-foundation.md)
  — Select the product-owned custom board after the Kanboard spike failed the
  authoritative transaction and actor-provenance gates; preserve the accessible
  move path and add Pragmatic Drag and Drop at the same boundary later.

- [Inspect and Control a Task](./issues/19-inspect-and-control-task.md)
  — Replace the temporary board with a React and Vite client at the existing
  application seam, adding task creation, direct details, unified history,
  runtime-owned transcript access, accessible movement, and Pragmatic Drag and
  Drop on a horizontally scrollable workflow lane.

- [Make Real-Run Coordination Calls Reliable](./issues/30-make-real-run-coordination-calls-reliable.md)
  — Auto-approve only the scoped coordination MCP tools for noninteractive Codex
  runs, fail attempts with unresolved required coordination calls, and persist
  correlated pre-attempt startup diagnostics across logs, UI, and host restarts.

- [Configure Agent Models and Reasoning](./issues/36-configure-agent-models-and-reasoning.md)
  — Let each process agent optionally select a Codex model and reasoning effort,
  snapshot the requested profile on activations and attempts, and preserve the
  launching user's ordinary Codex defaults when either value is omitted.
- [Split, Relate, and Unblock Work](./issues/21-split-relate-unblock-work.md)
  — Add typed child and dependency relationships, task-specific child starting
  refs, immutable blocker history, and reliable reactivation exactly when the
  final blocker becomes satisfied.

- [Prevent Conflicting and Duplicate Changes](./issues/22-prevent-conflicting-duplicate-changes.md)
  — Enforce atomic, idempotent, conflict-safe commands and strict per-task run
  serialization while allowing independent tasks to execute concurrently.
- [Recover Failed and Permission-Blocked Attempts](./issues/24-recover-failed-permission-blocked-attempts.md)
  — Apply bounded automatic retry to technical failures and explicit user
  recovery to exhausted or permission-blocked activations without bypassing
  the preserved task queue.

- [Surface Suspended Task Action on the Board](./issues/43-surface-suspended-task-action-on-board.md)
  — Project task automation suspension onto board cards as an explicit Continue
  requirement while preserving the interrupted activation's queued state.
- [Expose a Task's Workspace](./issues/31-expose-task-workspace.md)
  — Show lazy and provisioned task-workspace identity on task details and let
  the user copy or open the verified registered worktree through host-native
  integration without embedding live Git tooling.
- [Evolve Process Definitions Safely](./issues/26-evolve-process-definitions-safely.md)
  — Preserve stable live identities, isolate unmapped tasks, and require explicit
  approval or dismissal before stale activations proceed under a changed process.
- [Preserve Board Scroll During Automatic Refresh](./issues/44-preserve-board-scroll-during-refresh.md)
  — Give restored board context one-shot semantics so active-run polling
  preserves the user's current horizontal lane position before live task
  refresh expands further.
- [Prevent Tasks from Starting in Completion and Unify Creation](./issues/46-prevent-completion-task-creation.md)
  — Make Completion an application-owned creation invariant across user and
  agent interfaces while giving ordinary and child tasks one shared dialog.
- [Reshape Task Details Around Agent Activity](./issues/47-reshape-task-details-around-agent-activity.md)
  — Replace automation-profile clutter and oversized movement with a responsive
  task-first layout, truthful current activity, and an ordered activation queue.

## Next implementation priority

- [Make Task Relationships Discoverable and Recoverable](./issues/48-make-task-relationships-discoverable-recoverable.md)
  — After issues 46 and 47, group relationships by meaning, add project-wide
  task finding, and let users safely remove mistaken blocking relationships.

## Clarified delivery follow-ups

- [Archive Tasks Without Losing Work](./issues/27-archive-tasks-without-losing-work.md)
  — Keep detailed transcripts until explicit archival, then discard them with
  the task workspace while retaining concise attempt history.
- [Observe Task Activity and Running Attempts Live](./issues/32-observe-running-attempts-live.md)
  — Keep an open task timeline current across comments, activations, activity,
  and attempt changes; update transcript activity during a run and persist every
  finished attempt's captured transcript until task archival.
## Not yet specified

- [Show Live Task-Workspace Git State](./issues/33-show-live-task-workspace-git-state.md)
  — Evaluate a richer automatically updating branch, commit, dirty-file, and
  optional storage summary after basic workspace discovery proves useful.
- [Relocate a Project State Root](./issues/34-relocate-project-state-root.md)
  — Define a lower-priority explicit relocation and Git-registration repair
  workflow only if usage demonstrates that initialized state must move.
- [Make Participant Mentions Discoverable](./issues/35-make-participant-mentions-discoverable.md)
  — Evaluate lightweight `@` autocomplete against an explicit recipient
  control and highlight submitted mentions so users can address agents and see
  the resulting activation or attention without memorizing stable IDs.
- [Structure Task History by Cause and Attempt](./issues/37-structure-task-history-by-cause-and-attempt.md)
  — Prototype a causal timeline that groups attempt work and folds derived
  activation or attention facts into the comment or movement that caused them.
- [Discard an Interrupted Activation](./issues/50-discard-interrupted-activation.md)
  — Decide how a user deliberately abandons preserved interrupted work, what
  happens to later queued activations, and how the decision remains auditable.
- [Separate Framework, Process, and Role Instructions](./issues/38-separate-framework-process-role-instructions.md)
  — Define a product-owned framework-instruction layer and deliberate prompt
  precedence so process and role authors do not repeat invariant mechanics.

## Deferred release engineering

- [Support Released Schema Upgrades](./issues/42-support-released-schema-upgrades.md)
  — Keep pre-release schemas disposable, then require verified transactional
  migrations and recovery backups before shipping a schema-changing release
  after user-retained state exists.

## Out of scope

- Hosting the framework as a service or supporting multiple human users.
- Supporting projects that are not Git repositories.
- Hardcoding one universal software-development process.
- Implementing the framework during this Wayfinder effort.

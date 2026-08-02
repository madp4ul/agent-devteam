# Agent Coordination Framework — First Usable Version

Type: specification
Status: ready-for-agent
Source: [Agent Coordination Framework Product Design](./map.md)

## Problem Statement

Working effectively with coding agents currently requires the user to act as
the coordinator for every handoff, review, clarification, recovery, and quality
gate. That repeated supervision limits how much useful work agents can complete
autonomously. Giving one agent every responsibility is not an acceptable
substitute because implementation, architecture, review, and integration have
different goals and benefit from independent judgment.

The user needs a local coordination framework in which role-focused agents can
work through a visible, configurable software-development process. Agents need
shared boards, tasks, comments, mentions, relationships, durable history, and
isolated Git workspaces. The user must be able to understand what automation is
doing, stop it safely, recover failures, and retain an explicit approval boundary
without manually routing every normal transition.

## Solution

Build a local, single-user coordination framework around the existing Codex
agent runtime. A version-controlled process definition describes boards,
workflow columns, agents, roles, instructions, and coordination guidance. The
framework adds a permanent Completion column to each board, maintains the live
board state, watches relevant events, and turns them into durable activations
for the appropriate agents.

The user works primarily through a Kanban board and full task pages. Agents work
through bounded, structured board tools while retaining Codex's normal coding
tools, project instructions, sandbox, and permission policy. Each task receives
an isolated, persistent Git worktree shared by that task's successive agent
runs. Each distinct activation receives fresh Codex conversation context while
the board record, repository artifacts, and task workspace provide durable
continuity.

The first usable process demonstrates independent architecture, implementation,
code review, architecture verification, user approval, and merge responsibilities.
Normal handoffs proceed automatically through board movements and mentions;
exceptional states remain visible and recoverable. Durable storage, strict
activation ordering, transactional commands, explicit attention reasons,
process-wide pausing, task-specific interruption, and guarded workspace cleanup
make the automation understandable and safe to operate locally.

## User Stories

1. As a user, I want to coordinate several role-focused coding agents through a shared board, so that I do not have to relay every handoff manually.
2. As a user, I want architecture, implementation, review, verification, and merge responsibilities assigned to distinct agents, so that each concern receives focused and independent judgment.
3. As a user, I want processes defined in version-controlled project files, so that workflow changes are reviewable and travel with the repository.
4. As a process author, I want to define multiple boards and ordered workflow columns, so that different phases of development do not have to share one board.
5. As a process author, I want every board, workflow column, and agent to have a stable identity separate from its display name, so that renaming and reordering do not break live work.
6. As a process author, I want long agent instructions stored separately from structured process data, so that both remain readable and easy to edit.
7. As a process author, I want schema-backed YAML definitions, so that ordinary editors can provide completion and structural diagnostics.
8. As a process author, I want an explicit validation command, so that I can find configuration problems before starting automation.
9. As a process author, I want validation errors to identify the file, line, column, invalid value, consequence, and safe correction, so that I can repair definitions efficiently.
10. As a user, I want startup to fail closed when the process definition is invalid, so that agents never run under a partially understood configuration.
11. As a user, I want the application to start with process automation paused, so that no agent changes board or repository state before I am ready.
12. As a user, I want to resume automation explicitly, so that queued work begins only after I have inspected the current process state.
13. As a user, I want to pause automation across every board in a process, so that I can reach a confirmed state in which no agent is changing boards.
14. As a user, I want running attempts to finish while a process pause drains, so that pausing does not create a collection of interrupted tasks.
15. As a user, I want the interface to tell me when pausing is still in progress and which runs remain, so that I do not mistake a transition for a completed pause.
16. As a user, I want a configurable board-first workflow, so that I can see work in the context of its development stage.
17. As a user, I want each task card to show its generated ID and outcome-oriented title, so that I can identify work without opening every task.
18. As a user, I want cards to show blocking, attention, queued or failed activations, and the active agent, so that exceptional coordination state is visible without cluttering idle tasks.
19. As a user, I want each column to identify its watching agent, so that the normal ownership and next activation are understandable.
20. As a user, I want to drag a task between columns or choose any destination from its detail page, so that I can follow or deliberately deviate from the preferred route.
21. As a user, I want an unwatched backlog, so that tasks can wait until I deliberately start agent work.
22. As a user, I want unwatched workflow columns to remain ordinary waiting states, so that human review does not create a false alert.
23. As a user, I want every board to end in a permanent unwatched Completion column, so that completion has one stable meaning even when the process changes.
24. As a user, I want completed and rejected tasks to remain visible until archived, so that workflow outcome and record retention remain separate decisions.
25. As a user, I want a dedicated, linkable full task page, so that I can inspect or share the complete context of one task.
26. As a user, I want returning from task details to restore my board position and filters, so that inspection does not disrupt board navigation.
27. As a user, I want task details to show description, relationships, column, run state, and unresolved attention, so that I can understand the task without searching across screens.
28. As a user, I want authored comments and immutable framework events in one chronological timeline while still distinguished by type, so that communication and system behavior tell one coherent story.
29. As a user, I want actions placed beside the state they affect, so that editing, relationship management, and recovery controls are easy to understand.
30. As a user, I want to create parent-child and dependency relationships, so that agents can split work and represent prerequisite outcomes.
31. As an agent, I want to create a child task with a task-specific starting Git ref, so that delegated work can begin from committed parent state when the process requires it.
32. As a user, I want a blocked task to reactivate only when its final blocking relationship is satisfied, so that agents do not repeatedly revisit work that still cannot proceed.
33. As a user, I want relationship satisfaction recorded even when another blocker remains, so that the history explains how the task became unblocked.
34. As an agent, I want to discover collaborators by name and summary, so that I can request the right focused assistance without loading every agent's instructions.
35. As an agent, I want to mention another agent in a comment, so that I can request bounded assistance without transferring primary responsibility.
36. As an agent, I want a reply mention to reactivate me, so that consultation can make a visible round trip while the task stays in its current column.
37. As a user, I want mentioning me to create a durable attention reason rather than an agent activation, so that requests for my decision cannot disappear into automation.
38. As a user, I want attention reasons grouped by task and resolved independently, so that addressing one problem does not hide another.
39. As a user, I want opening, moving, or commenting on a task not to resolve attention implicitly, so that only an intentional action clears a request.
40. As a user, I want a Needs attention area above the board, so that mentions and exhausted failures are visible in workflow context.
41. As a user, I want an attention entry to locate its board card or open task details directly, so that I can choose between board context and immediate investigation.
42. As a user, I want optional desktop notifications for new attention reasons, so that I can notice important work while viewing another application.
43. As a user, I want desktop notifications disabled until I enable them, so that the application does not request operating-system permission unexpectedly.
44. As a user, I want lock-screen notifications to omit comment text and diagnostics, so that task-sensitive information is not exposed.
45. As a user, I want notification delivery to remain best-effort while the board stays authoritative, so that notification failure cannot lose or duplicate coordination state.
46. As a user, I want selecting a desktop notification to open the affected task and highlight the reason, so that I can act on the correct condition quickly.
47. As an agent, I want each activation to carry its original typed reason and exact source event together with current task state, so that I can distinguish the triggering expectation from later changes.
48. As a user, I want each trigger to create a distinct activation, so that one expectation is not silently coalesced, reprioritized, canceled, or superseded by later activity.
49. As a user, I want a task's activations processed one at a time in chronological order, so that concurrent agents cannot race while changing the same task and workspace.
50. As a user, I want different tasks to run concurrently, so that serialization for safety does not prevent useful parallel work.
51. As a user, I want column entry, agent mentions, and final blocker clearance to be explicit activation reasons, so that automation is predictable and explainable.
52. As a user, I want successful run completion to have no implicit workflow effect, so that agents must leave the task and record in the state required by their process instructions.
53. As a user, I want a forgotten handoff recovered through a new explanatory mention comment, so that the durable record says what response is expected.
54. As a user, I want technical failures retried with one consistent bounded policy, so that transient faults recover without process-specific retry complexity.
55. As a user, I want later activations to remain queued behind a failing activation, so that a new mention cannot bypass unresolved earlier work.
56. As a user, I want exhausted technical failures to create attention with Retry and Dismiss choices, so that I control whether the same expectation is attempted again or abandoned.
57. As a user, I want permission blocks distinguished from technical failures and excluded from automatic retry, so that repeated attempts cannot bypass Codex's policy.
58. As a user, I want to interrupt one active run from its task page, so that I can stop problematic work without pausing or interrupting every task.
59. As a user, I want an Interrupting state until Codex confirms execution stopped, so that I know an in-flight operation may still be running.
60. As a user, I want interruption to preserve the activation and suspend that task's automation, so that I can inspect or edit the task before deciding how to continue.
61. As a user, I want an optional continuation message, so that I can give the preserved activation new guidance without creating a different expectation.
62. As a user, I want continuation without a message to instruct the agent to reassess current task and workspace state, so that it does not blindly repeat interrupted work.
63. As a user, I want a compact process-wide list of currently active runs, so that I can see what automation is doing without introducing an operations dashboard.
64. As a user, I want live-run entries to navigate to task details or locate the board card, so that operational awareness leads back to the task rather than a separate run-centric workflow.
65. As a user, I want each run attempt represented separately in the task timeline, so that retries, interruptions, and outcomes remain understandable.
66. As a user, I want concise failure diagnostics and transcript access retained on historical attempts, so that I can investigate what happened after the actionable reason is resolved.
67. As a user, I want an attempt transcript in a large read-only overlay, so that I can inspect model conversation and useful tool activity without replacing the task-centered interface.
68. As a user, I want a copyable Codex thread ID and supported Open in Codex navigation when available, so that I can move to Codex without relying on undocumented internals.
69. As a user, I want complete board state, comments, relationships, activations, attempts, and activity to survive restarts, so that agent coordination is not dependent on one application process.
70. As a user, I want logical board commands to update current state, history, and resulting activations atomically, so that crashes cannot leave half-applied coordination state.
71. As a user, I want stale edits and moves rejected with the current state returned, so that concurrent user and agent changes are not silently overwritten.
72. As a user, I want retried tool and transport calls to be idempotent, so that a transient communication failure cannot duplicate comments, moves, relationships, or activations.
73. As a user, I want an orphaned running attempt detected after a crash and recovered through the technical-failure policy, so that automation can resume without pretending the attempt completed.
74. As an agent, I want attempt context to describe previous outcomes and thread reuse, so that I can recover safely without altering the activation's original meaning.
75. As a user, I want storage validated and migrated before agents dispatch, so that automation never runs against inconsistent data.
76. As a user, I want a verified backup before a schema migration and a documented restore procedure, so that storage evolution does not put all coordination history at risk.
77. As a user, I want tasks and their histories retained without an automatic age limit or permanent deletion, so that past decisions and automation remain inspectable.
78. As an agent, I want a board summary followed by explicit-column paginated listings, so that I can orient myself without loading every task into context.
79. As an agent, I want task overviews to include title, column, blocking, relationships, and run state, so that I can select relevant tasks before requesting full details.
80. As an agent, I want completed and archived work available through deliberate queries, so that I can inspect history without having it included by default.
81. As an agent, I want each activation to include full current task description, comments, relationships, process guidance, and collaborator summaries, so that important context is not silently omitted to save tokens.
82. As a user, I want a visible activation failure when required context cannot fit, so that truncation cannot make an agent act on an incomplete task unknowingly.
83. As a user, I want one isolated Git task workspace reused across that task's activations, so that successive role-focused agents share repository state without sharing hidden conversation context.
84. As a user, I want different tasks and child tasks to use different worktrees, so that concurrent changes do not interfere.
85. As a process author, I want to configure the default task-workspace starting ref, so that the framework does not prescribe a branch name or ancestry.
86. As a user, I want the framework to resolve the starting ref and create a detached worktree just before the first runnable activation, so that the source branch remains available and unused tasks consume no workspace.
87. As an agent, I want branch creation, commits, ancestry, merge targets, and integration controlled by process instructions, so that the framework does not impose one Git topology.
88. As a user, I want the task worktree verified before every run, so that an unexpectedly missing or invalid workspace stops visibly instead of being silently replaced.
89. As a user, I want archive cleanup rejected while automation or unpreserved Git changes remain, so that archiving cannot lose active or uncommitted work.
90. As a user, I want worktree removal to finish before a task is marked archived, so that cleanup failure leaves both the task and workspace recoverable.
91. As a user, I want unarchiving to retain task history without pretending to restore the old workspace, so that later work begins from the configured ref with honest Git state.
92. As a user, I want all agents to inherit my Codex permission policy, so that the framework does not create a second and potentially conflicting authorization system.
93. As a user, I want process roles to guide behavior without granting technical authority, so that role instructions cannot override Codex's sandbox and approvals.
94. As a user, I want a process-definition fingerprint derived from effective semantic content, so that the framework can detect meaningful changes without requiring a manual version number or Git commit.
95. As a user, I want tasks whose saved workflow columns disappear to become conspicuous unmapped tasks, so that they remain recoverable without running under an unintended stage.
96. As a user, I want only myself to move an unmapped task back into a defined column, so that automation cannot reinterpret live work after a process change.
97. As a user, I want restoring the same stable board and column identities to restore mapping without synthesizing activations, so that configuration repair does not create unexpected agent work.
98. As a user, I want removed boards retired rather than deleted, so that completed tasks stay inspectable and unfinished tasks remain recoverable.
99. As a user, I want activations created under an older process version marked stale and prevented from dispatching automatically, so that old expectations do not run under new instructions without review.
100. As a user, I want one process-level action to resume compatible stale activations with the current process, so that I can approve a known definition change without handling every activation separately.
101. As a user, I want stale activations targeting removed agents to require individual dismissal, so that work is never silently retargeted to a different responsibility.
102. As a user, I want a nontrivial example task to move from architecture through implementation, review, independent verification, approval, and merge, so that the first usable version proves the intended coordination model.
103. As a user, I want the example task to complete a revision loop through implementation, code review, and architecture verification, so that the proof covers rework rather than only a happy path.
104. As a user, I want the example Code Reviewer and Architecture Designer to complete a mention round-trip without moving the task, so that the proof demonstrates cross-stage consultation.
105. As a user, I want automation to stop for explicit approval before merge, so that agents cannot integrate a change until I have reviewed the task history and repository result.
106. As a user, I want every board column to offer task creation with that
column already selected, so that I can start work exactly where it belongs
without using an internal API or test fixture.
107. As a user, I want board columns to remain in one left-to-right workflow
lane with horizontal scrolling when needed, so that the process order stays
visually coherent instead of wrapping into misleading rows.

## Implementation Decisions

### Product and deployment boundary

- The first version is a local, single-user application for one Git project and
  one shared process. Its primary distribution is a self-contained host-native
  program that serves the interface on localhost and does not require users to
  install the TypeScript development toolchain. Docker may remain an optional
  development or deployment adapter but does not determine application paths or
  interfaces. See [ADR 0002](../../docs/adr/0002-self-contained-host-native-distribution.md).
- The coordination framework extends Codex rather than reimplementing agent
  conversation, coding tools, shell and filesystem access, sandboxing,
  approvals, skills, plugins, or project-instruction discovery.
- The initial server-rendered interface remains intentionally small through the
  minimal Codex handoff. Starting with the interactive task-and-board slice, the
  browser UI is a TypeScript React application built with Vite and served by the
  existing localhost Node host. It translates through a narrow HTTP/JSON adapter
  to the shared application command-and-query seam; it does not own coordination
  rules or authoritative state. See
  [ADR 0003](../../docs/adr/0003-adopt-react-and-vite-for-the-interactive-board-ui.md).
- Kanboard is the default human-facing board foundation, isolated behind a
  framework-owned adapter and a narrow plugin. A focused integration spike must
  prove that it can support the final task-detail, attention, event-provenance,
  transactional-consistency, and deployment requirements without a broad fork.
- If the Kanboard spike requires broad core-template overrides, cannot uphold
  the coordination consistency contract, or otherwise loses its maintenance
  advantage, the fallback is a custom product-owned board UI using Atlassian
  Pragmatic Drag and Drop. Accessible non-drag movement remains required.

### Process definition and evolution

- A process definition uses schema-backed YAML for boards, workflow columns,
  agents, roles, coordination guidance, stable entity IDs, and the default task
  workspace starting ref. Long-form agent instructions live in referenced
  Markdown documents.
- The product supplies a JSON Schema, reference documentation, a tutorial,
  examples, an explicit validator, and startup validation. Diagnostics use
  source locations and explain the rule, consequence, and safe correction.
- The definition is loaded once at startup. The first version has no file
  watcher or hot reload.
- The process definition version is a fingerprint of complete validated
  semantic content, including referenced instructions, and ignores formatting,
  comments, and YAML key order.
- Stable board, workflow-column, and agent IDs are separate from display names.
  Renaming or reordering preserves identity; changing an ID removes one entity
  and adds another.
- Invalid configuration starts a configuration-error mode with no automation.
  The product does not silently run the last valid definition.
- Tasks whose saved non-completion column no longer exists become unmapped.
  They retain former identities and history, are excluded from agent queries,
  cannot run agents, and can be remapped only by a user move. Restoring the same
  stable identity restores mapping without creating activations.
- Every board receives exactly one framework-owned, permanently last,
  permanently unwatched Completion column. Process files describe only the
  workflow columns before it.
- Removing a board that has live state retires it. Completed tasks remain in
  its Completion column; other tasks become unmapped. Restoring its stable ID
  restores the board and matching columns without creating activations.
- Each activation records the process version that created it. Older queued,
  failed, or interrupted activations become stale after a new definition is
  applied and do not dispatch or retry automatically.
- One process-level approval rebases compatible stale activations to the current
  instructions while preserving their reason, source event, target-agent ID,
  and order. Targets are never silently re-resolved. Removed target agents
  require individual dismissal, and unmapped tasks remain dormant.
- Applying or restoring a process definition never infers activations from
  existing tasks, watchers, comments, relationships, or mappings.

### Board, tasks, and attention

- The Kanban board is the primary user overview. Cards show task ID, title, and
  exceptional coordination state. Column headers identify watching agents.
- Columns preserve process order in one non-wrapping horizontal lane with
  usable widths. Narrow viewports scroll the lane horizontally rather than
  wrapping later workflow stages beneath earlier ones.
- Every column exposes a consistently placed Create task action with that
  column preselected. Creation collects the outcome-oriented title and complete
  description and translates through the same application command boundary as
  other user and agent operations.
- A Needs attention area groups unresolved user mentions and agent-run failures
  by task. Unwatched columns, including human review stages, do not create
  attention.
- Attention reasons are durable and independently resolved only by an explicit
  cause-specific action. Board navigation, moves, comments, and operating-system
  notification actions do not acknowledge them implicitly.
- Selecting a card opens a dedicated, linkable full task page. Selecting an
  attention entry may instead locate and highlight the card. Returning from
  task details restores board position and filters.
- Task details combine authored comments and immutable framework events in one
  chronological timeline while preserving their different record types. The
  page owns task editing, relationships, task movement, attention recovery,
  current task automation, archival, and attempt transcript access.
- The task move chooser allows every other defined column, preserves board
  order, and marks current, previous, and next positions. Watching-agent
  information is secondary context and does not restrict movement.
- Completion is entry into the Completion column. Rejection uses a
  process-specific unwatched workflow column. Neither outcome automatically
  archives the task.
- Archiving preserves the complete task and coordination history but removes it
  from normal board views and agent listings. There is no permanent task
  deletion. Eligible tasks may be archived individually and completed tasks in
  bulk.
- Parent-child and dependency relationships are typed. A dependency is
  satisfied when its target enters its Completion column. Only transition from
  blocked to fully unblocked may activate the current column's agent.

### Agent-facing tools and activation input

- Agents interact through a project-scoped MCP server, not through the visual
  board or Kanboard's native API. The framework's commands and queries are its
  public domain contract; the Kanboard adapter, MCP tools, and user interface
  translate through the same coordination behavior.
- Board discovery is two-stage. A board summary returns ordered columns,
  watching agents, and task counts without task payloads. A listing requires
  explicit columns and returns a bounded page of Task overviews with a cursor.
  There is no implicit all-column listing.
- Task overviews contain title, column, blocking state, relationship status,
  and run state. Archived tasks are excluded by default. Completion and archive
  state remain available through deliberate listing, history, search, and
  direct related-task inspection.
- Agent tools cover board summary, paged column listing, historical search,
  full task inspection, comments and mentions, movement, child-task creation,
  relationship management, and collaborator discovery. Process instructions
  guide appropriate use; the framework does not enforce role-specific tool
  visibility.
- Every activation supplies the agent's current role and instructions,
  relevant process and board guidance, collaborator names and summaries, the
  immutable activation reason and source event, current task metadata and
  relationships, full description, and complete comment history. Attachments
  and activity remain available on demand.
- Required task input is never silently truncated. An activation fails visibly
  if its required context cannot fit.
- Stable project-wide rules remain in project instructions. The current role,
  task, trigger, and attempt context are composed into each run prompt. MCP
  server instructions cover board-tool usage rather than duplicating agent
  roles.

### Activation and run lifecycle

- Each triggering event creates one immutable activation for one target agent.
  Activations are not coalesced, reprioritized, canceled, or superseded because
  the task later changes.
- A task has at most one active run. Its activations execute individually in
  strict chronological order. Activations from multiple mentions in one comment
  use textual mention order. Different tasks may run concurrently.
- Column entry creates an activation when the destination has a watcher,
  including task creation, re-entry, and entry into a column watched by the
  currently running agent. Movement does not terminate the current run.
- An agent mention creates at most one activation for that agent per comment,
  including in unwatched or completed columns. It retains primary
  responsibility in the current column. A user mention creates attention
  instead. Mentions on unmapped tasks create no activation.
- Clearing the final blocking relationship creates an activation only when the
  task's current column has a watcher. Clearing an earlier blocker records
  activity without activation.
- The target agent, typed reason, exact source-event pointer, process version,
  and activation position are fixed at creation. A run additionally receives
  current task state and attempt context.
- Successful Codex completion has no implicit board effect. The framework
  records the outcome and advances the preserved queue; agents are responsible
  for comments, artifacts, and process-directed task movement.
- A forgotten or inadequate normally completed response is recovered through
  a new comment mentioning the appropriate agent and explaining the new
  expectation. There is no separate Reactivate command.
- Only technical failures reported by the runtime receive automatic retry.
  Every activation uses one framework-wide policy of three total attempts with
  capped exponential backoff. The policy is not configurable per process,
  agent, or column.
- After automatic attempts are exhausted, processing pauses for the task and a
  failure attention reason offers Retry and Dismiss. Retry begins another
  three-attempt cycle for the same activation. Dismiss records the abandoned
  expectation and advances the preserved queue.
- A permission block suspends the activation and creates user attention without
  automatic retry. The user may perform the action or adjust Codex policy and
  then continue the preserved activation.
- User interruption requests cancellation and remains Interrupting until Codex
  confirms the stop. It ends the attempt as user-interrupted, consumes no retry,
  preserves the activation at the head, and creates task automation suspension.
- Continue creates another attempt for the same activation and workspace. Its
  attempt context includes the interruption and optional user message. Without
  a message, the agent is explicitly told to reassess current task and workspace
  state.
- Process automation pause blocks all new attempts, including scheduled retries,
  across every board while allowing current attempts to finish. Startup begins
  paused. Process pause does not interrupt tasks or create task-level
  suspensions.

### Codex integration and permissions

- The TypeScript Codex SDK and streamed completion/failure events are the
  primary runtime integration. Direct Responses API use and reimplementation of
  Codex execution are excluded.
- Each distinct activation starts a fresh Codex thread. Attempts retrying,
  continuing, or recovering that activation resume its thread when supported
  and usable, with a fresh-thread fallback. Distinct activations never share
  hidden conversation context.
- A thread ID is attached to each attempt and its run-start activity because a
  later attempt may resume or replace the thread. Codex owns complete transcript
  persistence; losing a Codex transcript never removes durable board history.
- The framework uses direct App Server integration only in a later version if a
  richer Codex-native client, interactive approvals, or deeper conversation UI
  justifies the additional protocol ownership.
- Every agent run inherits the same user-controlled Codex permission policy as
  resolved for the SDK process. The framework defines no technical permissions
  by process, role, agent, branch, or process-definition file and does not
  override sandbox or approval settings.
- Agent role instructions are behavioral guidance, not technical authority.
  The first version has no framework approval UI and no interactive approval
  handling.

### Durable coordination state and consistency

- A framework-owned local relational store holds authoritative current state
  and immutable authored/framework records. The activity ledger explains state
  but is not used as an event-sourced reconstruction mechanism.
- Durable state includes applied process identities; tasks, revisions, archive
  state, attachments, comments, relationships, and attention; activity;
  ordered activations and provenance; attempts, timing, outcomes, diagnostics,
  retry schedules, and thread IDs; attempt context; task automation suspension;
  and idempotency and scheduling records.
- Process-definition source, Git worktrees, and full Codex transcripts remain
  outside the coordination store.
- Every logical board command transactionally changes current state, appends
  activity, and creates resulting activations. Database constraints enforce
  strict activation order and one active run per task.
- Mutable commands use optimistic revisions and return current state on
  conflict. Naturally additive distinct comments may succeed concurrently.
  Retriable tool and transport calls use idempotency keys.
- Committed state and queued activations survive process or machine restart.
  A previously running attempt without a live executor becomes a technical
  interruption failure and follows automatic retry; it is not a user
  interruption.
- Delivery is at least once. Atomic and idempotent board commands prevent
  duplicate or half-applied coordination state, while attempt context tells a
  retried agent that workspace or external effects may already exist.
- Startup validates storage and completes migrations before dispatch. Storage
  unavailability, inconsistency, or failed migration prevents both agent
  dispatch and board mutation and never substitutes a new empty store.
- Schema migration creates a verified backup first. Damaged state is preserved,
  and the first version documents manual backup and restore.
- Tasks and complete histories have no age-based retention limit. Archival is
  reversible at the coordination-record level, subject to separate Git
  workspace behavior.

### Git task workspaces

- The framework provisions and owns one Git worktree per task and gives that
  directory to every Codex run for the task. It does not use Codex-managed app
  worktrees. Parent and child tasks always have separate workspaces.
- Provisioning occurs just in time after the first activation becomes runnable
  and before its thread begins. The configured starting ref is resolved then,
  and the worktree is created detached at the resulting commit.
- A child task may specify its own starting ref. Only committed,
  Git-addressable state transfers; the framework never copies dirty parent
  files, applies patches, or creates hidden snapshot commits.
- Process instructions control branch creation, ancestry, commits, merge
  targets, and integration. The framework does not infer or enforce one Git
  topology.
- Worktrees live at stable paths under a framework-owned workspace root outside
  the primary checkout. That root is deployment configuration rather than
  process configuration. Provisioning and removal are serialized per project;
  normal runs in different task worktrees may remain concurrent.
- Before every run, the framework verifies that an existing worktree still
  exists and is registered as expected. Missing or invalid workspaces stop the
  activation for explicit recovery and are never reconstructed automatically.
- Completion does not remove a worktree. Archival is the cleanup boundary and
  is rejected while the task has active, queued, failed, or interrupted work;
  while its worktree has staged, modified, or untracked files; or while its
  current commit lacks a durable Git ref.
- The worktree is removed before the task is marked archived. Failure leaves
  both intact. A durable unmerged branch is sufficient for data protection;
  archival does not prove process success and never deletes branches.
- Unarchiving does not restore or remember the previous workspace commit. A
  later activation provisions a new detached worktree from the then-configured
  default starting ref.

### Observability and notification delivery

- A compact process-wide live-automation control appears in the board header.
  Its on-demand menu contains current runs across all boards with agent, task,
  board, column, status, and elapsed time. It is navigation and pause context,
  not a run-history dashboard or recovery surface.
- Task details own current automation controls and history. Activations may be
  queued, running, waiting for retry, awaiting recovery, suspended, completed,
  dismissed, or stale. Attempts may be running, interrupting, completed,
  technically failed, permission-blocked, or user-interrupted.
- Each attempt has its own timeline entry with timing and concise outcome.
  Scheduled retries display their planned time without offering recovery while
  automatic attempts remain.
- Historical failure evidence remains on attempt entries; current Retry and
  Dismiss controls appear only on the unresolved attention reason.
- Attempt transcripts open in a large read-only overlay that favors readable
  messages, useful tool activity, available diagnostics, and truncated command
  output without reproducing the full Codex client.
- The copyable thread ID appears in expanded attempt details and the transcript
  overlay. Open in Codex appears only through documented supported navigation.
- Desktop notifications are opt-in and emitted once, best-effort, for each new
  attention reason unless the user is actively viewing that task. Existing
  reasons are not replayed on startup or when notifications are enabled.
- A desktop notification includes the process or board, task ID and title, and
  attention-reason type, but no comment body, failure diagnostic, or other task
  content. Selection navigates to the reason without resolving it.

### First usable process and proof

- The example process is `Backlog → Architecture Design → Implementation → Code
  Review → Architecture Verification → Awaiting User Approval → Ready to Merge
  → Completion`.
- Backlog and Awaiting User Approval are unwatched. Architecture Designer,
  Implementation Agent, Code Reviewer, Architecture Verifier, and Merge Agent
  are distinct agents watching their respective active columns. Architecture
  Designer and Architecture Verifier have separate identities and goals.
- The Architecture Designer records a structured plan covering approach,
  affected modules, boundaries, constraints, verification, risks, trade-offs,
  likely future-change dimensions, stable assumptions, deliberate constraints,
  and resulting architectural choices.
- Code Review approval advances to Architecture Verification; requested changes
  return to Implementation. Architecture Verification may advance to user
  approval, return an implementation revision to Implementation, or return an
  architecture revision to Architecture Design. Every revision repeats Code
  Review and Architecture Verification.
- Automation stops at Awaiting User Approval. The user reviews the complete
  task history and repository result, then moves the task to Ready to Merge.
  The Merge Agent records and verifies integration before entering Completion.
- The proof uses a real, nontrivial repository change with clear behavioral
  acceptance criteria, at least two module boundaries, multiple reasonable
  designs, a plausible future-change dimension, and a size that fits one
  Implementation Agent context.
- After the user starts it, the proof reaches Awaiting User Approval through
  automatic activations and agent handoffs. It includes at least one full
  implementation/review/verification revision loop and one Code Reviewer ↔
  Architecture Designer mention round-trip without a task move.

## Testing Decisions

- Tests describe external coordination behavior rather than internal class
  structure, repository-call counts, private scheduler steps, or storage-table
  layout. They assert commands accepted or rejected, query projections, task
  and activation state, attention, durable history, dispatched run requests,
  notifications, and observable Git effects.
- The primary testing seam is the coordination framework's application-level
  command-and-query boundary. The user interface, Kanboard adapter, and agent
  MCP tools all translate through this same boundary. The seam is logical and
  does not require a particular network protocol.
- Primary behavioral tests run the real process validator, coordination rules,
  scheduler, relational store and migrations, read projections, and Git
  worktree manager. They use the production database engine in an isolated
  disposable instance and real temporary Git repositories and worktrees.
- A controlled Codex runtime adapter records prompts, working directories,
  thread start/resume behavior, streamed outcomes, and cancellation. Tests can
  deterministically complete, fail, permission-block, or interrupt attempts
  without depending on a live model.
- A controlled clock drives retry backoff, scheduling, elapsed time, and restart
  scenarios without sleeps. A controlled desktop-notification adapter records
  delivery and simulates disabled, unavailable, and failed operating-system
  delivery. These substitutes exist only at true external boundaries.
- Behavioral suites cover activation provenance and strict ordering, same-task
  serialization and cross-task concurrency, mentions, dependency unblocking,
  optimistic conflicts, idempotent retries, crash recovery, automatic retry,
  Retry and Dismiss, permission blocks, user interruption and continuation,
  process pause and drain, stale activations, unmapped tasks, archive guards,
  storage failure, and task-workspace verification.
- Focused adapter contract tests verify that the Kanboard plugin/adapter, MCP
  tools, Codex SDK wrapper, transcript access, and desktop notification gateway
  translate their external protocols to and from the shared coordination
  contract. The full behavioral suite is not duplicated through every adapter.
- A small browser-level acceptance suite runs against the assembled local
  deployment. It proves critical wiring and interaction for the main workflow,
  attention and failure recovery, process pause, task interruption and
  continuation, and guarded archival without attempting to express every
  lifecycle branch through UI automation.
- The first-usable-version acceptance proof is an end-to-end product test with
  the real UI, adapters, database, scheduler, and Git integration plus the
  controlled Codex runtime. It must exercise the nontrivial architecture-led
  task, automatic handoffs to Awaiting User Approval, a complete revision loop,
  the cross-stage mention round-trip, user authorization, merge-stage handling,
  and final completion.
- The Kanboard integration spike precedes broad implementation. Its tests must
  establish event provenance and author identity, task/detail extension fit,
  attention and recovery controls, durable consistency strategy, idempotent
  board/process synchronization, and Docker Compose access to repositories,
  workspaces, Codex authentication, and project containers. Failure against the
  stated fallback criteria selects the custom UI rather than weakening product
  behavior.
- This repository has no implementation or existing automated test suite from
  which to reuse a prior seam. The resolved workflow proof, board interaction
  prototype findings, automation-observability prototype findings, and focused
  integration research are the behavioral prior art. New tests should establish
  the confirmed application boundary as the stable testing convention.

## Out of Scope

- Hosting the framework as a service, multiple human users, human accounts,
  shared human permissions, or non-local collaboration.
- Projects that are not Git repositories or a configurable non-Git workspace
  abstraction.
- A universal hardcoded software-development process or framework-enforced
  role-specific workflow restrictions.
- A dedicated process-authoring UI, a custom VS Code extension, file watching,
  or process-definition hot reload.
- A broad Kanboard fork. If narrow adaptation is insufficient, the product uses
  the stated custom-UI fallback.
- Direct Responses API execution, a full Codex-native client, normalized Codex
  transcript replication, approval takeover, or direct App Server integration.
- Framework permissions by role or process, branch protection, special
  process-definition protection, or an interactive approval UI.
- Exactly-once external execution, event-sourced reconstruction, automatic
  corruption repair, rotating backups, or a dedicated storage-recovery UI.
- Permanent task deletion, automatic age-based retention, notification history,
  read/unread notification state, snoozing, quiet hours, or a separate
  notification center.
- A permanent operations dashboard, historical run dashboard, run-centric task
  page, comments-only or run-only timeline filters, attempt grouping, or bulk
  interruption.
- Automatic workflow effects inferred from a successful Codex response,
  semantic evaluation of whether an agent's answer was adequate, or automatic
  recovery of a forgotten handoff.
- Activation coalescing, cancellation by later events, priority scheduling,
  process-configurable technical retry policies, or automatic retry of
  permission blocks.
- Automatic reconstruction of missing task workspaces, copying dirty parent
  state into child tasks, hidden snapshot commits, framework-controlled branch
  topology, merge inference, merge enforcement, or branch deletion.
- Automatically restoring a removed workspace when a task is unarchived.
- An end-to-end interactive product prototype before implementation. Prototypes
  remain appropriate only for narrow questions with a specific learning goal.

## Further Notes

- The resolved product-design map and its thirteen issue answers are the source
  of truth for this synthesis. The specification intentionally uses the domain
  vocabulary defined for the coordination framework.
- The Kanboard integration spike is a gating technical validation, not an
  invitation to weaken the durable coordination contract. In particular, the
  final design requires authoritative relational state and atomic logical board
  commands even though Kanboard was originally selected as the live board
  foundation. The spike must establish a single coherent ownership and
  transaction strategy; otherwise the custom UI fallback owns the board state
  directly.
- The example process is a proof of framework capability, not a process built
  into the framework. Other valid processes may use different boards, columns,
  agents, routes, rejection stages, child-task review rules, and Git practices.
- Process guidance should tell each example agent to leave a task comment with
  its result or point to an authoritative repository artifact. This is an
  example-process convention rather than a framework-enforced document format.
- Implementation tickets should preserve the application command-and-query
  boundary as a deep module and split work into dependency-aware vertical
  slices. The next workflow step is to turn this specification into tickets.

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
- [Trust Task Workspaces for Git Inspection](./issues/49-enable-agent-git-operations-in-task-workspaces.md)
  — Give every SDK attempt exact process-local Git ownership trust for its task
  workspace while leaving sandbox and approval authority under the user's
  ordinary Codex configuration.
- [Investigate SDK Capability Parity and Automatic Approvals](./issues/51-investigate-sdk-capability-parity-and-automatic-approvals.md)
  — Keep the supported TypeScript SDK, inherit ambient capability settings, and
  add only on-request Auto-review for scoped escalation; retain explicit
  permission-block continuation because the SDK exposes no approval events.
- [Enable Automatic Approval Review for Agent Runs](./issues/54-enable-automatic-approval-review-for-agent-runs.md)
  — Route unattended SDK escalations through on-request Auto-review while
  preserving inherited capabilities, and require durable explicit user context
  before retrying an unresolved permission block.
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
- [Structure Task History by Cause and Attempt](./issues/37-structure-task-history-by-cause-and-attempt.md)
  — Project durable history into independent, start-positioned attempt blocks
  with readable outcomes, authored work, compact prose, and backward causal
  links while folding duplicate lifecycle noise out of the user-facing timeline.
- [Make Task Relationships Discoverable and Recoverable](./issues/48-make-task-relationships-discoverable-recoverable.md)
  — Group relationships by meaning, add project-wide task finding, and let
  users safely remove mistaken blocking relationships.
- [Separate Framework, Process, and Role Instructions](./issues/38-separate-framework-process-role-instructions.md)
  — Compose product-owned invariant mechanics, authored process and board
  guidance, role instructions, and readable activation facts in one explicit
  hierarchy, with compact same-process continuation.
- [Let Mentioned Agents Claim Primary Responsibility](./issues/52-let-mentioned-agents-claim-primary-responsibility.md)
  — Treat a mentioned agent's move into its own watched column as an explicit
  responsibility claim that continues the mention activation without queuing
  redundant work, while preserving ordinary handoffs in every other case.
- [Show Token Usage in Attempt Transcripts](./issues/53-show-token-usage-in-attempt-transcripts.md)
  — Persist complete per-attempt SDK usage and show only uncached input and
  output in a compact field beside the transcript's thread controls.
- [Relocate a Project State Root](./issues/34-relocate-project-state-root.md)
  — Move the bound state root through one offline destination-only CLI command,
  with exclusive access, canonical destination safety, staged validation,
  supported Git repair, durable interruption recovery, and binding-last cutover.

- [Prove the First Usable Workflow](./issues/28-prove-first-usable-workflow.md)
  — Drive the architecture-led example through design, implementation rework,
  in-place consultation, explicit user approval, verified Git integration, and
  Completion in a controlled browser proof backed by a live operating guide.

## Clarified delivery follow-ups

- [Archive Tasks Without Losing Work](./issues/27-archive-tasks-without-losing-work.md)
  — Keep detailed transcripts until explicit archival, then discard them with
  the task workspace while retaining concise attempt history.
- [Observe Task Activity and Running Attempts Live](./issues/32-observe-running-attempts-live.md)
  — Keep an open task timeline current across comments, activations, activity,
  and attempt changes; update transcript activity during a run and persist every
  finished attempt's captured transcript until task archival.
- [Support Dark Mode](./issues/55-support-dark-mode.md)
  — Add an accessible system-aware light/dark appearance preference while
  preserving the few intentional semantic color relationships and leaving the
  broader palette to implementation judgment.
  **Resolved:** Added a pre-paint, locally persisted system/light/dark preference
  and a semantic dark palette across the browser UI while preserving the
  accepted light appearance and interaction state.
- [Reduce Agent-Run Context Overhead](./issues/56-reduce-agent-run-context-overhead.md)
  — Replace oversized successful agent-mutation results with compact
  acknowledgements and document the complete MCP tool surface.
  **Resolved:** Agent mutations no longer repeat full task projections; the
  concise MCP reference and contract tests cover all thirteen tools.
- [Wrap Wide Transcript Content](./issues/58-wrap-wide-transcript-content.md)
  — Keep transcript prose and tool output inside the viewer, containing any
  intentional code scrolling within the relevant content block.
  **Resolved:** Transcript headers and records now stay within narrow dialogs,
  while preformatted tool output preserves whitespace and scrolls locally.
- [Make Every Task Attention Reason Actionable](./issues/57-make-task-attention-actionable.md)
  — Give every task-level attention reason a concrete resolution path, move
  user-mention acknowledgement to its source comment, and compact interruption
  recovery into the attention panel.
  **Resolved:** Attention now precedes long descriptions and links mention
  requests to source-local acknowledgement and Reply actions; interruption
  decisions open a compact Continue/Dismiss dialog from the attention reason.

## Not yet specified

- [Add Notification Settings and Refine the Top Bar](./issues/59-notify-agent-handoffs-to-user.md)
  — Move notification and appearance preferences into categorized settings,
  add per-column subscriptions, and clarify top-bar operational controls.
  **Resolved:** Durable process-bound policy and occurrence cursors now feed a
  browser-local permission and OS-delivery adapter; categorized Settings owns
  notification and Appearance preferences, while the top bar exposes concise
  automation, current-run, and settings controls.
- [Dismiss Startup Impact After Accepting Board Changes](./issues/60-dismiss-startup-impact-after-acceptance.md)
  — Remove resolved startup-impact state immediately and durably after the user
  accepts or dismisses all actionable effects.
  **Resolved:** Startup projections now omit fully resolved process-definition
  impact across refresh and restart while preserving partial and later impacts.
- [Remove Mojibake Characters from the UI](./issues/61-remove-mojibake-ui-characters.md)
  — Correct the encoding boundary that renders intended punctuation as stray
  characters such as `Â·`.
  **Resolved:** Corrected the process-change panel's source literals and added
  repository-wide browser-source and representative rendered-UI coverage.
- [Review Agent Commits While Task Worktrees Are Open](./issues/62-review-agent-commits-with-open-worktrees.md)
  — Investigate safe review workflows that respect Git linked-worktree
  constraints without discarding or disrupting active task workspaces.
  **Resolved:** Open the task's linked worktree directly in Visual Studio for
  review; this avoids switching the primary worktree and requires no framework
  workspace changes.
- [Evaluate an Initial-Prompt Token Breakdown](./issues/63-evaluate-initial-prompt-token-breakdown.md)
  — Determine whether initial prompt usage can be measured and presented
  separately without misrepresenting SDK token accounting.
  **Resolved:** Exact component attribution is unavailable, while continued
  Codex threads already preserve an append-only, session-keyed, cache-friendly
  prefix; close without speculative UI and use attempt-level cache diagnostics
  before considering prompt or compaction tuning.
- [Show Additional Line Counts on Timeline Expansion Controls](./issues/64-show-collapsed-line-counts.md)
  — Tell users how much collapsed timeline prose a Show more action will reveal.
- [Link Relationship Timeline Events to Related Tasks](./issues/65-link-relationship-events-to-tasks.md)
  — Make child, dependency, and other relationship events navigate directly to
  the related task, including from historical entries.
  **Resolved:** Timeline relationship history now links every inspectable
  child, parent, dependency, and blocking target after creation or removal,
  discloses completed and archived state, and presents unavailable IDs without
  dead navigation while preserving attempt grouping.
- [Render Markdown in Task Descriptions and Timeline Comments](./issues/66-render-task-markdown.md)
  — Safely render a defined Markdown subset while preserving mentions,
  authored source, compact previews, and responsive layout.
  **Resolved:** Task descriptions, authored timeline messages, and outcomes now
  render safe CommonMark with raw-source copy controls; unsafe HTML, images,
  and URL schemes remain inert, and Mermaid remains ordinary fenced code.
- [Archive Task Worktrees Owned by a Different Windows Identity](./issues/67-archive-differently-owned-worktrees.md)
  — Give host-side archival exact process-local Git trust and preserve distinct
  dirty, durability, registration, ownership, and removal outcomes.
- [Add Files to Conversation Follow-Ups](./issues/68-define-user-file-attachment-workflows.md)
  — Start from file uploads on continuing-conversation follow-ups and decide
  ownership, storage, agent delivery, safety, and whether task or comment
  attachments belong in the first increment.
  **Ready:** Conversation-only follow-up attachments now have explicit upload,
  ownership, storage, Codex delivery, browser safety, retention, and acceptance
  criteria without introducing task-wide or cross-conversation sharing.
  **Resolved:** Follow-up composers now upload and present conversation-owned
  file chips, suppress unsafe browser file navigation, preserve and download
  originals from framework state, expose scoped files and native current images
  to Codex, and remove attachment content during task archival.
- [Wrap Long Lines in Rendered Markdown Code Blocks](./issues/69-wrap-rendered-markdown-code-lines.md)
  — Keep fenced Markdown code inside its content surface and visibly wrap long
  lines instead of widening the task UI or relying on horizontal scrolling.
  **Resolved:** Shared rendered Markdown code now wraps ordinary and unbroken
  long lines without widening task surfaces, while preserving exact authored
  whitespace and raw-copy behavior across descriptions and timeline content.
- [Define Process-Owned Token Pricing and Cost Display](./issues/70-define-process-owned-token-pricing.md)
  — Specify optional, version-safe model pricing in the process definition and
  calculate cost only when trustworthy per-attempt usage and complete pricing
  metadata are available.
  **Resolved:** Exact-model USD-per-million pricing now produces immutable
  per-attempt estimates plus known-subtotal conversation totals in run,
  conversation-header, and task-detail conversation surfaces; priceable active
  runs add a pending spinner without inventing live usage.
- [Isolate Token Usage for User Follow-Ups](./issues/71-isolate-follow-up-token-usage.md)
  — Closed without implementation after the replacement agent-conversation
  design removed per-run token usage and temporarily removed the combined
  conversation token display.
- [Keep Comment Replies in Timeline Context](./issues/72-keep-comment-replies-in-context.md)
  — Keep the single Add comment composer available at the viewport bottom while
  reading the timeline, preserve one draft and its source position across Reply
  and submission, and auto-grow the textarea within a context-preserving cap.
  **Resolved:** The measured composer now sticks beside timeline evidence,
  grows within a viewport-aware cap, keeps autocomplete and final timeline
  controls visible, and preserves composition context through Reply and retry.
- [Explore Codex Compaction-Threshold Parity](./issues/74-explore-codex-compaction-threshold-parity.md)
  — Preserve Codex's model-aware, cost-conscious compaction default rather than
  pinning a framework threshold merely for parity.
  **Resolved:** SDK Codex 0.146.0 already inherits a 272,000-token raw window and
  derives compaction at 244,800 tokens; keep that default, with optional
  process-owned control only if a deliberate non-default ceiling is needed.
- [Explain Token Cost Breakdown](./issues/75-explain-token-cost-breakdown.md)
  — Let each available cost control disclose the token quantity, snapshotted
  per-million rate, and subtotal for every billable category, including
  truthful aggregation, pending work, and known-cost lower bounds.
  **Resolved:** Hovering or focusing either aggregate cost control now shows a
  compact calculation breakdown backed by the usage and rates snapshotted when
  each priced attempt settled.
- [Correct Conversation Cost Aggregation](./issues/76-correct-conversation-cost-aggregation.md)
  — Establish whether continued-turn SDK usage is cumulative, isolate each
  turn exactly once, and show one truthful accumulated cost breakdown per
  agent conversation instead of repeating per-turn splits.
  **Resolved:** Treat `turn.completed.usage` as a cumulative thread checkpoint;
  price its newest trustworthy snapshot once per stable-price thread lineage,
  falling back to isolated attempt deltas across price or trust boundaries.
- [Reconcile Conversation Usage with Automatic Compaction](./issues/77-reconcile-conversation-usage-with-compaction.md)
  — After cost accounting rules out cumulative-display inflation, determine
  whether unusually high cached input reflects cumulative metered work or an
  actual failure to inherit Codex's automatic-compaction behavior.
  **Resolved:** Local evidence separated 587,019 cumulative tokens from 61,084
  active-context tokens in a 258,400-token window; preserve inherited compaction
  and show Codex's latest context calculation as an optional conversation meter.
- [Disclose Agent-Inspectable Task Content](./issues/78-disclose-agent-inspectable-task-content.md)
  — Give task-detail content a consistent accessible marker when it is exposed
  through agent coordination tools, leaving user-only content unmarked.
  **Resolved:** Task details now derive durable disclosure membership from the
  agent-facing task, activity, and attachment projections and carry one
  accessible marker across current state, grouped timeline records, and
  matching conversation content while leaving user-only evidence unmarked.
- [Filter the Timeline to Agent-Inspectable Events](./issues/79-filter-timeline-to-agent-inspectable-events.md)
  — Let users reduce long timelines to the exact coordination evidence agents
  can inspect, using the same authoritative visibility semantics as the UI.
  **Resolved:** The timeline now switches between complete history and the
  projection-derived agent-visible subset while preserving mixed attempt
  grouping, expansion, viewport position, and the selected view across refresh.
- [Keep Bottom-Anchored Conversation Follow-Ups Visible](./issues/80-keep-bottom-anchored-conversation-following.md)
  — Keep a conversation following its end when a user submits there while
  preserving the reading position of users who have scrolled away.
- [Preselect the Most Recent Task Agent in Mention Autocomplete](./issues/81-preselect-most-recent-task-agent-mention.md)
  — Make the latest applicable task agent the active `@` suggestion so common
  replies need no name typing without inserting or submitting automatically.
  **Resolved:** Empty mention autocomplete now selects the current-directory
  agent owning the task's most recently started attempt, falls back without
  retargeting when that identity is unavailable, and preserves explicit
  selection and submission semantics.
- [Omit Self-Authored Comments from Continuation Updates](./issues/82-omit-self-authored-comments-from-continuation-updates.md)
  — Keep resumed-agent change summaries focused on new external information by
  omitting the agent's own comments already preserved in its conversation.
- [Show Process Cost Statistics in Settings](./issues/83-show-process-cost-statistics-in-settings.md)
  — Add a quiet read-only Settings section for the process's currently
  configured model rates and the truthful accumulated estimated cost across
  all retained tasks.
  **Resolved:** Settings now summarizes total and per-task cost across retained
  active and archived work, preserves historical prices and cumulative-thread
  accounting, and lists the process's current per-million-token model rates.
- [Show Live Task-Workspace Git State](./issues/33-show-live-task-workspace-git-state.md)
  — Evaluate a richer automatically updating branch, commit, dirty-file, and
  optional storage summary after basic workspace discovery proves useful.
- [Make Participant Mentions Discoverable](./issues/35-make-participant-mentions-discoverable.md)
  — Evaluate lightweight `@` autocomplete against an explicit recipient
  control and highlight submitted mentions so users can address agents and see
  the resulting activation or attention without memorizing stable IDs.
- [Discard an Interrupted Activation](./issues/50-discard-interrupted-activation.md)
  — Decide how a user deliberately abandons preserved interrupted work, what
  happens to later queued activations, and how the decision remains auditable.

## Maintainer refactoring research

- [Evaluate the Web API Routing Boundary](./issues/84-evaluate-web-api-routing-boundary.md)
  — Decide whether direct Node.js routing, a small project-owned dispatcher, a
  focused router, or a web framework best isolates endpoints for this
  repository's AI maintainer without moving application authority into HTTP.
  **Resolved:** Keep stable Node HTTP and extract a dependency-free tiny typed
  dispatcher shared mechanically by separately registered browser and agent
  route sets; preserve raw streaming and application authority, and stop if
  the proof cannot remain small or enable focused fake-capability tests.
- [Evaluate TypeScript Persistence and Migration Tooling](./issues/85-evaluate-typescript-persistence-tooling.md)
  — Decide whether an ORM, query builder, migration toolkit, or refined raw-SQL
  boundary best supports AI-maintained persistence, while preserving issue 42's
  released-schema upgrade and recovery guarantees.
  **Resolved:** Keep synchronous built-in `node:sqlite` and visible
  project-owned SQL, improve only the typed statement/row-decoding boundary,
  and keep released-schema backup and migrations under an application-owned
  registry; prototype Drizzle's steady-state query and migration ergonomics,
  with stable native-driver support or a justified permanent driver change as
  a separate production gate.
- [Reassess Automation Persistence Lifecycles](./issues/89-reassess-automation-persistence-lifecycles.md)
  — After activation-resolution commands have their own cohesive home, decide
  whether scheduling, workspace claims, interruption, attempt settlement,
  retries, transcript usage, and failure attention still belong behind one
  automation persistence interface or warrant lifecycle-focused deep modules.
  **Resolved:** Replace the broad store with lifecycle-focused activation
  scheduling, active-attempt, and settlement-only evidence modules over the one
  database owner; keep asynchronous runtime control in the coordinator and stop
  if the extraction leaks transaction choreography or duplicates policy.
- [Evaluate the Codex Runtime Event Seam](./issues/90-evaluate-codex-runtime-event-seam.md)
  — Decide whether SDK thread execution, streamed-event state, live transcript
  evidence, outcomes, usage, and rollout context measurement should remain one
  runtime module or gain a smaller event/evidence seam for safer SDK changes.
  **Resolved:** Keep one external Codex runtime adapter, but move whole-stream
  event interpretation into one internal attempt projector and isolate private
  rollout context evidence separately; preserve construction, replacement
  provenance, coordination semantics, and persistence in their current owners.

## Maintainer refactoring prototypes

- [Prototype Drizzle Persistence and Migration Ergonomics](./issues/87-prototype-drizzle-persistence-migrations.md)
  — Compare a fully transitioned Drizzle slice with typed project-owned SQL for
  routine queries, a difficult projection, and a populated released-like
  schema upgrade, judging only steady-state maintainer value while keeping
  issue 42's recovery envelope application-owned.
  **Resolved:** Prefer Drizzle as the future query and migration-drafting
  direction, but keep production on `node:sqlite` and owned SQL until a stable
  native adapter passes strict typecheck and the transaction-local proof;
  generated migrations remain reviewed drafts inside issue 42's application
  safety envelope.

## Maintainer refactoring implementation

- [Isolate Web API Routes Behind a Typed Dispatcher](./issues/86-isolate-web-api-routes-behind-typed-dispatcher.md)
  — Keep Node HTTP while replacing the browser and agent conditional chains
  incrementally with separately registered, capability-narrowed route modules
  behind one dependency-free typed dispatcher, preserving all transport and
  application-authority behavior.
  **Resolved:** All 52 browser and agent method/template pairs now register
  through a small typed literal/named-segment dispatcher; browser and
  bearer-authenticated agent composition remain separate, route groups receive
  narrow capabilities, streaming/static behavior stays raw and unchanged, and
  the deterministic catalogs have complete inventory coverage.
- [Localize Activation Resolution Commands](./issues/88-localize-activation-resolution-commands.md)
  — Preserve retry, permission continuation, and ordinary, interrupted, stale,
  or failed activation dismissal while moving their complete activation,
  attention, suspension, activity, and idempotency behavior behind one cohesive
  internal module.
- [Extract Retained Attempt Evidence](./issues/91-extract-retained-attempt-evidence.md)
  — Preserve transcript, cumulative-usage, pricing, and cost behavior while
  moving truthful retained evidence behind one private settlement-only module.
- [Localize Activation Dispatch Preparation](./issues/92-localize-activation-dispatch-preparation.md)
  — Combine runnable selection and claiming, then hide workspace registration,
  release, startup failure, and attempt-start persistence around coordinator-owned
  Git preparation.
- [Deepen the Active Attempt Lifecycle](./issues/93-deepen-active-attempt-lifecycle.md)
  — Centralize started-attempt settlement, interruption, retry, permission,
  recovery, attention, activity, conversation, and idempotency behavior, then
  remove the superseded broad automation store.
- [Project Codex Events into Attempt Evidence](./issues/94-project-codex-events-into-attempt-evidence.md)
  — Keep one external Codex runtime adapter while moving SDK event validation,
  live transcript state, usage decoding, and terminal precedence behind one
  internal attempt-local whole-stream projector.
  **Resolved:** One SDK-typed whole-stream projector now owns attempt-local
  transcript replacement, live defensive snapshots, usage decoding, event
  guards, coordination failure tracking, permission reporting, and terminal
  precedence; the external runtime retains construction, lifecycle, evidence
  storage, context measurement, MCP release, and replacement provenance.
- [Isolate Local Codex Session Evidence](./issues/95-isolate-local-codex-session-evidence.md)
  — Hide private rollout discovery, cached backward JSONL scanning, context
  decoding, and percentage calculation behind one fail-optional reader without
  changing execution authority or the context meter.
  **Resolved:** One pinned private reader now owns default-root resolution,
  recursive cached discovery, backward JSONL scanning, strict context decoding,
  percentage calculation, and fail-optional local I/O; the runtime retains only
  attempt-keyed evidence storage and cannot let a missing or rejected read alter
  the run outcome.
- [Recover Resumed Codex Threads from Lazy Stream Failures](./issues/96-recover-resumed-codex-threads-from-lazy-stream-failures.md)
  — After event projection is localized, let one fresh replacement recover a
  resumed run that fails before thread identity during lazy stream iteration,
  without treating cancellation or observable work as safe to replay.

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

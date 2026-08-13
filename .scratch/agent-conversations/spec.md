# Agent Conversations

Type: specification
Status: ready-for-agent
Source: [Interactive Codex Thread Integration](./research/interactive-codex-thread-integration.md)

## Problem Statement

Agent runs are currently inspectable only as read-only attempt transcripts in
the task timeline. After a run finishes, the user cannot ask that agent a
follow-up question in the context of the completed conversation. The user must
instead create another task comment or activation, which starts a separate
conversation and repeats context that Codex already has.

Attempt transcripts are also reachable primarily through individual timeline
entries. A task with many comments, movements, activations, retries, and runs
develops a long timeline, making it unnecessarily slow to find and revisit the
agent conversations created for that task.

The user needs conversations to remain directly accessible and continuable
without weakening the task-centered coordination model. A follow-up may cause
repository and board actions, so it must execute as a normal, attributable
agent run rather than as an untracked chat exchange. It must retain the
conversation's original agent even when the task has since moved to a column
watched by another agent.

## Solution

Promote the current attempt-transcript experience into task-scoped **agent
conversations**. A conversation is a durable framework-owned conversation
lineage for one task and one immutable owning agent. It contains the user
follow-up messages and the inspectable evidence from every run that has
participated in that lineage.

The existing transcript overlay becomes a conversation view. It shows the
conversation history and, while continuation is available, provides a compact
message composer at the bottom. Submitting a follow-up creates a durable
user-follow-up activation targeted at the conversation's owning agent. The
activation enters the task's normal activation order, starts a distinct run,
resumes the conversation's current Codex thread in the task workspace, and
receives a fresh attempt-scoped coordination MCP authorization. The run and
all of its observable actions retain their normal place in the task timeline.

Add a compact Conversations section at the bottom of the task detail page's
right column. It is primarily a history and access surface. Each conversation
is represented by one small, fully clickable row containing the agent name, a
short generated title or preview, and at most a small status dot. The section
is ordered by most recent activity. It provides fast access without becoming a
second live-operations dashboard.

## User Stories

1. As a user, I want to ask a follow-up question after an agent run finishes, so that I can continue the existing discussion without restating its context.
2. As a user, I want a follow-up to resume the selected conversation, so that Codex retains the useful history of that conversation.
3. As a user, I want every follow-up to create a distinct agent run, so that its messages, tools, board actions, timing, outcome, and token usage have the correct timeline context.
4. As a user, I want follow-up runs to use the task's existing workspace, so that the agent sees the repository state produced by earlier task work.
5. As a user, I want a conversation to belong to one specific agent, so that continuing it preserves the role and perspective I selected.
6. As a user, I want the conversation's original agent to handle a follow-up even after the task moves to another column, so that workflow position does not silently change the conversation's identity.
7. As a user, I want continuing a conversation not to transfer primary workflow responsibility by itself, so that the task stays in its current column unless the agent deliberately moves it.
8. As a user, I want the resumed agent to receive its current role and process instructions, so that a follow-up does not execute under obsolete operating guidance.
9. As a user, I want my follow-up message retained as authored conversation history, so that later readers can understand what caused the new run.
10. As a user, I want follow-up activations to preserve their source message, target agent, and conversation identity, so that retries and recovery remain explainable.
11. As a user, I want follow-ups to obey the task's existing activation order, so that a chat message cannot race or bypass earlier task work.
12. As a user, I want at most one run active for the task, so that conversation continuation cannot introduce conflicting changes in one workspace.
13. As a user, I want different tasks to retain their existing concurrency, so that this safety rule does not serialize unrelated work.
14. As a user, I want a follow-up submitted while earlier activations are pending to wait in the ordinary task order, so that the request is durable without receiving special priority.
15. As a user, I want the normal technical retry policy to apply to a follow-up activation, so that transient runtime failures recover consistently.
16. As a user, I want permission blocks, failures, interruptions, and attention from a follow-up to use the existing recovery surfaces, so that conversations do not create a second recovery model.
17. As a user, I want every follow-up attempt to receive fresh task- and agent-scoped coordination authorization, so that a completed run's revoked credentials are never reused.
18. As a user, I want a follow-up agent to retain access to the coordination tools appropriate to its new attempt, so that it can inspect, comment on, and move the task when its role requires that action.
19. As a user, I want the conversation view to show the combined inspectable history of all participating runs, so that I can read the discussion in one place.
20. As a user, I want run boundaries to remain visible within a conversation, so that I can relate messages and tool activity to their corresponding timeline run.
21. As a user, I want running conversation content to refresh without losing my reading position, so that continuation remains usable while the agent works.
22. As a user, I want the conversation view to follow new content only when I am already near its bottom, so that live updates do not pull me away from older evidence.
23. As a user, I want the message composer at the bottom of the conversation, so that asking the next question feels like a normal chat interaction.
24. As a user, I want the composer disabled while that conversation cannot safely continue, so that the interface does not accept work it cannot execute.
25. As a user, I want a clear explanation when continuation is unavailable, so that a disabled composer is understandable.
26. As a user, I want the existing View Transcript action renamed to View Conversation, so that the interface describes the continuable object accurately.
27. As a user, I want any historical run's View Conversation action to open the conversation containing that run, so that timeline evidence remains a useful entry point.
28. As a user, I want the opened conversation to identify its owning agent, so that I know who will receive a follow-up.
29. As a user, I want a compact Conversations section on the task detail page, so that I can find task conversations without scanning a long timeline.
30. As a user, I want that section at the bottom of the right column, so that it supplements rather than displaces primary task information and controls.
31. As a user, I want each conversation represented by one compact row, so that many conversations can fit within one visible screen.
32. As a user, I want the entire conversation row to be clickable, so that a separate View button does not consume space.
33. As a user, I want each row to show only the owning agent and a short generated title or preview, so that the list remains easy to scan.
34. As a user, I want conversations ordered by latest activity, so that recently used conversations remain easiest to reach.
35. As a user, I want no visible status decoration for an idle completed conversation, so that ordinary history remains visually quiet.
36. As a user, I want a small green dot for a running conversation, so that active continuation is visible without adding status text.
37. As a user, I want a small yellow dot when a conversation needs attention, so that exceptional state is visible without turning the section into a dashboard.
38. As a keyboard or assistive-technology user, I want clickable rows and status dots to expose accessible names and focus states, so that compact presentation does not remove meaning or operability.
39. As a user, I want multiple conversations with the same agent to remain distinguishable by their titles or previews, so that agent name alone does not make the index ambiguous.
40. As a user, I want conversation history to remain readable when its owning agent no longer exists, so that process evolution does not erase evidence.
41. As a user, I want continuation disabled when the owning agent no longer exists in the applied process, so that the framework does not silently substitute another role.
42. As a user, I want an agent rename to preserve conversation ownership, so that editable display names do not break history.
43. As a user, I want the historical agent-name snapshot available when the owning agent has been removed, so that the conversation remains identifiable.
44. As a user, I want archived-task transcript retention to remain unchanged, so that this feature does not silently weaken the existing archive boundary.
45. As a user, I want conversations for an archived task to be non-continuable, so that no run starts without an available task workspace and retained conversation evidence.
46. As a user, I want conversation continuity failures to be visible, so that a replacement Codex thread is not presented as though it retained unavailable model history.
47. As a user, I want a conversation entry to remain stable if Codex must replace an unusable underlying thread, so that a technical recovery does not create confusing duplicate navigation entries.
48. As a user, I want a fresh unrelated activation to create its own conversation, so that separate agent expectations do not inherit hidden conversation context.
49. As a user, I want retries of one activation to remain in its existing conversation, so that technical recovery does not fragment one logical exchange.
50. As a user, I want conversation and follow-up state to survive application restarts, so that the feature is not dependent on one host process.
51. As a user, I want stale or duplicate follow-up submissions handled idempotently, so that network retries cannot create duplicate activations or messages.
52. As a user, I want conversation access to remain task-scoped, so that a conversation cannot be continued from the wrong task or workspace.

## Implementation Decisions

### Domain model

- Introduce **agent conversation** as a framework-owned durable lineage. It is
  distinct from an activation, an attempt, an attempt transcript, and a raw
  Codex thread.
- A conversation has a stable generated ID, one task ID, one immutable owning
  agent ID, a historical owning-agent name snapshot, a generated title or
  preview, creation and latest-activity timestamps, and its current Codex
  thread identity when one is available.
- Conversation ownership is resolved from the stable agent ID. Renaming an
  agent changes its current display name without changing ownership. If that
  ID is absent from the applied process, history remains readable and
  continuation is disabled.
- A conversation may contain several activations and attempts. A distinct
  ordinary activation starts a new conversation; retries remain in the
  activation's conversation; a user follow-up creates a new activation in the
  selected conversation.
- A conversation is a lineage rather than an alias for one raw thread ID. If
  Codex cannot resume the current thread and the existing supported recovery
  path creates a replacement, the conversation retains its stable identity,
  records the continuity break, and adopts the replacement thread for later
  turns.
- Existing pre-release coordination state remains disposable under the
  repository's current schema policy. This feature does not introduce a
  migration requirement for pre-feature test state.

### Follow-up command and activation

- Add one user command that accepts the task ID, conversation ID, non-empty
  follow-up body, user actor, and idempotency key.
- The command verifies that the conversation belongs to the task, the task is
  unarchived, and the owning agent exists in the currently applied process.
  It rejects unavailable conversations without substituting the current
  column watcher or another agent.
- An accepted command transactionally persists the authored follow-up message,
  appends immutable task activity describing that the user continued the
  conversation, and creates one activation with a typed `user-follow-up`
  reason pointing to the exact authored message.
- The activation's target is the conversation's owning agent at submission
  time. It is not resolved from the task's current column and it does not move
  the task or transfer primary responsibility.
- The activation joins the task's existing strict chronological order. It may
  remain queued behind earlier work and starts only when the task is otherwise
  runnable under existing pause, blocker, suspension, stale-process, and
  one-active-run rules.
- Starting the activation uses the selected conversation's current thread ID
  as the resume target and the task's verified existing workspace as the
  working directory. It composes current process, board, and owning-agent
  instructions with concise follow-up attempt context.
- Every attempt obtains a new coordination MCP scope tied to its task, owning
  agent, and attempt. No credential survives attempt completion.
- Existing completion, technical retry, permission-block, interruption,
  process-version, and attention behavior applies without a conversation-only
  alternative state machine.

### Conversation history

- Persist user follow-up messages as authored conversation records; do not
  reconstruct them from prompts or task activity details.
- Retain attempt transcript items and usage as attempt-scoped evidence. Build
  the conversation projection by ordering its authored messages, attempts,
  and retained transcript items rather than duplicating all evidence into a
  second transcript store.
- Conversation history exposes visible run boundaries with agent, status,
  timing, and available attempt usage. Tool calls remain associated with the
  attempt that executed them.
- The initial framework-composed activation prompt is not exposed as though it
  were a short authored chat message. The conversation begins with a concise
  representation of its originating activation followed by the captured run
  evidence. Later user follow-ups appear verbatim as authored messages.
- During a running attempt, the conversation projection may combine durable
  prior history with live items from the runtime's existing transcript access.
  It preserves the established reading-position and follow-at-bottom behavior.
- Archival keeps its existing meaning: task coordination history remains, but
  detailed transcript content is removed. Archived conversations are not
  continuable and do not promise readable removed transcript evidence.

### Conversation queries and status

- Add a task-scoped conversation-index query returning compact rows ordered by
  descending latest activity. The row supplies conversation identity, owning
  agent display information, generated label, continuation availability, and
  only the status needed for the compact indicator.
- Add a conversation-detail query returning ordered conversation history,
  owning agent, continuation availability and reason, current run state, and
  the metadata needed by the existing conversation header controls.
- Conversation status is a projection of its current or latest unresolved
  participating work. The compact list renders only `running`,
  `needs-attention`, or no dot; it does not render queued, completed, failed,
  token, duration, or run-count badges.
- Running uses a small green dot. Needs-attention uses a small yellow dot and
  takes precedence when both meanings could otherwise apply. The indicator
  has an accessible text alternative and tooltip, but no permanently visible
  status label.
- Generated labels favor a concise originating-request preview and need only
  distinguish conversations within one task. User naming and renaming are not
  required.

### User interface

- Rename the current transcript overlay and its entry actions from transcript
  terminology to conversation terminology.
- Convert the overlay into a conversation view that can render several run
  segments and places a compact multiline composer after the history.
- Submitting clears the composer only after the follow-up command succeeds.
  Pending and rejected submissions retain ordinary disabled/error feedback and
  reuse an idempotency key for safe retry.
- The composer is unavailable when the task is archived, the owning agent is
  absent, a required conversation/thread reference is unavailable, or another
  existing safety rule prevents accepting the command. Rare missing-agent
  handling may remain simple: history is readable, the row appears disabled
  for continuation, and an explanation is available in the conversation.
- Timeline actions on every participating attempt open the containing
  conversation. The UI may focus or identify the originating run but does not
  require a separate attempt-only transcript modal.
- Add a Conversations panel at the bottom of the task detail page's right
  column. Rows use link/button semantics across their full clickable area,
  show the agent and short label, and remain compact enough for many entries.
- A missing agent does not make conversation history unreachable. Its row can
  still open read-only history even though continuation controls are disabled;
  visual disabled treatment applies specifically to continuation rather than
  removing navigation.
- Conversation ordering updates after a follow-up or new run so the most
  recently active entry rises to the top.

### Runtime boundary

- Retain the TypeScript Codex SDK. Direct App Server integration and Codex
  desktop sidebar adoption are not needed for this feature.
- Extend the runtime request only enough to distinguish a conversation
  follow-up and its conversation lineage from an ordinary fresh activation.
  Preserve the existing start/resume and replacement behavior.
- A replacement thread is reported back with enough lineage information for
  persistence to update the conversation and expose a continuity-break marker.
  The framework must not claim that unavailable Codex history was retained.
- Token savings are not an acceptance criterion. Continuity reduces repeated
  user explanation, but resumed history may grow and usage remains measured
  through existing attempt-level reporting.

## Testing Decisions

- Tests assert external coordination behavior rather than database tables,
  private scheduler methods, React component state, or SDK command-line
  arguments that are not part of the adapter contract.
- The primary seam is the coordination application's command-and-query
  boundary. It is the highest existing seam shared by browser APIs, durable
  state, scheduling, projections, and runtime dispatch.
- Application-level scenarios submit a follow-up command and assert the
  authored source message, `user-follow-up` activation, immutable owning agent,
  unchanged task column, activation ordering, distinct attempt, conversation
  projection, and ordinary timeline/activity evidence.
- A controlled Codex runtime asserts that the follow-up dispatch receives the
  conversation's owning agent, current thread ID, current process composition,
  and exact task workspace. It emits deterministic running, completion,
  failure, permission-block, interruption, and replacement-thread outcomes.
- Persistence/restart scenarios prove that conversation identity, messages,
  ownership, ordering, thread lineage, and continuation eligibility survive a
  restart without duplicate follow-up activation.
- Process-evolution scenarios prove that an agent rename preserves ownership,
  removal leaves history readable but disables continuation, and current
  instructions apply when the owning agent still exists.
- Ordering scenarios prove that a follow-up waits behind earlier task
  activations, cannot create a second simultaneous task run, and does not
  prevent concurrent work on another task.
- Recovery scenarios reuse the existing attempt-recovery and interruption
  testing style. They prove retries stay in the conversation, permission
  blocks use existing attention actions, and a replacement thread preserves
  the stable conversation while exposing lost continuity.
- Archive scenarios preserve the established archive contract: transcript
  content becomes unavailable, history remains, and continuation is rejected.
- Focused SDK adapter tests prove that a normal follow-up resumes the supplied
  thread in the supplied workspace and that an unusable resume reports a
  replacement thread without inventing continuity.
- One assembled browser scenario proves the critical user flow: compact rows
  appear in recent-activity order; the entire row opens the conversation; the
  user submits a follow-up; running content updates; and the resulting run is
  visible in the task timeline.
- Browser coverage also proves View Conversation naming, compact green and
  yellow accessible indicators, no idle dot, multiple conversations for one
  agent, keyboard operation, missing-agent read-only access, composer error
  behavior, responsive placement, and preservation of reading position during
  live updates.
- Existing application tests for minimal handoff, recovery, interruption,
  restart persistence, process evolution, archival, and token usage provide
  the behavioral prior art. Existing task-detail and live-transcript browser
  scenarios provide the interaction prior art; the feature extends those
  seams instead of creating a parallel test harness.

## Out of Scope

- Making framework conversations appear in the Codex desktop sidebar or
  observing turns independently started by the Codex desktop app.
- Replacing the TypeScript SDK with App Server or building a full Codex client.
- Starting follow-ups outside the coordination framework or granting durable
  conversation-wide MCP credentials.
- Transferring a conversation to another agent, choosing a different agent for
  one follow-up, or automatically substituting the current column watcher.
- User-defined conversation names, manual sorting, pinning, searching,
  filtering, grouping, deleting, merging, or forking conversations.
- A conversation dashboard, unread state, notification counts, run counts,
  duration badges, token badges, or detailed live state in the compact sidebar
  index.
- Changing the task timeline's ordering or broader visual design beyond
  renaming its conversation entry action and showing the new run/activity
  evidence.
- Changing task comments into conversation messages or mirroring every
  conversation follow-up as a task comment.
- Parallel conversations running simultaneously against one task workspace,
  priority insertion, activation coalescing, or bypassing existing task
  suspension, blocker, pause, retry, or stale-activation rules.
- Guaranteeing lower token usage, reconstructing unavailable Codex history, or
  retaining archived detailed transcripts beyond the existing policy.
- Elaborate recovery for the rare case in which the owning agent has been
  removed from the process.

## Further Notes

- The compact Conversations section is a history and access affordance. The
  task timeline remains the authoritative chronological account of authored
  task communication, workflow events, activations, and run outcomes.
- The conversation view is the authoritative reading surface for the
  conversation lineage, but attempt evidence remains attributable to the
  individual run that produced it.
- A user follow-up resembles a targeted agent mention in that it requests a
  specific agent without transferring primary responsibility. It differs by
  targeting an existing conversation lineage and by storing its authored input
  as conversation history rather than as a task comment.
- The supporting research concluded that SDK thread resumption and task
  worktree reuse are already available. The principal work is therefore the
  durable conversation model, follow-up activation, aggregated projection, and
  user interface rather than a Codex runtime replacement.
- The next workflow step is `to-tickets`, splitting this specification into
  dependency-aware vertical slices that preserve the application boundary as
  the primary seam.

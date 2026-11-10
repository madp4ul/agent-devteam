# Agent MCP tool reference

The `coordination` MCP server exposes the tools below. Read tools may inspect
shared project state. Task mutations accept any mapped mutable project task. Their required
`taskId` is `current` or a concrete ID; `current` always means the caller's task,
not the last inspected destination. The table below lists the complete tool surface.
Removed/current-only names are not MCP aliases; historical transcripts remain
recognizable. Execution, task archival, process, notification and project controls
are not agent tools.

Every result is JSON in one MCP text-content item. Rejected queries and
mutations set the MCP error flag and return the same JSON rejection used by the
agent API. Mutation `idempotencyKey` values make an exact retry return the
original result without repeating the change.
Mutations retain their normalized target/payload and caller participant:
changed payloads with a reused key reject `idempotency-conflict`, while independent
callers cannot replay each other's outcomes. Exact edit/move retries replay before
checking a now-advanced task revision. `self` resolves to the caller's stable agent ID.

| Tool | Input | Registered description | Successful result |
| --- | --- | --- | --- |
| `resource.claim` | `resourceId`, `idempotencyKey` | Claim for the authenticated current task; grant immediately or queue FIFO. | `{ accepted: true, claim: ResourceClaim }` |
| `resource.release` | `claimId`, `idempotencyKey` | Release held ownership or cancel a pending claim belonging to the current task. | `{ accepted: true, claim: ResourceClaim }` |
| `resource.list` | optional `includeArchived` | List project shared resources; archived definitions are excluded by default. | `{ available: true, resources: Resource[] }` |
| `resource.inspect` | `resourceId` | Inspect a shared resource, including an archived definition. | `{ available: true, resource: Resource }` |
| `resource.create` | `title`, optional `description`, `idempotencyKey` | Create a project shared resource. | `{ accepted: true, resource: Resource }` |
| `resource.edit` | `resourceId`, `expectedRevision`, optional `title`/`description`, `idempotencyKey` | Edit supplied fields on an active resource. | `{ accepted: true, resource: Resource }` |
| `resource.archive` | `resourceId`, `expectedRevision`, `idempotencyKey` | Archive an unused resource; its definition remains inspectable. | `{ accepted: true, resource: Resource }` |
| `board.list` | none | List boards with ordered columns, watching agents, and task counts without task payloads. | `{ available: true, boards }`; each column includes ID, name, watcher, framework/creation flags, and task count. |
| `task.list` | `boardId`, `columnIds[]`, optional `pageSize` (1–50), optional `cursor` | List a bounded page of compact task overviews from one or more explicit columns. | `{ available: true, tasks: TaskOverview[], nextCursor }` |
| `task.archive.list` | optional `pageSize` (default20/max50), `cursor` | Deliberately list tasks retained in archive history. Archived tasks are excluded from ordinary column listings. | `{ available: true, tasks: TaskOverview[], nextCursor }` |
| `task.inspect` | `taskId` (`current` or concrete), optional `targetWords` | Inspect current task state, participants, every pinned comment and a recent whole-record history page. taskId is current or a concrete ID. Continue history.nextCursor directly with task.history.list. | `{ available: true, task: TaskInspection }` |
| `task.history.list` | `taskId`, optional `targetWords` (positive/default2000), `cursor` | Read immutable comments and substantive events as JSON. Select newest whole records toward targetWords (default 2000), then return oldest-first; the boundary record can exceed the target. Counts report returned, remaining and total words/records/comments. Use the returned cursor to continue backward. Cursors keep a fixed upper watermark, ignore later arrivals, and retry identically. An activation cursor stops once at its update boundary, then returns an older-history cursor; no scope argument is needed. | `{ available: true, history: { records, returned, remaining, total, nextCursor, projection, checkpointReached?, continuation?, boundary? } }` |
| `task.attachment.list` | `taskId`, optional `pageSize` (default20/max50), `cursor` | List bounded attachment metadata on current or a concrete task ID; default 20, maximum 50 per page. | `{ available: true, attachments: Attachment[], nextCursor }` |
| `task.participant.list` | `taskId` (`current` or concrete) | List every applied process agent with its address, role, watcher responsibilities and execution state on this task. Same agent ID on another task has independent memory. taskId is current or a concrete task ID. | `{ available: true, participants: TaskParticipant[] }` |
| `attempt.context.inspect` | none | Recover the complete current framework, process, board, owning-role, and participant instructions for this attempt. | `{ attemptId, taskId, frameworkInstructions, process, board, owningAgent, participants }` directly. |
| `task.comment.add` | `taskId` (`current` or concrete), `body`, optional `pinned`, `idempotencyKey` | Append a comment on a mapped mutable project task. taskId is current or a concrete ID. Mentions address participants on the destination task, including the same agent ID on a different task. A self-mention on the caller's own task rejects the entire comment with self-mention; use a plain progress note instead. The author and origin are derived from the caller. Exact retries with the same key replay; changed payloads reject. | `{ accepted: true, taskId, revision, commentId }` |
| `task.comment.pin` | `taskId`, `commentId`, `idempotencyKey` | Mark shared current guidance on a mutable task. Text remains immutable; no mentions or activations execute. Matching state is inert. | `{ accepted: true, taskId, commentId, pinned: true, changed }` |
| `task.comment.unpin` | `taskId`, `commentId`, `idempotencyKey` | Remove shared current guidance on a mutable task. Text remains immutable; no mentions or activations execute. Matching state is inert. | `{ accepted: true, taskId, commentId, pinned: false, changed }` |
| `task.create` | `boardId`, `columnId`, `title`, `description`, `idempotencyKey` | Create independent work in an explicit board and column, with ordinary watcher activation. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.edit` | `taskId`, `expectedRevision`, optional `title`/`description`/`startingRef`, `idempotencyKey` | Edit supplied fields on current or a concrete task ID. Omitted fields stay unchanged; supply at least one field. startingRef is editable only before workspace preparation and provisioning; inspect workspaceStatus first. Ref corrections do not retry failed activations. Revision conflicts return compact current state. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.move` | `taskId`, `destinationColumnId`, `expectedRevision`, `idempotencyKey` | Move current or a concrete task ID within its board with ordinary watcher effects. A same-column move is an inert success. Requires the task's revision. | `{ accepted: true, revision, transition: { taskId, fromColumnId, toColumnId } }`; an inert result also includes `outcome: "already-in-column"`. |
| `task.child.create` | `taskId`, `boardId`, `columnId`, `title`, `description`, `resumeAgent`, optional `startingRef`, `idempotencyKey` | Atomically create new child work and an outgoing parent-child relationship from current or a concrete task ID. resumeAgent is self or an applied agent ID; completion later queues that owner. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.child.add` | `taskId`, `childTaskId`, `resumeAgent`, `idempotencyKey` | Attach an existing child to current or a concrete parent task ID without creating a task. resumeAgent is self or an applied agent ID; removal wakes nobody. | `{ accepted: true, relationship }` |
| `task.dependency.add` | `taskId`, `targetTaskId`, `resumeAgent`, `idempotencyKey` | Add an outgoing dependency from current or a concrete source task ID to existing project work. resumeAgent is self or an applied agent ID. Relating completed work does not synthesize a past completion activation. A link that closes a cycle across retained dependency/parent-child relationships rejects with `circular-relationship`, including paths through completed targets. | `{ accepted: true, relationship }` |
| `task.relationship.resume_agent.update` | `taskId`, `relationshipId`, `resumeAgent`, `idempotencyKey` | Change who reassesses a waiting task when an unresolved relationship is satisfied. Use current or a concrete source task ID. | `{ accepted: true, relationship }` |
| `task.relationship.remove` | `taskId`, `relationshipId`, `idempotencyKey` | Remove a mistaken relationship from current or a concrete task without waking its resume agent. | `{ accepted: true, relationship }` |
| `attempt.permission_block.report` | `summary` | Report that the current activation cannot complete because the Codex permission policy blocked a required action. Use only after a required action was denied and user action or a policy change is necessary. | `{ accepted: true, taskId }` |

## Resource catalog transport

Browser `/api/resources` and authenticated `/agent-api/resources` expose the same
catalog: GET lists definitions (`?includeArchived=true` includes archived ones),
POST creates, GET `/:resourceId` inspects, PATCH `/:resourceId` edits, and POST
`/:resourceId/archive` archives. Commands use the MCP fields above; resourceId is
in the HTTP path. The server supplies user/agent identity and the authenticated
agent's origin task; body fields cannot override them. Successful creation is
201, other successful requests 200, missing resources 404, invalid fields 400,
and revision/archival/idempotency conflicts 409.

Titles are required and trimmed. Descriptions are optional, default to an empty
string, and can be cleared. Edits require at least one supplied field. Revisions
begin at one and increment on successful edits/archival. Archived records are
read-only. Retry receipts retain the original result even after origin-task
archival, preventing duplicate resources on delayed retries.

## Returned records

- `Resource`: sequential project-local `id` (`R-0001`), `title`, `description`,
  `revision`, `archived`, `owner` (held claim or null), and FIFO `queue`.
- `ResourceClaim`: unique `id`, `resourceId`/`resourceTitle`, `taskId`/`taskTitle`,
  `requestingAgentId`/`requestingAgentName`, `status` (`pending`, `held`, `released`,
  `cancelled`), `requestedAt`, nullable `grantedAt` and `closedAt`. Task inspection
  exposes active `resourceClaims`; overview `waitingOn.resourceIds` identifies pending resources.

- `TaskOverview`: `id`, `title`, `boardId`, `column { id, name }`, `revision`,
  waiting state, relationships, unresolved attention, suspension/startup state,
  and compact run state.
- `TaskInspection`: `id`, `title`, `description`, `boardId`, `column`, `revision`,
  optional archive state, complete `pinnedComments`, paginated `history`, relationships, waiting/run/attention state,
  current activation, suspension state, participants, and on-demand capability flags.
  Inspected relationships additionally include `sourceTaskTitle`/`targetTaskTitle`
  without loading either endpoint's discussion.
- `TaskInspection.workspaceStatus`: `{ state: "unprovisioned" | "preparing" | "provisioned",
  startingRef, startingRefEditable }`. The ref is the task's explicit override or
  the currently applied process default; provisioned tasks retain the ref used
  to create their workspace. Archived/archiving tasks are not editable.
  A dispatch claim makes the ref immutable before asynchronous Git preparation
  starts. Ordinary title/description edits remain available during preparation
  and after provisioning. Ref edits reject blank values with
  `invalid-starting-ref`, active preparation with `workspace-preparing`, and an
  existing workspace with `workspace-already-provisioned`. A correction is
  audited with existing caller provenance and advances the task revision. It
  neither resolves startup attention nor authorizes execution: the user still
  chooses Retry and, when automation is paused, Resume. Comments never change
  workspace configuration.
- New `task.edited` activity records identify actual value changes in the
  comma-separated `changedFields` (`title`, `description`, `startingRef`).
  Changed titles retain `previousTitle`/`title`; ref edits retain
  `previousStartingRef`/`startingRef`, including the inherited process default
  when no override existed. Description bodies are not copied into edit activity.
  Older records may lack these details; their missing values are not inferred
  from the task's current state.
- `HistoryRecord`: `{ id, type, at, author: { kind, id, originTask? }, body?, details? }`.
  Comment UUIDs and multiline bodies remain intact. `body` belongs to a comment;
  event `details` are compact, including attempt outcome/summary. Routine
  `activation.created`/`attempt.started` events are excluded, not available via an
  extra full-history option. External origin titles are retained snapshot labels
  so cursor retries and word counts cannot change when another task is renamed.
- `Attachment`: `{ id, fileName, mediaType, sizeBytes }`.
- `TaskParticipant`: `{ taskId, agentId, name, role, summary, watchedColumns,
  execution: { running, queuedActivationCount, failedActivationCount,
  automationSuspended } }`. This is the process-wide roster with task-local facts;
  human attention is not an agent participant.
- Pinned comment: `{ id, body, actor, occurredAt, pinned: true, attemptId?, originTask?: { id, title } }`.
  IDs remain UUIDs. External origins are shown with title/ID in activation context
  and the browser; compact same-task context omits redundant origin text. Missing
  legacy provenance remains unknown rather than being assigned to the destination.
- `relationship`: `{ id, type, sourceTaskId, targetTaskId, resumeAgentId }`, where `type` is
  `parent-child` or `dependency`.

Query rejections use `{ available: false, reason, ... }`. Mutation rejections
use `{ accepted: false, reason, ... }`. A move rejected for `revision-conflict`
also returns compact `currentTask { id, title, boardId, columnId, revision }`, never
history. Edit conflicts use the same projection. Existing-task mutation subjects
require `current` or a concrete ID. Relationship commands do not require revisions.

## Participant identity and communication

`agentId` identifies a process definition. `(taskId, agentId)` identifies a
participant with independent conversation memory. All applied definitions are
addressable on every mapped task, regardless of board watchers or prior work.
Removed definitions remain attributable authors but are not discoverable or
activated. Conversation IDs remain internal continuity machinery.

A comment is stored only on its destination. Its mentions request ordinary
destination activations (queued if the task is busy); `@user` requests attention
there. The same agent ID on another task is not self-addressing. To reply to an
external author, post on its origin task and mention that agent there. Author,
origin and attempt are derived from the authenticated caller, never model inputs.
Archived tasks remain inspectable/read-only; mutations reject `archived-task`.
Unknown or unmapped destinations reject `not-found`. Cross-task comments do not
grant filesystem access to the destination's workspace or agent lifecycle controls.

## History and activation delivery

Human actor and author metadata use `{ kind: "user", id: "user" }`. Address
the human with `@user`, including replies to human comments. A comment's `id`
identifies its unique record, not its author. Released state is upgraded through
[migration 0013](adr/0031-canonicalize-human-attribution-in-released-state.md)
before inspection and activation delivery.

`targetWords` is an approximate amount to see, not a model-token guarantee. Count
whitespace-separated readable record values, including author/time/event details,
excluding JSON scaffolding and cursor strings. A positive target returns at least
one whole available record; the boundary record can exceed it by any amount.
`returned`, `remaining`, and `total` each contain `{ words, records, comments }`.
Ordinary totals cover the captured upper watermark. Later arrivals do not enter
or invalidate that traversal; use the returned cursor for progress, the original
cursor/arguments for an identical retry. Cross-project/task or malformed handles
reject `invalid-cursor`; non-positive/non-integral amounts reject `invalid-target-words`.

Inspection returns every current pin and its first recent history page. Its
`history.nextCursor` works directly in `task.history.list`. Metadata archive and
attachment pages instead use their own `pageSize`/cursor (default20/max50).

Returning activation JSON provides `history` for the update interval and
`fullHistory { total, included, omitted }` for full captured history, using the
same count shape. Pins and an exact source outside the page do not inflate page
counts. The activation source is full outside the page, or references its ID in
the page/pin set, with a timestamp/location. User follow-ups remain activation
requests, not invented comments.

An activation cursor stops once at the preceding composition checkpoint, reports
the boundary, and returns an older-history continuation. With no omitted updates,
that continuation is supplied directly. There is no `scope`, stale notification
or mutable reading receipt. The next activation advances through the entire
previously composed interval whether or not omitted records were retrieved.

Pin membership is shared current guidance, not another permanent history stream.
Creating a comment with `pinned: true` commits its initial membership with the
comment without a separate pin-change event. Later pin/unpin commands retain
their own audit records and link to the original comment in the browser timeline.
Fresh/replacement prompts receive all pins; returning prompts receive full newly
pinned comments and ID-only unpin notices. Unchanged membership sends nothing,
even after toggles. Audit pin events remain explicitly inspectable, but are not
automatic updates. Unpinning removes emphasis without retracting text. The full
framework/process/board/role guide is not repeated on short returning activations.

Stall recovery is a distinct activation reason supplied with its detection event
and recovery number out of three. Before finishing, establish continuation through
ordinary activation, an unresolved waiting relationship, explicit user attention,
or movement to a user-owned/Completion column. A prose-only plan does not provide
continuation. Every waiting relationship suppresses recovery without blocking
ordinary work. The third normally finished recovery without continuation creates
framework attention rather than another run; technical retries use existing policy.


## Shared resource coordination

Claims and new dependency/parent-child relationships reject combined circular
waits atomically. The check includes all retained relationships (even satisfied
ones), resource holders, and earlier FIFO waiters. Claim rejection returns
`reason: "circular-wait"`; relationship rejection keeps
`reason: "circular-relationship"`. Both include `diagnostic` with the involved
task IDs, relationship types/IDs, resource IDs and blocking chain. Inspect and
consult the participants on those tasks to stop using and release resources,
cancel pending claims, or remove unnecessary relationships before retrying.
Rejection creates no claim, activity, activation or stall-recovery exemption.

Use `resource.claim` from the task that will use the resource. An immediate held
claim needs no extra activation. A pending claim establishes a reliable wait and
suppresses stall recovery while leaving ordinary task work eligible. Release
assigns ownership to the next FIFO task and creates one `resource-granted`
activation for its original requesting participant, even if that task is busy or
paused. No other task may bypass that ownership.

Stop using a held resource before calling `resource.release`. The same command
cancels a pending claim, and any agent on that task can perform it. A release uses
the exact claim identity so an old request cannot release a newer claim. Duplicate
active claims for one task/resource fail with the existing claim; exact transport
retries retain normal idempotency behavior. Another task cannot release the claim.

Agent Completion rejects any held or pending claims. User Completion implicitly
releases held claims and cancels pending requests. Resource and task archival
reject active claims. Failure, pause and restart never silently release ownership.
Resource lifecycle events appear in task history. A grant activation retains its
historical cause after release; current dispatch/continuation context says whether
its exact claim is still held or was released, without requiring another query.

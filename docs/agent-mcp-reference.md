# Agent MCP tool reference

The `coordination` MCP server exposes the tools below. Read tools may inspect
shared project state. Task mutations accept any mapped mutable project task. Their required
`taskId` is `current` or a concrete ID; `current` always means the caller's task,
not the last inspected destination. This is the complete twenty-tool surface.
Removed/current-only names are not MCP aliases; historical transcripts remain
recognizable. Execution, archival, process, notification and project controls
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
| `board.list` | none | List boards with ordered columns, watching agents, and task counts without task payloads. | `{ available: true, boards }`; each column includes ID, name, watcher, framework/creation flags, and task count. |
| `task.list` | `boardId`, `columnIds[]`, optional `pageSize` (1–50), optional `cursor` | List a bounded page of compact task overviews from one or more explicit columns. | `{ available: true, tasks: TaskOverview[], nextCursor }` |
| `task.archive.list` | optional `pageSize` (default20/max50), `cursor` | Deliberately list tasks retained in archive history. Archived tasks are excluded from ordinary column listings. | `{ available: true, tasks: TaskOverview[], nextCursor }` |
| `task.inspect` | `taskId` (`current` or concrete), optional `targetWords` | Inspect current task state, participants, every pinned comment and a recent whole-record history page. taskId is current or a concrete ID. Continue history.nextCursor directly with task.history.list. | `{ available: true, task: TaskInspection }` |
| `task.history.list` | `taskId`, optional `targetWords` (positive/default2000), `cursor` | Read immutable comments and substantive events as JSON. Select newest whole records toward targetWords (default 2000), then return oldest-first; the boundary record can exceed the target. Counts report returned, remaining and total words/records/comments. Use the returned cursor to continue backward. Cursors keep a fixed upper watermark, ignore later arrivals, and retry identically. An activation cursor stops once at its update boundary, then returns an older-history cursor; no scope argument is needed. | `{ available: true, history: { records, returned, remaining, total, nextCursor, projection, checkpointReached?, continuation?, boundary? } }` |
| `task.attachment.list` | `taskId`, optional `pageSize` (default20/max50), `cursor` | List bounded attachment metadata on current or a concrete task ID; default 20, maximum 50 per page. | `{ available: true, attachments: Attachment[], nextCursor }` |
| `task.participant.list` | `taskId` (`current` or concrete) | List every applied process agent with its address, role, watcher responsibilities and execution state on this task. Same agent ID on another task has independent memory. taskId is current or a concrete task ID. | `{ available: true, participants: TaskParticipant[] }` |
| `attempt.context.inspect` | none | Recover the complete current framework, process, board, owning-role, and participant instructions for this attempt. | `{ attemptId, taskId, frameworkInstructions, process, board, owningAgent, participants }` directly. |
| `task.comment.add` | `taskId` (`current` or concrete), `body`, optional `pinned`, `idempotencyKey` | Append a comment on a mapped mutable project task. taskId is current or a concrete ID. Mentions address participants on the destination task, including the same agent ID on a different task. The author and origin are derived from the caller. Exact retries with the same key replay; changed payloads reject. | `{ accepted: true, taskId, revision, commentId }` |
| `task.comment.pin` | `taskId`, `commentId`, `idempotencyKey` | Mark shared current guidance on a mutable task. Text remains immutable; no mentions or activations execute. Matching state is inert. | `{ accepted: true, taskId, commentId, pinned: true, changed }` |
| `task.comment.unpin` | `taskId`, `commentId`, `idempotencyKey` | Remove shared current guidance on a mutable task. Text remains immutable; no mentions or activations execute. Matching state is inert. | `{ accepted: true, taskId, commentId, pinned: false, changed }` |
| `task.create` | `boardId`, `columnId`, `title`, `description`, `idempotencyKey` | Create independent work in an explicit board and column, with ordinary watcher activation. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.edit` | `taskId`, `expectedRevision`, optional `title`/`description`, `idempotencyKey` | Edit supplied title/description on current or a concrete task ID. Omitted fields stay unchanged; supply at least one field. Revision conflicts return compact current state. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.move` | `taskId`, `destinationColumnId`, `expectedRevision`, `idempotencyKey` | Move current or a concrete task ID within its board with ordinary watcher effects. A same-column move is an inert success. Requires the task's revision. | `{ accepted: true, revision, transition: { taskId, fromColumnId, toColumnId } }`; an inert result also includes `outcome: "already-in-column"`. |
| `task.child.create` | `taskId`, `boardId`, `columnId`, `title`, `description`, `resumeAgent`, optional `startingRef`, `idempotencyKey` | Atomically create new child work and an outgoing parent-child relationship from current or a concrete task ID. resumeAgent is self or an applied agent ID; completion later queues that owner. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.child.add` | `taskId`, `childTaskId`, `resumeAgent`, `idempotencyKey` | Attach an existing child to current or a concrete parent task ID without creating a task. resumeAgent is self or an applied agent ID; removal wakes nobody. | `{ accepted: true, relationship }` |
| `task.dependency.add` | `taskId`, `targetTaskId`, `resumeAgent`, `idempotencyKey` | Add an outgoing dependency from current or a concrete source task ID to existing project work. resumeAgent is self or an applied agent ID. Relating completed work does not synthesize a past completion activation. | `{ accepted: true, relationship }` |
| `task.relationship.resume_agent.update` | `taskId`, `relationshipId`, `resumeAgent`, `idempotencyKey` | Change who reassesses a waiting task when an unresolved relationship is satisfied. Use current or a concrete source task ID. | `{ accepted: true, relationship }` |
| `task.relationship.remove` | `taskId`, `relationshipId`, `idempotencyKey` | Remove a mistaken relationship from current or a concrete task without waking its resume agent. | `{ accepted: true, relationship }` |
| `attempt.permission_block.report` | `summary` | Report that the current activation cannot complete because the Codex permission policy blocked a required action. Use only after a required action was denied and user action or a policy change is necessary. | `{ accepted: true, taskId }` |

## Returned records

- `TaskOverview`: `id`, `title`, `boardId`, `column { id, name }`, `revision`,
  waiting state, relationships, unresolved attention, suspension/startup state,
  and compact run state.
- `TaskInspection`: `id`, `title`, `description`, `boardId`, `column`, `revision`,
  optional archive state, complete `pinnedComments`, paginated `history`, relationships, waiting/run/attention state,
  current activation, suspension state, participants, and on-demand capability flags.
  Inspected relationships additionally include `sourceTaskTitle`/`targetTaskTitle`
  without loading either endpoint's discussion.
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
Fresh/replacement prompts receive all pins; returning prompts receive full newly
pinned comments and ID-only unpin notices. Unchanged membership sends nothing,
even after toggles. Audit pin events remain explicitly inspectable, but are not
automatic updates. Unpinning removes emphasis without retracting text. The full
framework/process/board/role guide is not repeated on short returning activations.

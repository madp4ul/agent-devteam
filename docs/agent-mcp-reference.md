# Agent MCP tool reference

The `coordination` MCP server exposes the tools below. Read tools may inspect
shared project state. Task mutations accept any mapped mutable project task. Their required
`taskId` is `current` or a concrete ID; `current` always means the caller's task,
not the last inspected destination. This reference describes the delivered
surface during the staged redesign; remaining tool renames/history paging are
separate tickets. Removed comment/directory names are not MCP aliases, though
historical transcripts remain recognizable.

Every result is JSON in one MCP text-content item. Rejected queries and
mutations set the MCP error flag and return the same JSON rejection used by the
agent API. Mutation `idempotencyKey` values make an exact retry return the
original result without repeating the change.
Mutations retain their normalized target/payload and caller participant:
changed payloads with a reused key reject `idempotency-conflict`, while independent
callers cannot replay each other's outcomes. Exact edit/move retries replay before
checking a now-advanced task revision. `self` resolves to the caller's stable agent ID.

| Tool | Input | Does | Successful result |
| --- | --- | --- | --- |
| `summarize_boards` | none | Lists boards and ordered columns without task payloads. | `{ available: true, boards }`; each column includes ID, name, watcher, framework/creation flags, and task count. |
| `list_tasks` | `boardId`, `columnIds[]`, optional `pageSize` (1–50), optional `cursor` | Lists one bounded page from explicit columns. Archived tasks are excluded. | `{ available: true, tasks: TaskOverview[], nextCursor }` |
| `list_archived_tasks` | none | Lists retained archived tasks deliberately. | `{ available: true, tasks: TaskOverview[] }` |
| `inspect_task` | `taskId` | Reads one task's description and current coordination state. Activity and attachments stay on demand. | `{ available: true, task: TaskInspection }` |
| `list_task_activity` | `taskId` | Reads immutable framework activity for one task. | `{ available: true, activity: TaskActivity[] }` |
| `list_task_attachments` | `taskId` | Lists attachment metadata for one task. | `{ available: true, attachments: Attachment[] }` |
| `task.participant.list` | `taskId` (`current` or concrete) | Lists all applied process agents with task-local addresses, execution state, and watched columns; not just prior participants. | `{ available: true, participants: TaskParticipant[] }` |
| `inspect_current_task` | none | Reads the complete current task assigned to this activation. | `TaskInspection` directly, without an `available` wrapper. |
| `inspect_operating_context` | none | Recovers the complete current framework, process, board, owning-role instructions, and participant identity for the authorized running attempt. | `{ attemptId, taskId, frameworkInstructions, process, board, owningAgent, participants }` directly. |
| `task.comment.add` | `taskId` (`current` or concrete), `body`, `idempotencyKey` | Appends a comment on any mapped mutable project task; mentions create ordinary destination activations or user attention. Caller provenance is derived, not supplied. | `{ accepted: true, taskId, revision, commentId }` |
| `task.create` | `boardId`, `columnId`, `title`, `description`, `idempotencyKey` | Creates independent work with ordinary watcher effects. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.edit` | `taskId`, `expectedRevision`, optional `title`/`description`, `idempotencyKey` | Updates only supplied fields; requires at least one field. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.move` | `taskId`, `destinationColumnId`, `expectedRevision`, `idempotencyKey` | Revision-checks and moves within the selected task's board; watcher effects remain ordinary. Same-column requests are inert. | `{ accepted: true, revision, transition: { taskId, fromColumnId, toColumnId } }`; an inert result also includes `outcome: "already-in-column"`. |
| `task.child.create` | `taskId`, `boardId`, `columnId`, `title`, `description`, `resumeAgent`, optional `startingRef`, `idempotencyKey` | Creates a child and outgoing relationship atomically; taskId selects the parent. | `{ accepted: true, task: { id, title, boardId, columnId, revision } }` |
| `task.child.add` | `taskId`, `childTaskId`, `resumeAgent`, `idempotencyKey` | Attaches existing child work without creating another task. | `{ accepted: true, relationship }` |
| `task.dependency.add` | `taskId`, `targetTaskId`, `resumeAgent`, `idempotencyKey` | Adds an outgoing dependency with an explicit resume owner. | `{ accepted: true, relationship }` |
| `task.relationship.resume_agent.update` | `taskId`, `relationshipId`, `resumeAgent`, `idempotencyKey` | Reassigns an unresolved outgoing relationship; does not retarget queued activations. | `{ accepted: true, relationship }` |
| `task.relationship.remove` | `taskId`, `relationshipId`, `idempotencyKey` | Removes an outgoing relationship without deleting tasks or waking an agent. | `{ accepted: true, relationship }` |
| `report_permission_block` | `summary` | Marks this run outcome as permission-blocked after a required action is denied. | `{ accepted: true, taskId }` |

## Returned records

- `TaskOverview`: `id`, `title`, `boardId`, `column { id, name }`, `revision`,
  waiting state, relationships, unresolved attention, suspension/startup state,
  and compact run state.
- `TaskInspection`: `id`, `title`, `description`, `boardId`, `column`, `revision`,
  optional archive state, comments, relationships, waiting/run/attention state,
  current activation, suspension state, participants, and on-demand capability flags.
  Inspected relationships additionally include `sourceTaskTitle`/`targetTaskTitle`
  without loading either endpoint's discussion.
- `TaskActivity`: `{ id, type, actor, occurredAt, details }`.
- `Attachment`: `{ id, fileName, mediaType, sizeBytes }`.
- `Collaborator`: `{ id, name, summary }`.
- `TaskParticipant`: `{ taskId, agentId, name, role, summary, watchedColumns,
  execution: { running, queuedActivationCount, failedActivationCount,
  automationSuspended } }`. This is the process-wide roster with task-local facts;
  human attention is not an agent participant.
- Comment: `{ id, body, actor, occurredAt, attemptId?, originTask?: { id, title } }`.
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

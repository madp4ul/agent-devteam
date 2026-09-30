# Agent MCP tool reference

The `coordination` MCP server exposes the tools below. Read tools may inspect
shared project state. Most mutation tools are bound to the activation's current
task. Relationship reassignment and removal accept `current` or a concrete
source-task ID so agents can coordinate relationships on any active task.
`task.comment.add` also accepts any mapped mutable project task. Its required
`taskId` is `current` or a concrete ID; `current` always means the caller's task,
not the last inspected destination. This reference describes the delivered
surface during the staged redesign; remaining tool renames/history paging are
separate tickets. Removed comment/directory names are not MCP aliases, though
historical transcripts remain recognizable.

Every result is JSON in one MCP text-content item. Rejected queries and
mutations set the MCP error flag and return the same JSON rejection used by the
agent API. Mutation `idempotencyKey` values make an exact retry return the
original result without repeating the change.
Comments additionally retain the normalized target/body and caller participant:
changed payloads with a reused key reject `idempotency-conflict`, while independent
callers cannot replay each other's outcomes. These checks are not yet generalized
to the remaining mutation tools.

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
| `move_current_task` | `destinationColumnId`, `expectedRevision`, `idempotencyKey` | Revision-checks and moves the current task; a watched destination normally creates its activation. Requesting the current column is an inert success. | `{ accepted: true, revision, transition: { taskId, fromColumnId, toColumnId } }`; an inert result also includes `outcome: "already-in-column"`. |
| `create_child_task` | `boardId`, `columnId`, `title`, `description`, `resumeAgent`, optional `startingRef`, `idempotencyKey` | Creates a child task and explicitly assigns the agent that should reassess the parent when the child completes. `resumeAgent` is `self` or an agent ID. | `{ accepted: true, task: { id, boardId, columnId, revision } }` |
| `add_dependency` | `targetTaskId`, `resumeAgent`, `idempotencyKey` | Makes the current task wait on another task and explicitly assigns its resume agent. `resumeAgent` is `self` or an agent ID. | `{ accepted: true, relationship }` |
| `set_relationship_resume_agent` | `taskId`, `relationshipId`, `resumeAgent`, `idempotencyKey` | Changes the resume agent of an unresolved relationship. `taskId` is `current` or the source task ID; `resumeAgent` is `self` or an agent ID. | `{ accepted: true, relationship, sourceTask, targetTask }` |
| `remove_relationship` | `taskId`, `relationshipId`, `idempotencyKey` | Removes a mistaken relationship without waking its resume agent. `taskId` is `current` or the source task ID. | `{ accepted: true, relationship, sourceTask, targetTask }` |
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
also returns `currentTask` so the agent can reassess or inspect again.

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

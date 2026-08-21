# Agent MCP tool reference

The `coordination` MCP server exposes the tools below. Read tools may inspect
shared project state. Mutation tools are bound to the activation's current task;
they do not accept a `taskId`.

Every result is JSON in one MCP text-content item. Rejected queries and
mutations set the MCP error flag and return the same JSON rejection used by the
agent API. Mutation `idempotencyKey` values make an exact retry return the
original result without repeating the change.

| Tool | Input | Does | Successful result |
| --- | --- | --- | --- |
| `summarize_boards` | none | Lists boards and ordered columns without task payloads. | `{ available: true, boards }`; each column includes ID, name, watcher, framework/creation flags, and task count. |
| `list_tasks` | `boardId`, `columnIds[]`, optional `pageSize` (1–50), optional `cursor` | Lists one bounded page from explicit columns. Archived tasks are excluded. | `{ available: true, tasks: TaskOverview[], nextCursor }` |
| `list_archived_tasks` | none | Lists retained archived tasks deliberately. | `{ available: true, tasks: TaskOverview[] }` |
| `inspect_task` | `taskId` | Reads one task's description and current coordination state. Activity and attachments stay on demand. | `{ available: true, task: TaskInspection }` |
| `list_task_activity` | `taskId` | Reads immutable framework activity for one task. | `{ available: true, activity: TaskActivity[] }` |
| `list_task_attachments` | `taskId` | Lists attachment metadata for one task. | `{ available: true, attachments: Attachment[] }` |
| `list_collaborators` | none | Lists agent identities without loading their instructions. | `{ available: true, collaborators: Collaborator[] }` |
| `inspect_current_task` | none | Reads the complete current task assigned to this activation. | `TaskInspection` directly, without an `available` wrapper. |
| `inspect_operating_context` | none | Recovers the complete current framework, process, board, owning-role instructions, and participant identity for the authorized running attempt. | `{ attemptId, taskId, frameworkInstructions, process, board, owningAgent, participants }` directly. |
| `add_comment` | `body`, `idempotencyKey` | Adds an authored agent comment; canonical mentions may create activations or user attention. | `{ accepted: true, taskId, revision, commentId }` |
| `move_current_task` | `destinationColumnId`, `expectedRevision`, `idempotencyKey` | Revision-checks and moves the current task; a watched destination normally creates its activation. Requesting the current column is an inert success. | `{ accepted: true, revision, transition: { taskId, fromColumnId, toColumnId } }`; an inert result also includes `outcome: "already-in-column"`. |
| `create_child_task` | `boardId`, `columnId`, `title`, `description`, optional `startingRef`, `idempotencyKey` | Creates a task related as a child of the current task. | `{ accepted: true, task: { id, boardId, columnId, revision } }` |
| `add_dependency` | `targetTaskId`, `idempotencyKey` | Makes the current task depend on another task. | `{ accepted: true, relationship }` |
| `report_permission_block` | `summary` | Marks this run outcome as permission-blocked after a required action is denied. | `{ accepted: true, taskId }` |

## Returned records

- `TaskOverview`: `id`, `title`, `boardId`, `column { id, name }`, `revision`,
  blocking state, relationships, unresolved attention, suspension/startup state,
  and compact run state.
- `TaskInspection`: `id`, `title`, `description`, `boardId`, `column`, `revision`,
  optional archive state, comments, relationships, blocking/run/attention state,
  current activation, suspension state, and on-demand capability flags.
- `TaskActivity`: `{ id, type, actor, occurredAt, details }`.
- `Attachment`: `{ id, fileName, mediaType, sizeBytes }`.
- `Collaborator`: `{ id, name, summary }`.
- `relationship`: `{ id, type, sourceTaskId, targetTaskId }`, where `type` is
  `parent-child` or `dependency`.

Query rejections use `{ available: false, reason, ... }`. Mutation rejections
use `{ accepted: false, reason, ... }`. A move rejected for `revision-conflict`
also returns `currentTask` so the agent can reassess or inspect again.

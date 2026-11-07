# 0035: Retain compact historical task command results

Status: Accepted

## Context

ADR 0034 expires task-owned mutation responses at archival but retained active
responses still duplicated full growing task projections. The rich application
result was unnecessary for browser refreshes and already reduced by agent HTTP
adapters. Exact historical snapshots are deliberately removed from the
application command contract; authoritative task content and history remain
available through queries.

## Decision

Task commands return original `TaskCommandSummary` facts: task ID, title, board,
column, revision and optional archived marker. A command reads these scalars at
source through `TaskProjectionStore.readCommandTask`; it does not build a full
projection and strip its history later. Edit validation reads description
separately when required. Application wakeups follow successful commands rather
than inspecting returned activation histories. Queries retain their existing
rich projections and authoritative state ownership.

The command/result and consumer inventory is:

| Command | Success facts retained | Rejection facts / consumers |
| --- | --- | --- |
| create-task, create-child-task | Original created task summary | Existing validation/configuration/idempotency rejection; browser uses created ID, agent HTTP exposes the same five task fields |
| edit-task | Original edited task summary | Revision conflict retains original currentTask summary; other reasons/diagnostics unchanged; browser refreshes, agent HTTP fields/status unchanged |
| move-task | Original task summary and original transition endpoints | Same conflict/rejection facts as edit; inert resolution also retains already-in-column outcome; browser refreshes and agent movement fields unchanged |
| add-task-comment | Original task summary and the newly authored comment including body, timestamp, actor and provenance | Existing reasons/diagnostics unchanged; browser refreshes, agent HTTP commentId/taskId/revision unchanged |
| create-task-relationship, remove-task-relationship, edit-task-relationship-resume-agent | Original relationship plus original source/target summaries | Existing conflict/rejection facts unchanged; browser refreshes; agent HTTP retains its relationship-only success |
| archive-task, unarchive-task | Original task summary including archival marker when applicable | Existing retained lifecycle rejections/diagnostics unchanged; browser refreshes |
| archive-completed-tasks | Existing archivedTaskIds and per-task rejection reasons | Existing configuration diagnostics; already compact |
| pin/unpin, attention, activation, interruption and conversation commands | Existing small receipts | Existing outcomes unchanged; they contain no TaskView |

Success/failure retention policies, normalized requests, command keys, caller
isolation and atomic transaction boundaries are unchanged. In particular edit
and move revision conflicts are returned compactly but are not newly retained;
previously retained conflict snapshots can still replay their original facts.
Creation/lifecycle receipts remain protected after archival. Task-owner expiry
continues using keys only and never guesses ownership from response bodies.
Legacy retry identities are preserved under their original scopes, including
0013's explicit canonical-human aliases. Conversion does not guess new caller
bindings for older unscoped keys; caller lookup behavior is unchanged.

The frozen `convertHistoricalCommandResultV1` maps supported historical command
results using only their retained fields. It supports scalar summaries and full
legacy task projections, original comments, transitions, relationships and
revision conflicts. It never queries current state. Unsupported or insufficient
shapes are preserved during historical maintenance; replay raises a diagnostic
and preserves the retry key rather than treating the record as missing. Invalid
JSON likewise fails rather than re-executing the command. Unrelated small
command families retain their existing exact JSON replay.

Migration `0014_compact_command_results` is a ledger compatibility boundary even
though no SQL object changes. An older application rejects the newer released
ledger before it can consume incompatible compact task receipts. Historical
backfill is a subsequent released migration using the frozen V1 conversion;
future receipt shapes must use a new mapping rather than revising V1 semantics.
The existing verified backup and transactional migration gates apply. Logical
payload reduction does not automatically shrink database allocation; offline
compaction remains a separately controlled operation.

## Consequences

The application/browser mutation contract intentionally loses description,
comments, activity, relationships and activation histories inside task fields.
Direct callers query history explicitly. Browser navigation and refresh behavior
and documented agent HTTP/MCP wire fields and statuses remain stable. A retry
after later edits, history changes or restart returns the original compact facts
and cannot repeat an effect. Receipt size no longer depends on unrelated task
history, while meaningful authored content and normalized requests still grow
with actual commands.

This supersedes ADR 0034's active exact-full-response clause while preserving
its archival ownership and expiry decisions, and preserves ADR 0009's
transaction-bound write ownership and ADR 0018's migration authority.

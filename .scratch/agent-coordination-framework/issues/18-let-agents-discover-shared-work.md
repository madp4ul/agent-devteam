# 18 — Let Agents Discover Shared Work

**What to build:** An activated agent can orient itself across the process,
select relevant columns, inspect bounded task overviews, open a complete task,
and discover collaborators without loading the entire board or every agent's
instructions into context.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** resolved

- [x] A board summary returns ordered columns, watching agents, and task counts
  without returning task payloads.
- [x] Task listing requires one or more explicit columns, returns a capped page
  of Task overviews, and supplies a stable continuation cursor.
- [x] A Task overview exposes title, column, blocking state, relationship state,
  and run state without a separately authored summary.
- [x] There is no implicit all-column listing; the Completion column remains an
  ordinary explicit target.
- [x] Full task inspection returns the complete description, comments,
  relationships, current state, and unresolved attention while keeping activity
  and attachments available on demand.
- [x] Collaborator discovery returns agent names and summaries without exposing
  every collaborator's full instructions.
- [x] MCP schemas, pagination, error behavior, and application-command mapping
  have focused contract tests.
- [x] Behavioral tests demonstrate bounded discovery on a board large enough to
  require pagination.

## Answer

Implemented summary-first board discovery, explicit-column paginated Task
overviews, stable sequence-based continuation cursors, full shared-task
inspection, on-demand activity and attachment queries, and collaborator
discovery through the application boundary and project-scoped MCP adapter.
Durable read projections cover relationships, blocking, unresolved attention,
attachments, and run state while current-task mutations remain scoped and
idempotent. Focused application and MCP contract tests cover bounded payloads,
non-empty coordination state, Completion, schemas, pagination, and error
mapping.

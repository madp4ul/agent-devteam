# 18 — Let Agents Discover Shared Work

**What to build:** An activated agent can orient itself across the process,
select relevant columns, inspect bounded task overviews, open a complete task,
and discover collaborators without loading the entire board or every agent's
instructions into context.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** ready-for-agent

- [ ] A board summary returns ordered columns, watching agents, and task counts
  without returning task payloads.
- [ ] Task listing requires one or more explicit columns, returns a capped page
  of Task overviews, and supplies a stable continuation cursor.
- [ ] A Task overview exposes title, column, blocking state, relationship state,
  and run state without a separately authored summary.
- [ ] There is no implicit all-column listing; the Completion column remains an
  ordinary explicit target.
- [ ] Full task inspection returns the complete description, comments,
  relationships, current state, and unresolved attention while keeping activity
  and attachments available on demand.
- [ ] Collaborator discovery returns agent names and summaries without exposing
  every collaborator's full instructions.
- [ ] MCP schemas, pagination, error behavior, and application-command mapping
  have focused contract tests.
- [ ] Behavioral tests demonstrate bounded discovery on a board large enough to
  require pagination.


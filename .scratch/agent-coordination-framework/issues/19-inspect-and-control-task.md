# 19 — Inspect and Control a Task

**What to build:** A user can open a task directly from the board, understand
its complete coordination history and current automation state, move or edit it
through contextual actions, inspect agent attempts, and return to the same
board context.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** ready-for-agent

- [ ] Board cards show task ID, outcome-oriented title, blocking, unresolved
  attention, queued or failed activations, and the active agent without showing
  ordinary idle state.
- [ ] Each column header identifies its watching agent, and selecting a card
  opens a dedicated linkable full task page without an intermediate summary.
- [ ] Returning from task details restores the previous board position and
  filters.
- [ ] Task details expose description, column, relationships, run state,
  unresolved attention, and actions beside the information they affect.
- [ ] Authored comments and immutable framework events appear in one
  chronological timeline while retaining their distinct record types.
- [ ] Each attempt has a separate entry with timing, outcome, diagnostic, and
  expandable thread information when available.
- [ ] A large read-only transcript overlay renders useful Codex messages, tool
  activity, diagnostics, and truncated command output and reports unavailable
  transcripts honestly.
- [ ] The move chooser lists every defined column in board order, marks current,
  previous, and next, disables only the current column, and allows any other
  destination.
- [ ] Open in Codex appears only when documented navigation is supported; the
  thread ID remains copyable regardless.
- [ ] Browser-level tests cover direct opening, contextual actions, timeline
  rendering, movement, transcript access, and board-context restoration.


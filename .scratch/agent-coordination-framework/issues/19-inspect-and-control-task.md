# 19 — Inspect and Control a Task

**What to build:** A user can create a task from the board, open it directly,
understand its complete coordination history and current automation state, move
or edit it through contextual actions or drag-and-drop, inspect agent attempts,
and return to the same board context.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** ready-for-agent

- [ ] Board cards show task ID, outcome-oriented title, blocking, unresolved
  attention, queued or failed activations, and the active agent without showing
  ordinary idle state.
- [ ] Every defined column, including Completion, provides a visible Create task
  action positioned consistently with its task list. It opens creation with
  that column preselected while still accepting an outcome-oriented title and
  complete description; success shows the generated task ID and card in the
  chosen column without requiring an internal API or fixture.
- [ ] Task creation translates through the shared idempotent application command
  boundary, reports validation or configuration errors in context, and cannot
  duplicate a task when a submission is retried.
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
- [ ] Board cards can be moved between columns with Atlassian Pragmatic Drag and
  Drop as progressive enhancement. A drop invokes the same revision-checked,
  idempotent move command as the detail-page chooser, so activity and activation
  behavior cannot diverge between interaction styles.
- [ ] Drag handles, drop targets, pending state, revision conflicts, rejected
  moves, and successful placement are visually understandable; card links remain
  usable, and the labeled non-drag move chooser remains the permanent keyboard
  and assistive-technology path.
- [ ] Board columns remain in process order on one non-wrapping horizontal lane.
  When the viewport cannot show every column at a usable width, the board uses a
  clear horizontal scrollbar instead of placing later workflow stages beneath
  earlier ones; keyboard focus and restored board position remain usable while
  horizontally scrolled.
- [ ] Open in Codex appears only when documented navigation is supported; the
  thread ID remains copyable regardless.
- [ ] Browser-level tests cover task creation, direct opening, contextual
  actions, timeline rendering, pointer drag-and-drop, the non-drag move path,
  transcript access, conflict feedback, one-lane horizontal overflow at a
  narrow viewport, and board-context restoration.

## Comments

- User review after ticket 16 found that an empty example board had no way to
  create the first task and therefore offered no meaningful board interaction.
  The clarified interaction places creation on every column with that column
  preselected.
  The same review found that Pragmatic Drag and Drop was required by the product
  specification but absent from every implementation ticket. Both belong to
  this human-facing board/task interaction slice; the accessible chooser remains
  required rather than being replaced by dragging.
- The current responsive grid wraps columns into multiple rows, which obscures
  the workflow sequence. This slice replaces wrapping with one horizontally
  scrollable lane while retaining usable column widths and board-context
  restoration.

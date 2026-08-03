# 19 — Inspect and Control a Task

**What to build:** A user can create a task from the board, open it directly,
understand its complete coordination history and current automation state, move
or edit it through contextual actions or drag-and-drop, inspect agent attempts,
and return to the same board context.

**Blocked by:** 17 — Complete a Minimal Codex Handoff

**Status:** resolved

- [x] The temporary server-rendered board is replaced by a TypeScript React
  application built with Vite. The existing Node host serves its production
  assets and a narrow HTTP/JSON adapter rather than adding a second application
  server or a full-stack rendering framework.
- [x] React remains a UI adapter at the application command-and-query seam:
  queries provide authoritative projections, commands preserve idempotency and
  optimistic revisions, and client state does not duplicate coordination rules.
- [x] Board cards show task ID, outcome-oriented title, blocking, unresolved
  attention, queued or failed activations, and the active agent without showing
  ordinary idle state.
- [x] Every defined column, including Completion, provides a visible Create task
  action positioned consistently with its task list. It opens creation with
  that column preselected while still accepting an outcome-oriented title and
  complete description; success shows the generated task ID and card in the
  chosen column without requiring an internal API or fixture.
- [x] Task creation translates through the shared idempotent application command
  boundary, reports validation or configuration errors in context, and cannot
  duplicate a task when a submission is retried.
- [x] Each column header identifies its watching agent, and selecting a card
  opens a dedicated linkable full task page without an intermediate summary.
- [x] Returning from task details restores the previous board position and
  filters.
- [x] Task details expose description, column, relationships, run state,
  unresolved attention, and actions beside the information they affect.
- [x] Authored comments and immutable framework events appear in one
  chronological timeline while retaining their distinct record types.
- [x] Each attempt has a separate entry with timing, outcome, diagnostic, and
  expandable thread information when available.
- [x] A large read-only transcript overlay renders useful Codex messages, tool
  activity, diagnostics, and truncated command output and reports unavailable
  transcripts honestly.
- [x] The move chooser lists every defined column in board order, marks current,
  previous, and next, disables only the current column, and allows any other
  destination.
- [x] Board cards can be moved between columns with Atlassian Pragmatic Drag and
  Drop as progressive enhancement. A drop invokes the same revision-checked,
  idempotent move command as the detail-page chooser, so activity and activation
  behavior cannot diverge between interaction styles.
- [x] Drag handles, drop targets, pending state, revision conflicts, rejected
  moves, and successful placement are visually understandable; card links remain
  usable, and the labeled non-drag move chooser remains the permanent keyboard
  and assistive-technology path.
- [x] Board columns remain in process order on one non-wrapping horizontal lane.
  When the viewport cannot show every column at a usable width, the board uses a
  clear horizontal scrollbar instead of placing later workflow stages beneath
  earlier ones; keyboard focus and restored board position remain usable while
  horizontally scrolled.
- [x] Open in Codex appears only when documented navigation is supported; the
  thread ID remains copyable regardless.
- [x] Browser-level tests cover task creation, direct opening, contextual
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
- ADR 0003 records React and Vite as the selected browser stack. Ticket 17 keeps
  the temporary server-rendered UI deliberately small; this ticket owns the
  migration so the product does not maintain two growing UI implementations.
- Resolving this ticket opens ticket 29, the persistence-decomposition
  maintenance gate. Complete that gate before beginning tickets 20–22 so their
  new command, attention, relationship, and concurrency behavior does not
  accumulate in the existing all-purpose coordination store.

## Answer

Replaced the temporary server-rendered board with a production-built React and
Vite application served by the existing Node host through a narrow HTTP/JSON
adapter. The board now supports per-column creation, direct task navigation,
context restoration, independent coordination signals, accessible contextual
movement, and Atlassian Pragmatic Drag and Drop on a non-wrapping horizontal
lane. Task details provide editing, authoritative conflict recovery,
relationships, automation state, a unified history, per-attempt evidence,
copyable thread IDs, and on-demand runtime-owned transcript presentation.

Application, adapter, runtime, and browser coverage preserve idempotency,
optimistic revisions, atomic activation behavior, direct linkability, narrow
viewport overflow, pointer and non-drag movement, and honest transcript
unavailability. Type-checking, the production build, the full automated suite,
the browser acceptance suite, visual browser inspection, `git diff --check`,
and parallel Standards and Spec reviews all pass. Persistence decomposition
remains intentionally deferred to ticket 29.

# 47 — Reshape Task Details Around Agent Activity

**What to build:** A user can read a task's purpose, understand exactly what is
running or waiting, inspect the activation order, reach its workspace, and move
it without low-value execution-profile details or oversized controls dominating
the task-details page.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Task details use a primary content area and utility sidebar. The primary
  area contains the title, a dedicated readable Description section, Agent
  activity, Add comment, and Task Timeline; the sidebar contains Task Workspace,
  Move task, and Relationships in that order.
- [ ] On narrow screens the canonical reading and keyboard order is title and
  description, Agent activity, Task Workspace, Move task, Relationships, Add
  comment, and Task Timeline. Existing edit and archival behavior remains
  available without redesigning archival controls.
- [ ] While an attempt runs, the first Agent activity item shows the configured
  human-readable agent name, current-attempt elapsed time, and the applicable
  interruption control.
- [ ] When queued work cannot run, that first item becomes a visually distinct
  Waiting item whose first line explains the most actionable reason. Additional
  simultaneous reasons are available through a compact disclosure, including
  board pause, blocking relationships, task suspension, scheduled retry, and
  other authoritative non-runnable state.
- [ ] The queued activation list follows in strict execution order with one
  human-readable agent name per activation. Repeated activations repeat the
  agent name rather than being grouped or counted.
- [ ] Requested model, requested reasoning effort, aggregate queued and failed
  counts, column-as-state heading, and empty `None` fact rows are not promoted in
  Agent activity. Attention and recovery actions remain available beside the
  state they affect.
- [ ] Move task is one compact selector showing the current column and every
  column in board order. Selecting another column moves immediately through the
  existing conflict-safe command, disables the selector while pending, and
  restores authoritative state with feedback after failure or conflict.
- [ ] The move area contains no separate action button, confirmation,
  current/previous/next taxonomy, or explanation of internal command reuse.
- [ ] Add comment and Task Timeline have clear visual separation. This issue
  does not redesign timeline entries, ordering, grouping, or transcript access,
  and it does not refine Task Workspace contents.
- [ ] Live detail refresh preserves drafts, focus, disclosure state, transcript
  overlays, and reading position while updating the running item, waiting
  reasons, elapsed time, and queue.
- [ ] Browser scenarios cover running, idle, singly and multiply blocked
  waiting states, repeated queued agents, immediate movement and conflict
  recovery, responsive reading order, keyboard operation, and the spacing
  between Add comment and Task Timeline. Completion includes live visual review
  at desktop and narrow widths.

## Context

Task Timeline still belongs to
[Structure Task History by Cause and Attempt](./37-structure-task-history-by-cause-and-attempt.md),
which must be discussed with the user and prototyped after this surrounding
layout is available. Task Workspace refinement and archival behavior remain in
their existing issues.


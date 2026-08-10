# 47 — Reshape Task Details Around Agent Activity

**What to build:** A user can read a task's purpose, understand exactly what is
running or waiting, inspect the activation order, reach its workspace, and move
it without low-value execution-profile details or oversized controls dominating
the task-details page.

**Blocked by:** None — can start immediately

**Status:** resolved

- [x] Task details use a primary content area and utility sidebar. The primary
  area contains the title, a dedicated readable Description section, Agent
  activity, Add comment, and Task Timeline; the sidebar contains Task Workspace,
  Move task, and Relationships in that order.
- [x] On narrow screens the canonical reading and keyboard order is title and
  description, Agent activity, Task Workspace, Move task, Relationships, Add
  comment, and Task Timeline. Existing edit and archival behavior remains
  available without redesigning archival controls.
- [x] While an attempt runs, the first Agent activity item shows the configured
  human-readable agent name, current-attempt elapsed time, and the applicable
  interruption control.
- [x] When queued work cannot run, that first item becomes a visually distinct
  Waiting item whose first line explains the most actionable reason. Additional
  simultaneous reasons are available through a compact disclosure, including
  board pause, blocking relationships, task suspension, scheduled retry, and
  other authoritative non-runnable state.
- [x] The queued activation list follows in strict execution order with one
  human-readable agent name per activation. Repeated activations repeat the
  agent name rather than being grouped or counted.
- [x] Requested model, requested reasoning effort, aggregate queued and failed
  counts, column-as-state heading, and empty `None` fact rows are not promoted in
  Agent activity. Attention and recovery actions remain available beside the
  state they affect.
- [x] Move task is one compact selector showing the current column and every
  column in board order. Selecting another column moves immediately through the
  existing conflict-safe command, disables the selector while pending, and
  restores authoritative state with feedback after failure or conflict.
- [x] The move area contains no separate action button, confirmation,
  current/previous/next taxonomy, or explanation of internal command reuse.
- [x] Add comment and Task Timeline have clear visual separation. This issue
  does not redesign timeline entries, ordering, grouping, or transcript access,
  and it does not refine Task Workspace contents.
- [x] Live detail refresh preserves drafts, focus, disclosure state, transcript
  overlays, and reading position while updating the running item, waiting
  reasons, elapsed time, and queue.
- [x] Browser scenarios cover running, idle, singly and multiply blocked
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

Keep `TaskPage` as the composition and authoritative-refresh module rather than
letting this issue grow it back into one file. Implement Agent activity as a
cohesive `AgentActivityPanel` module that owns running, waiting, queued,
attention, recovery, and interruption presentation behind a small task-state
interface. Move task may become its own sidebar module if that produces a
smaller interface than passing its control state through Agent activity; do not
replace the extraction with one large `useTaskPage` hook or JSX-only wrappers
with broad prop lists.

## Answer

Task details now use a task-first primary column and an ordered utility sidebar.
The new `AgentActivityPanel` presents configured agent names, elapsed running
time, actionable waiting reasons, strict activation order, interruption,
attention, and recovery without promoting execution-profile facts. Waiting is
shown only when authoritative work is pending, and its disclosure state survives
live reason-count changes.

Task movement is a compact native selector that uses the existing
revision-checked command and authoritative conflict refresh. The page keeps
composition and polling ownership while Agent activity and movement live behind
focused module interfaces. Drafts, focus, reading position, transcript state,
and waiting disclosure state remain stable across live refreshes.

Verification passed both TypeScript typechecks, the production build, all 121
runnable non-browser tests (with the existing credentialed Codex integration
test skipped), and all 35 browser scenarios. Live visual review passed at
1280×900 and 600×900. The final independent Standards and Spec rechecks found
no remaining findings.

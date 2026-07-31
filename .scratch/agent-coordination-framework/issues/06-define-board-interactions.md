# Define Board and Task Interactions

Type: wayfinder:prototype
Status: resolved
Blocked by: 01, 03
Parent: ../map.md

## Question

What information and actions should the user and an agent see at board,
task-summary, and full-task levels so they can coordinate effectively without
loading unnecessary context?

## Answer

Use a board-first interaction based on the refined prototype A. Reject the
persistent split workspace from prototype B, and fold prototype C's useful
attention concept into the board rather than creating a separate operational
view.

### User board

- The Kanban board is the user's primary overview. Each card shows the task ID
  and a descriptive, outcome-oriented title; tasks do not have a separately
  authored short summary.
- Cards show exceptional coordination state without showing idle state:
  blocking, unresolved user attention, queued or failed activations, and the
  name of an agent while its run is active. Each column header shows the agent
  watching that column.
- A **Needs attention** area sits above the columns. A task needs attention only
  because the user was mentioned or an agent run failed and awaits recovery;
  entering an unwatched column does not create user attention.
- Attention reasons are grouped by task and resolved independently through an
  explicit action appropriate to the cause. Opening, moving, or commenting on
  the task does not implicitly resolve them.
- Selecting the main area of an attention entry locates and highlights its card
  on the board so the user can retain the workflow context and drag the task.
  A separate **Open details** action bypasses that step. Selecting a board card
  also opens the full task directly; there is no intermediate summary screen.

### Full task page

- The full task has a dedicated, linkable page. Returning restores the board's
  position and filters.
- It exposes the full description, relationships, column and run state,
  unresolved attention reasons, and the actions that apply to each reason.
- Comments and immutable framework events remain different records but appear
  together in one chronological timeline. Do not add a comments-only filter
  until real activity volume demonstrates the need.
- Actions live with the information they affect: edit beside the title; add a
  relationship and create a child in Relationships; retry, dismiss, and mark
  addressed with the relevant attention reason; and manual reactivation in the
  run/status area only when it is eligible.
- The task can also be moved from its detail page. The destination chooser
  lists every column in board order, marks the current, previous, and next
  positions, disables the current column, and allows any other destination.
  The destination's watching agent or lack of activation is quiet secondary
  context.

### Agent interface and context

- Agents use structured board tools rather than a visual "agent view." A
  **Task overview** is the compact read projection used for board orientation:
  title, column, blocking state, relationship status, and run state. An agent
  explicitly opens any other task whose title appears relevant or ambiguous.
- Every activation starts with the activated agent's full instructions and
  role, relevant process and board guidance, collaborator names and summaries,
  the activation reason and exact source event, current task metadata and
  relationships, the full task description, and the complete comment history.
  Attachments and activity history remain available on demand.
- Do not silently omit task context to save tokens. If real usage later shows
  excessive context cost, optimize from evidence; if the required task context
  cannot fit, fail the activation visibly rather than silently truncating it.
- Board tools let agents inspect board task overviews, inspect a full task, add
  comments and mentions, move a task, create child tasks, manage dependencies,
  and discover collaborators. Later safety decisions may constrain when those
  actions require approval without changing these interaction shapes.

The final contextual-action refinement is represented by the Codex inline
prototype named `refined-board-task-flow` from the decision session.

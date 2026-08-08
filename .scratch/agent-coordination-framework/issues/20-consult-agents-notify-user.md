# 20 — Consult Agents and Notify the User

**What to build:** Agents can consult one another through visible comment
mentions without transferring primary responsibility, while mentions of the
user become durable, independently resolvable attention reasons with optional
privacy-safe desktop notification delivery.

**Blocked by:** 18 — Let Agents Discover Shared Work; 19 — Inspect and Control a Task;
29 — Decompose Coordination Persistence by Behavior

**Status:** resolved

- [x] One comment creates at most one activation per mentioned agent and orders
  several agent activations by textual mention order.
- [x] Agent mentions work in watched, unwatched, and Completion columns while
  leaving the task's column and primary responsibility unchanged.
- [x] A response can mention the requesting agent and complete a visible
  consultation round-trip without moving the task.
- [x] A user mention creates an attention reason rather than an agent activation.
- [x] Needs attention groups reasons by task, lets the user locate the board
  card or open details, and resolves each reason only through its explicit
  cause-specific action.
- [x] Opening, commenting on, or moving a task does not implicitly resolve an
  attention reason.
- [x] Desktop notifications are disabled by default and request operating-system
  permission only after explicit enablement.
- [x] Each new attention reason produces at most one best-effort notification
  unless the user is actively viewing the affected task; startup and enablement
  do not replay existing reasons.
- [x] Notification content contains only process or board, task ID and title,
  and reason type; selecting it highlights the reason without resolving it.
- [x] Controlled notification and browser tests cover delivery failure,
  suppression, privacy, navigation, grouping, and independent resolution.

## Answer

Comments now parse exact participant tokens once and create durable
`agent-mention` activations in textual first-mention order, with repeated agent
mentions deduplicated. The immutable activation source points to the authored
comment, consultation works without changing the task column or revision in
watched, unwatched, and Completion columns, and unmapped tasks retain mention
text without creating runnable work. Reply mentions support a visible
consultation round-trip through the same command boundary.

`@user` creates a source-linked durable attention reason instead of an agent
activation. The board groups unresolved reasons by task and offers card location
and direct detail navigation; task details and the board share one idempotent
Mark addressed control. Attention creation and explicit resolution remain in
the immutable task history, while opening, moving, editing, and ordinary
commenting leave every reason unresolved.

Desktop notification delivery is opt-in through the browser's operating-system
notification boundary. Permission is requested only from the explicit toggle.
The monitor initializes and observes reasons even while disabled so startup and
later enablement never replay existing attention; active-task reasons are
suppressed, every other new reason is attempted once, and unavailable or failed
delivery is best-effort without changing board state. Content is limited to the
board, task ID and title, and reason type. Selecting a notification opens and
highlights the durable reason without resolving it.

Verification completed with both TypeScript configurations, the full automated
suite, production build, browser acceptance suite, `git diff --check`, and the
parallel Standards and Spec reviews. Both review axes report no remaining
findings.

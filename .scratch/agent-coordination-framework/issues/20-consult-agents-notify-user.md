# 20 — Consult Agents and Notify the User

**What to build:** Agents can consult one another through visible comment
mentions without transferring primary responsibility, while mentions of the
user become durable, independently resolvable attention reasons with optional
privacy-safe desktop notification delivery.

**Blocked by:** 18 — Let Agents Discover Shared Work; 19 — Inspect and Control a Task

**Status:** ready-for-agent

- [ ] One comment creates at most one activation per mentioned agent and orders
  several agent activations by textual mention order.
- [ ] Agent mentions work in watched, unwatched, and Completion columns while
  leaving the task's column and primary responsibility unchanged.
- [ ] A response can mention the requesting agent and complete a visible
  consultation round-trip without moving the task.
- [ ] A user mention creates an attention reason rather than an agent activation.
- [ ] Needs attention groups reasons by task, lets the user locate the board
  card or open details, and resolves each reason only through its explicit
  cause-specific action.
- [ ] Opening, commenting on, or moving a task does not implicitly resolve an
  attention reason.
- [ ] Desktop notifications are disabled by default and request operating-system
  permission only after explicit enablement.
- [ ] Each new attention reason produces at most one best-effort notification
  unless the user is actively viewing the affected task; startup and enablement
  do not replay existing reasons.
- [ ] Notification content contains only process or board, task ID and title,
  and reason type; selecting it highlights the reason without resolving it.
- [ ] Controlled notification and browser tests cover delivery failure,
  suppression, privacy, navigation, grouping, and independent resolution.


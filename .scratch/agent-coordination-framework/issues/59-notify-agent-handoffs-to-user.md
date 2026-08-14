# 59 — Notify Agent Handoffs to the User

**What to build:** Notify the user when an agent makes the user responsible for
the next task action, so approval or requested input does not require constant
board monitoring.

**Blocked by:** None

**Status:** open

- [ ] An agent-authored move into an unwatched workflow column can notify the
  user that the task now awaits user action.
- [ ] An agent-authored `@user` mention continues to notify the user.
- [ ] Do not notify for a user-authored move, an inert refresh, replayed history,
  startup discovery of existing state, or another event that does not represent
  a new handoff.
- [ ] Reuse the existing opt-in, best-effort, privacy-safe desktop-notification
  behavior and direct navigation to the affected task.
- [ ] Decide during specification whether an agent move into an unwatched
  column creates a durable attention reason, and how the user explicitly
  resolves that reason. A transient notification alone must not be the only
  record of a required user action.
- [ ] Define deduplication when one agent action both moves the task and mentions
  the user, so the user is informed without receiving redundant notifications.
- [ ] Cover watched-to-unwatched moves, agent mentions, combined triggers,
  user-authored moves, startup/restart, and notification delivery failure.

## Context

Issue 20 implemented notifications for newly created attention reasons, and
issue 57 tracks making those reasons actionable. Current domain behavior says
that merely entering an unwatched column does not create user attention. This
ticket is a real-use request to extend that model to explicit agent-to-user
handoffs; its durable attention and acknowledgement semantics need refinement
before implementation.


# 21 — Split, Relate, and Unblock Work

**What to build:** Users and agents can divide work into child tasks, create
typed dependencies, inspect relationship state, and rely on automatic
reactivation exactly when a task's final blocker becomes satisfied.

**Blocked by:** 18 — Let Agents Discover Shared Work; 19 — Inspect and Control a Task

**Status:** ready-for-agent

- [ ] Task details and agent tools can create and inspect parent-child and
  dependency relationships through the shared application contract.
- [ ] Creating a child can supply a task-specific starting Git ref while keeping
  parent and child workspaces separate.
- [ ] Child provisioning inherits only committed, Git-addressable state and
  never copies dirty files, applies hidden patches, or creates snapshot commits.
- [ ] Relationship changes, including individual blocker satisfaction, are
  recorded in immutable task activity.
- [ ] Satisfying one blocker creates no activation while another blocker remains.
- [ ] Transitioning from blocked to fully unblocked creates one activation for
  the agent watching the current column and points to the final clearing event.
- [ ] Fully unblocking a task in an unwatched column records the change without
  creating an activation.
- [ ] Dependency satisfaction uses entry into the related task's framework-owned
  Completion column and does not require a process-specific completion stage.
- [ ] Behavioral tests cover multiple blockers, child completion, dependency
  completion, task-specific starting refs, and unwatched-column behavior.


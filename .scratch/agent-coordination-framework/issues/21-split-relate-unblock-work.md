# 21 — Split, Relate, and Unblock Work

**What to build:** Users and agents can divide work into child tasks, create
typed dependencies, inspect relationship state, and rely on automatic
reactivation exactly when a task's final blocker becomes satisfied.

**Blocked by:** 18 — Let Agents Discover Shared Work; 19 — Inspect and Control a Task;
29 — Decompose Coordination Persistence by Behavior; 36 — Configure Agent Models and Reasoning

**Status:** resolved

- [x] Task details and agent tools can create and inspect parent-child and
  dependency relationships through the shared application contract.
- [x] Creating a child can supply a task-specific starting Git ref while keeping
  parent and child workspaces separate.
- [x] Child provisioning inherits only committed, Git-addressable state and
  never copies dirty files, applies hidden patches, or creates snapshot commits.
- [x] Relationship changes, including individual blocker satisfaction, are
  recorded in immutable task activity.
- [x] Satisfying one blocker creates no activation while another blocker remains.
- [x] Transitioning from blocked to fully unblocked creates one activation for
  the agent watching the current column and points to the final clearing event.
- [x] Fully unblocking a task in an unwatched column records the change without
  creating an activation.
- [x] Dependency satisfaction uses entry into the related task's framework-owned
  Completion column and does not require a process-specific completion stage.
- [x] Behavioral tests cover multiple blockers, child completion, dependency
  completion, task-specific starting refs, and unwatched-column behavior.

## Answer

Implemented typed parent-child and dependency relationships through the shared
application contract, browser task details, and task-scoped MCP tools. Child
creation is atomic with its parent relationship, accepts an optional starting
Git ref, and provisions a distinct detached worktree using only committed,
Git-addressable state; behavioral coverage proves dirty parent-workspace files
do not transfer.

Both relationship types now contribute durable blocking state. Each
relationship creation and satisfaction is recorded in immutable activity.
Completion of an earlier blocker remains inert, while final blocker clearance
queues exactly one `blockers-cleared` activation pointing to the clearing event
when the blocked task's current column is watched. Unwatched columns record the
clearance without activation. The automation pump retains kicks that arrive
during an active scan, so final clearance reliably wakes running idle
automation without weakening task activation order or workspace verification.

Verification passed TypeScript typechecking, 63 local tests plus one
intentionally skipped credentialed Codex test, the production build, all 10
browser scenarios, and `git diff --check`. Final independent Standards and Spec
reviews reported no remaining findings.

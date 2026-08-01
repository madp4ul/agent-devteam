# 23 — Recover Queued Work After Restart

**What to build:** Committed coordination state, activation order, task
workspaces, and retry schedules survive application and machine interruption,
while storage problems fail closed and remain recoverable through documented
backup and restore.

**Blocked by:** 22 — Prevent Conflicting and Duplicate Changes

**Status:** ready-for-agent

- [ ] Current task state, authored records, activity, attention, activations,
  attempts, thread IDs, retry schedules, suspensions, and idempotency data remain
  durable across restart.
- [ ] Startup detects an attempt left active without a live executor, records a
  technical interruption failure, and retains its activation at the head of the
  original queue.
- [ ] Recovery uses at-least-once attempt delivery while atomic and idempotent
  commands prevent duplicate coordination effects.
- [ ] A recovering attempt reuses the existing task workspace and receives
  attempt context describing its sequence, preceding outcome, and thread
  resume-or-replacement behavior.
- [ ] The framework resumes an activation's Codex thread when usable and falls
  back to a fresh thread without discarding workspace changes.
- [ ] Storage validation and schema migration complete before any agent dispatch
  or board mutation.
- [ ] Migration creates and verifies a backup before changing durable storage.
- [ ] Unavailable, inconsistent, or unmigratable storage starts no automation,
  permits no mutation, preserves damaged data, and never substitutes an empty
  store.
- [ ] A documented manual backup-and-restore procedure is verified against an
  isolated deployment.
- [ ] Restart tests cover queued, running, retry-scheduled, and idle tasks while
  proving that each task's activation order is preserved.


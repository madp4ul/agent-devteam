# 02 — Complete user task-detail projection

**What to build:** Give task details one authoritative application projection containing the task, inspection, related tasks, conversations, active runs, collaborators, automation, and startup context currently required by the browser.

**Blocked by:** 01 — Complete user board projection.

**Status:** ready-for-agent

- [ ] The complete user task detail is returned through one application query rather than assembled by the HTTP adapter.
- [ ] Related-task lookup and omission rules have one owner.
- [ ] Host and browser compile against the same task-detail response contract.
- [ ] Existing task-detail behavior and failure responses are preserved.
- [ ] Typechecking and the full relevant test suites pass.


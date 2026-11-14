# 02 — Complete user task-detail projection

**What to build:** Give task details one authoritative application projection containing the task, inspection, related tasks, conversations, active runs, collaborators, automation, and startup context currently required by the browser.

**Blocked by:** 01 — Complete user board projection.

**Status:** resolved

- [x] The complete user task detail is returned through one application query rather than assembled by the HTTP adapter.
- [x] Related-task lookup and omission rules have one owner.
- [x] Host and browser compile against the same task-detail response contract.
- [x] Existing task-detail behavior and failure responses are preserved.
- [x] Typechecking and the full relevant test suites pass.

## Comments

Implemented `queryUserTaskDetail` as the authoritative application projection and moved related-task lookup and omission out of the HTTP adapter. The browser client and host adapter now compile against the shared task-detail contract. Verification passed with typechecking, the production build, 188 non-browser tests (2 intentional skips), and 71 browser tests. Standards review found no violations; its test-file organization observation is intentionally deferred to issue 15. Spec review found no remaining gaps after adding complete success, not-found, and configuration-error HTTP response coverage.

# 01 — Complete user board projection

**What to build:** Give the user-facing board one authoritative application projection and one shared transport contract, preserving its current content, ordering, controls, active-run information, attention information, and configuration-error behavior.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] The complete user board is returned through one application query rather than assembled by the HTTP adapter.
- [x] Host and browser compile against the same board response contract.
- [x] Existing board ordering, task paging, attention, automation, and configuration-error behavior is preserved.
- [x] Application, HTTP, and browser tests verify behavior only through their public seams.
- [x] Typechecking and the full relevant test suites pass.

## Comments

Implemented and verified against the application and browser HTTP seams. The
production build, complete non-browser suite, and complete browser suite passed;
the final Standards and Spec reviews reported no findings.

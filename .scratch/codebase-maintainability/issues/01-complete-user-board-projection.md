# 01 — Complete user board projection

**What to build:** Give the user-facing board one authoritative application projection and one shared transport contract, preserving its current content, ordering, controls, active-run information, attention information, and configuration-error behavior.

**Blocked by:** None — can start immediately.

**Status:** claimed

- [ ] The complete user board is returned through one application query rather than assembled by the HTTP adapter.
- [ ] Host and browser compile against the same board response contract.
- [ ] Existing board ordering, task paging, attention, automation, and configuration-error behavior is preserved.
- [ ] Application, HTTP, and browser tests verify behavior only through their public seams.
- [ ] Typechecking and the full relevant test suites pass.


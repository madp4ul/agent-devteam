# 06 — Atomic attention recording

**What to build:** Give workflows one internal operation that records an attention reason together with its provenance activity and eligible notification.

**Blocked by:** 05 — Single durable activity journal.

**Status:** resolved

- [x] Every attention-producing workflow uses the shared operation where its semantics match.
- [x] Attention, activity, and notification remain in the same authoritative transaction.
- [x] Existing attention identifiers, causes, resolution behavior, and notification eligibility remain unchanged.
- [x] User-mention and failed-run scenarios retain their current externally observable behavior.
- [x] Application and notification tests pass through public interfaces.

## Comments

Implemented one internal attention recorder for user mentions, activation startup
failures, and failed-run outcomes. It uses the existing activity journal and
notification policy store on the caller's SQLite connection without opening a
separate transaction. Typechecking, the production build, 38 focused attention
and notification scenarios, and the complete 191-test non-browser suite passed;
the final Standards and Spec reviews reported no findings.

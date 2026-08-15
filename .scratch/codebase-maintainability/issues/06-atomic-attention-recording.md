# 06 — Atomic attention recording

**What to build:** Give workflows one internal operation that records an attention reason together with its provenance activity and eligible notification.

**Blocked by:** 05 — Single durable activity journal.

**Status:** ready-for-agent

- [ ] Every attention-producing workflow uses the shared operation where its semantics match.
- [ ] Attention, activity, and notification remain in the same authoritative transaction.
- [ ] Existing attention identifiers, causes, resolution behavior, and notification eligibility remain unchanged.
- [ ] User-mention and failed-run scenarios retain their current externally observable behavior.
- [ ] Application and notification tests pass through public interfaces.


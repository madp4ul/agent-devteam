# 08 — Structured idempotent command identity

**What to build:** Replace coupled command-type and idempotency-key primitives with one structured internal command identity whose durable serialization and scoped cleanup rules are owned by the idempotent command executor.

**Blocked by:** 07 — Idempotent command execution module.

**Status:** ready-for-agent

- [ ] Compatible command workflows pass one structured command identity rather than parallel storage-oriented strings.
- [ ] The executor owns durable command-type serialization and scope-prefix matching.
- [ ] Archival can forget retained conversation continuations without constructing or depending on encoded command prefixes.
- [ ] Existing serialized identities, accepted and rejected replays, concurrency behavior, and archival privacy remain compatible.
- [ ] Application and adapter tests verify behavior through public seams.


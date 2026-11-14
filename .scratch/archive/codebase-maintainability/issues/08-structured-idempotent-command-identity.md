# 08 — Structured idempotent command identity

**What to build:** Replace coupled command-type and idempotency-key primitives with one structured internal command identity whose durable serialization and scoped cleanup rules are owned by the idempotent command executor.

**Blocked by:** 07 — Idempotent command execution module.

**Status:** resolved

- [x] Compatible command workflows pass one structured command identity rather than parallel storage-oriented strings.
- [x] The executor owns durable command-type serialization and scope-prefix matching.
- [x] Archival can forget retained conversation continuations without constructing or depending on encoded command prefixes.
- [x] Existing serialized identities, accepted and rejected replays, concurrency behavior, and archival privacy remain compatible.
- [x] Application and adapter tests verify behavior through public seams.

## Answer

Reconciled this stale ticket with the implementation already present in commit
`588c05d` (`resolve 8`). The current executor accepts a typed structured command
identity, exclusively owns its compatibility-preserving durable serialization,
and exposes task-scoped continuation cleanup without leaking encoded command
prefixes to archival. Current application and browser-adapter coverage verifies
continuation replay, concurrent idempotency, restart durability, and archival
privacy through public seams. Typechecking, the production build, and the full
199-test non-browser suite pass (197 passed, 2 intentional skips).

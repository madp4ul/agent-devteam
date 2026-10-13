# 05 — Inspect hot rollback journals before migration

**Type:** task
**Status:** resolved
**Blocked by:** None
**Specification:** User-reported startup failure on 2026-10-13. Preserve valuable
retained project state; fix the framework so relaunch succeeds without manual
database repair. Diagnosis is authorized only on copied state.

## Acceptance criteria

- [x] Reproduce the exact conversation_history_items invalid-rootpage diagnostic.
- [x] Recover a complete disposable inspection copy before validating its ledger.
- [x] Reject unsupported histories without modifying retained database/sidecars.
- [x] Upgrade and restart a copy of the affected database successfully.
- [x] Relevant regressions and typechecks pass; document startup invariant.

## Comments

The preserved database copy has a hot rollback journal and no WAL. Omitting the
journal reproduces the exact reported error. Allowing SQLite to recover a working
copy including that journal restores a healthy database with released ledger
0001–0009. This is an interrupted transaction, not divergent migration IDs.
The framework's compatibility inspection omitted `-journal` and opened its copy
read-only, preventing required recovery. The fix copies that sidecar and permits
SQLite recovery only in disposable storage before the query-only ledger check.

The regression models an interrupted schema commit using a SQLite-generated
hot journal. It failed with the user's exact error before the change and passes
afterward; unsupported-history rejection preserves database and journal bytes.
Original state remains untouched. Preserved diagnostic evidence is under the
ignored `.data/migration-debug/preserved/` directory.

## Answer

The missing rollback journal caused the compatibility gate to misdiagnose an
interrupted, recoverable schema write as unsupported migration history. Copying
the journal and allowing recovery only on the disposable inspection database
fixes the gate without weakening ledger or integrity validation. ADR 0018 and
the architecture map now document this requirement. Normal startup subsequently
uses SQLite's standard recovery on supported state; no manual database repair
or migration-ledger rewriting is needed.

Verified on a separate copy of the affected database: upgrade through 0012,
schema/integrity/foreign-key checks and restart all succeed. Counts for tasks,
comments, attempts, transcripts, activations and conversations match the verified
pre-upgrade backup; every original transcript JSON value remains identical.
The preserved evidence and the original database/journal are byte-for-byte
unchanged, verified by SHA-256. No original SQLite connection was opened and the
user's running framework was not restarted.

31 migration tests and typechecks pass. Full Node suite: 413 tests, 407 passed,
six existing platform/opt-in skips, zero failures. Diff whitespace check passes.
Implementation changes remain for user review; agents did not stage content.

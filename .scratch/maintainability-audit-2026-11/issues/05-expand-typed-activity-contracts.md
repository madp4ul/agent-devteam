# 05 — Expand typed activity contracts

**What to build:** Introduce an activity contract that checks new event fields
against their event kind while keeping existing callers and historical activity
readable during a staged migration.

**Blocked by:** None.

**Status:** open

**Scheduling:** Deferred by the user. Do not claim or implement until the user
explicitly resumes this effort after the idle game run.

**Parent:** [November assessment](../spec.md).

## Acceptance criteria

- [ ] Define event-specific persisted payloads and a discriminated activity
  contract that cannot accept a different kind's payload through union widening.
- [ ] Add a checked authoring interface alongside the existing compatibility
  path. Migrate task creation through writing, reading and presentation as the
  first complete demonstration of the new contract.
- [ ] Separate authored persisted facts from query enrichment. Make historical
  missing fields and decoding behavior explicit without rewriting retained data.
- [ ] Demonstrate compiler rejection of missing required fields, misspelled
  fields and mismatched event payloads using focused type-level checks.
- [ ] Preserve current serialized shapes, readable historical fixtures, actor
  attribution and behavior. No released migration is edited.
- [ ] Keep the expansion green with unmigrated event families. Do not replace
  unknown historical data with fabricated current facts or weaken strict types.
- [ ] Use a focused contract and decoding seam; no event bus, event sourcing,
  ORM adoption or blanket runtime validation project is introduced.
- [ ] Document how the remaining migration tickets use the compatibility path.

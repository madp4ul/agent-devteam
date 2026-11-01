# Heavy usage delivery

Specification: [Heavy usage](spec.md)

## Tickets

- [01 — Page agent conversations](issues/01-page-agent-conversations.md): resolved.
- [02 — Page task timelines and preserve the full map](issues/02-page-task-timelines-and-lazy-map.md): resolved.
- [03 — Recover transient runtime failures](issues/03-recover-transient-runtime-failures.md): resolved.
- [04 — Retain loaded timeline content and fix scroll navigation](issues/04-retain-loaded-timeline-and-fix-scroll-navigation.md): resolved.
- [05 — Inspect hot rollback journals before migration](issues/05-inspect-hot-rollback-journals-before-migration.md): resolved.
- [06 — Expire archived-task command-response caches](issues/06-expire-archived-task-command-response-caches.md): resolved.

## Decisions so far

- [Ticket 06](issues/06-expire-archived-task-command-response-caches.md) records
  atomic expiry of archived owners' mutation snapshots while preserving creation
  and lifecycle receipts. Verified offline idle-game cleanup removed 6,761 cached
  responses and reduced the live database from 12.14 GB to 8.78 GB, with a verified
  backup retained. Active-task cache growth remains unchanged; deletion reuses
  SQLite pages and explicit offline compaction shrinks the file. Verification:
  45 focused tests, typechecks, integrity/foreign-key checks, unchanged authoritative
  counts and recorded row identities. See [ADR 0034](../../docs/adr/0034-expire-task-owned-command-responses-at-archival.md).

- [Ticket 05](issues/05-inspect-hot-rollback-journals-before-migration.md) fixes
  compatibility inspection of interrupted transactions: copy the rollback
  journal and permit SQLite recovery only on disposable inspection storage.
  A copy of the affected board upgrades and restarts with retained evidence
  preserved. Original database/journal hashes are unchanged. Verification:
  31 migration tests, 407 full Node passes (six skips), typechecks and whitespace
  checks passed.

- Ticket 01 pages indexed conversation evidence before hydration; its accepted
  work was preserved while tickets 02 and 03 were implemented.
- [Ticket 02](issues/02-page-task-timelines-and-lazy-map.md) pages task timeline
  groups and nested attempt content, while loading complete compact movement
  metadata independently. [ADR 0027](../../docs/adr/0027-page-task-timelines-and-load-the-movement-map-independently.md)
  records the cursor and browser-window contract.
- [Ticket 03](issues/03-recover-transient-runtime-failures.md) retries classified
  transient failures indefinitely with durable waiting episodes and unpublished
  no-progress probes. [ADR 0028](../../docs/adr/0028-retry-transient-runtime-failures-with-provisional-probes.md)
  records the exception to ordinary finite retries and preserves the separate
  stall-recovery budget.
- [Ticket 04](issues/04-retain-loaded-timeline-and-fix-scroll-navigation.md)
  incorporates user testing: retain requested history, replace empty spacers with
  explicit gap controls and stabilize map scrolling. [ADR 0029](../../docs/adr/0029-retain-requested-task-timeline-content.md)
  supersedes ticket 02's browser eviction policy while preserving bounded queries.
  Verification: 61 browser checks, 406 Node passes (six skips), typecheck/build,
  independent reviews and 30 successful map jumps against the seeded demo.

Tickets 02 and 03 were completed sequentially in the original shared checkout.
Final verification: 412 Node tests (406 passed, 6 platform skips), 33 browser
regression checks passed, typechecks/build passed, and both independent review
axes have no remaining actionable findings. The staged patch is unchanged; new
implementation work remains unstaged for user review.

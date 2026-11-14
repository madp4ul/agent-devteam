# Heavy usage delivery

Specification: [Heavy usage](spec.md)

## Tickets

- [01 — Page agent conversations](issues/01-page-agent-conversations.md): resolved.
- [02 — Page task timelines and preserve the full map](issues/02-page-task-timelines-and-lazy-map.md): resolved.
- [03 — Recover transient runtime failures](issues/03-recover-transient-runtime-failures.md): resolved.
- [04 — Retain loaded timeline content and fix scroll navigation](issues/04-retain-loaded-timeline-and-fix-scroll-navigation.md): resolved.
- [05 — Inspect hot rollback journals before migration](issues/05-inspect-hot-rollback-journals-before-migration.md): resolved.
- [06 — Expire archived-task command-response caches](issues/06-expire-archived-task-command-response-caches.md): resolved.
- [07 — Independently assess active command-response storage](issues/07-assess-active-command-response-storage.md): resolved; follow-up issues recorded, implementation held.
- [08 — Use compact durable command results](issues/08-use-compact-durable-command-results.md): resolved; full tests, browser checks and independent reviews pass; changes unstaged.
- [09 — Convert historical command-response snapshots safely](issues/09-convert-historical-command-response-snapshots.md): resolved; verified migration and offline cleanup reduced idle-game storage from 11.03 GB to 609 MB; recovery backups retained.
- [10 — Recover an unrecorded preparation worktree blocking startup](issues/10-recover-unrecorded-preparation-worktree.md): resolved; checkout preserved, pause/provision race fixed, real host restarted paused with zero consistency diagnostics.
- [11 — Dispatch unrelated tasks while workspaces are preparing](issues/11-dispatch-independently-of-workspace-preparation.md): resolved; separate two-slot creation/verification lanes, truthful preparation query and preserved pause/restart ownership. Full suite 452 passed / 6 skipped; both review axes clear.
- [12 — Show workspace creation progress instead of an agent running](issues/12-show-workspace-preparation-progress.md): resolved; real bounded Git progress, preparation/startup/execution projections and shared browser presentation. Full suite 457 passed / 6 skipped; both review axes clear.
- [13 — Allow automation to resume while existing agents are draining](issues/13-resume-automation-while-pausing.md): resolved; enabled Resume during pausing with one wakeable pump and completion/settlement race coverage. Full suite 462 passed / 6 skipped; final focused checks and both review axes clear.
- [14 — Keep browser reload and comment posting responsive during agent activity](issues/14-keep-browser-responsive-during-agent-activity.md): fixed delayed comment confirmation, repeated transcript copying, and measured per-item commit pressure. The original two-minute incident remains unverified.

## Current frontier

- Ticket 14 remains open for evidence from the original stall or a representative live workload.

- Tickets 11–13 are resolved: bounded preparation, truthful live progress and
  startup/execution reporting, and reversible draining through Resume. The user
  authorized sequential implementation of all three on 2026-11-08.

## Decisions so far

- [Ticket 10](issues/10-recover-unrecorded-preparation-worktree.md) corrects the
  restart-readiness handoff: T-0285 was already unrecorded in both pre-upgrade
  backups. A real pause-after-Git-preparation regression reproduced the exact
  startup block; prepared workspace ownership now survives claim release. The
  existing orphan was fully backed up and preserved outside managed state with
  unchanged database bytes and verified files/HEAD/index. Real startup/API now
  report paused, no active runs and zero consistency diagnostics. Verification:
  448 Node passes, six existing skips, typecheck, zero review findings. See ADR 0036.

- Tickets 08/09 are complete after the user lifted the hold on 2026-11-02.
  Compact receipts preserve original historical facts without full task snapshots;
  the released migration safely backfills supported rows and preserves every retry
  identity. The real idle-game database shrank from 11.03 GB to 609 MB; response
  payload fell from 10.42 GB to 8.84 MB. Exact response and authoritative data
  fingerprints, integrity and foreign keys verify; both recovery backups remain.
  Verification: 447 Node passes (six existing skips), 22 browser passes, typecheck,
  build and zero remaining Standards/Spec findings. All source changes are unstaged.

- [Ticket 07](issues/07-assess-active-command-response-storage.md) independently
  assesses the active-cache follow-up. It recommends a deliberate compact-result
  contract, preserving original retry facts and request matching; current browser
  consumers generally refresh rather than consume rich mutation snapshots.
  Synthetic measurements reproduced by parent and assessor show roughly quadratic
  full-snapshot growth and linear fixed-size receipt growth under bounded inputs.
  [The specification](active-command-response-storage-spec.md) and tickets 08/09
  are recorded following the user's approval to create issues only. The user
  explicitly held implementation while the project runs; agents must await a
  later instruction to start work, even if the project has stopped.
  Exact-response compression remains the alternative if full old response objects
  must be preserved. No production or retained project-state access occurred.

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

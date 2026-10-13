# Heavy usage delivery

Specification: [Heavy usage](spec.md)

## Tickets

- [01 — Page agent conversations](issues/01-page-agent-conversations.md): resolved.
- [02 — Page task timelines and preserve the full map](issues/02-page-task-timelines-and-lazy-map.md): resolved.
- [03 — Recover transient runtime failures](issues/03-recover-transient-runtime-failures.md): resolved.
- [04 — Retain loaded timeline content and fix scroll navigation](issues/04-retain-loaded-timeline-and-fix-scroll-navigation.md): resolved.

## Decisions so far

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

# Feedback and lifecycle menus

## Objective

Implement [the agreed specification](spec.md) and provide a real, isolated
software-delivery example for visual review.

## Decisions so far

- Ordinary feedback floats independently and closes with an SVG X. Success is
  timed and pauses on hover/focus; accepted comment posts also show feedback.
- Preparing, Running and Archiving are separate shared toolbar menus.
  Active work precedes dismissible retained history. Counts describe current
  work, with queued tasks included in Archiving.
- History survives navigation, reload and host restart. Run history retains
  thirty entries; preparation and archival history remain until dismissed.
- Closed menus poll compact indexed counts only; detail/history pages load
  on demand. Existing archival execution and consent rules remain authoritative.
- [ADR 0048](../../docs/adr/0048-retain-lifecycle-results-in-shared-toolbar-menus.md)
  records persistence ownership and the revised presentation.

## Delivery

- Resolved [01 — Implement feedback and lifecycle menus](issues/01-implement-feedback-and-lifecycle-menus.md).
  Implementation and isolated example are ready for user review; see the ticket
  for validation and the existing unrelated suite failure.
- [Example review guide](../../examples/software-delivery/UI-REVIEW.md)
- Resolved [02 — Individual archival entries and run status chips](issues/02-show-individual-archivals-and-run-status-chips.md).
  Archival menu history follows individual task outcomes, including during an
  active batch. Run history uses shared status chips and live preparations carry
  their own titles. See [ADR 0049](../../docs/adr/0049-project-archival-menu-history-per-task.md).
- Resolved [03 — Inventory remaining success feedback](issues/03-inventory-remaining-success-feedback.md)
  records the source audit and passive examples. The [inventory](success-feedback-inventory.md)
  records the final approved policy, including confirmed interruption feedback.
- Resolved [04 — Simplify and time success feedback](issues/04-simplify-and-time-success-feedback.md).
  Message-only colored cards have five-second success countdowns paused by hover
  or focus, persistent errors, and a natural stack without internal scrolling.
- Resolved [05 — Float workspace feedback and compact cards](issues/05-float-workspace-feedback-and-compact-cards.md)
  moves workspace/file confirmations to the shared surface and adds timed comment
  success. Cards have a smaller X and a full-height clipped countdown edge.

## Review closeout

The user accepted the presentation. The port-3010 review server is stopped and
its generated repository, worktrees, database, attachments, browser build and logs
are removed. Source launch/seed scripts remain reusable. Final interruption
consolidation and cleanup are tracked in [06](issues/06-close-feedback-review-and-remove-environment.md).
That closeout is resolved. Standards and specification reviews have no remaining
blockers. [07](issues/07-investigate-custom-server-browser-timeouts.md) records two
broader custom-server test teardown timeouts for separate investigation.

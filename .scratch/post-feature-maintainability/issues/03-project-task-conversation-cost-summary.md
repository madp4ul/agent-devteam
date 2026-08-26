# 03 — Project task conversation cost summary

**What to build:** Return the task-wide conversation cost summary as part of the complete user task-detail projection so the browser renders authoritative estimate, breakdown, pending, and lower-bound facts without reconstructing them from conversation rows.

**Blocked by:** 02 — Localize token cost semantics.

**Status:** resolved

- [x] The complete user task-detail projection includes an optional task conversation-cost summary with estimate, optional breakdown, pending state, and lower-bound state.
- [x] The summary is assembled inside the coordination application from the same conversation evidence already returned for the task.
- [x] The shared token-cost aggregation semantics combine amounts and group equal category-and-rate rows without erasing historical rate changes.
- [x] No conversations and conversations without available or pending cost omit the summary rather than presenting a measured zero.
- [x] A first priceable running attempt can present the existing pending zero state without claiming settled usage.
- [x] Settled conversations without usable cost retain the known-cost lower-bound explanation.
- [x] Individual conversation estimates and breakdowns remain available for conversation-row and dialog inspection.
- [x] The task conversations browser module renders the supplied summary and contains no authoritative cost calculation or grouping logic.
- [x] The web adapter only serializes the complete projection and does not coordinate lower-level cost queries.
- [x] Application and rendered-browser tests cover totals, mixed historical rates, pending work, unavailable costs, and lower-bound presentation through public seams.
- [x] Typechecking, focused task-detail and browser cost coverage, the full non-browser suite, the production build, and the complete browser suite pass.

## Answer

Extended the complete user task-detail projection with an optional application-owned
`conversationCost` summary. `CoordinationApplication` derives it from the same
conversation index entries returned in the projection and delegates re-aggregation
to the shared token-cost module, which preserves pending and lower-bound facts and
compacts only equal category-and-rate rows. The summary is omitted when there is no
available or pending cost evidence. Individual conversation cost facts remain in
the index and dialog projections.

The task conversations browser panel now renders only the supplied summary; its
former amount calculation and breakdown-grouping logic were removed. The web
adapter remains a serializer of the complete application projection.

Verification completed on 2026-08-25:

- `pnpm typecheck` — passed after implementation and after the review fix.
- Focused complete task-detail lifecycle coverage — 5 passed, including omission,
  pending zero, historical-rate grouping, individual conversation retention, and
  known-cost lower-bound behavior.
- Focused application conversation suite — 13 passed before the review-only test
  organization change.
- Focused browser cost and transcript suite — 15 passed.
- `pnpm test` — final rerun 232 passed, 3 skipped, 0 failed. One unrelated CLI
  startup-output timing failure on the first post-review rerun passed immediately
  in isolation and on the final complete rerun.
- `pnpm build` — passed.
- `pnpm test:browser` — 105 passed, 0 failed.
- Unstaged and staged `git diff --check` — passed.
- Required independent two-axis code review — initial Standards finding about one
  multi-state test was addressed with four named logical subtests; final Standards:
  0 findings; final Spec: 0 findings.

No architecture overview or ADR update was needed because the change implements
the existing complete-projection authority and adapter boundaries. The agent ran no
Git staging, unstaging, commit, rebase, or push command. A concurrent external Git
action staged implementation files during the work; that index snapshot was left
untouched and subsequent changes remain an unstaged layer.

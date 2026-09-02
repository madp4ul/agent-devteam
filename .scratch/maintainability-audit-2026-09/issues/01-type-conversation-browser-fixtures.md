# 01 — Type valid conversation browser fixtures

**What to build:** Make ordinary conversation browser fixtures conform to the
shared conversation, authored-message and transcript contracts, so future
contract changes identify outdated test data during typechecking and existing
browser scenarios continue to exercise realistic responses.

**Blocked by:** None — can start immediately.

**Status:** resolved

**Parent:** [September maintainability assessment](../spec.md).

## Acceptance criteria

- [x] Shared valid conversation and transcript builders use the actual
  discriminated application/transport contracts for inputs and outputs.
- [x] Ordinary authored-message fixtures include required attachment metadata,
  and conversation fixtures include required pending and lower-bound cost facts.
- [x] Migrate consumers of the shared builders across the conversation,
  automation and archival browser scenarios in the same green change. Typed
  history updates replace broad `any` and loose-record casts for valid data.
- [x] Narrow overrides express scenario intent without allowing required
  fields to disappear. Do not build a generic fixture framework or deep-merge DSL.
- [x] Keep explicitly malformed, unavailable, unknown-tool or raw-transport
  scenarios possible at their intended seam. Do not normalize away evidence
  that those scenarios exist to test; distinguish intentional invalid data
  from ordinary valid builders.
- [x] Preserve scenario meaning, behavioral assertions and production contract
  strictness. Do not weaken production types or add blanket casts to get green.
- [x] Existing typechecking catches required-field and invalid history/item
  shape mistakes in valid builders. No extra runtime fixture-validation system
  or tests mirroring the builders are required.
- [x] Run typechecking and all browser suites consuming the changed helpers.
  Report the resulting coverage and any pre-existing failures separately.
- [x] Leave changes unstaged and complete the repository's code review before
  handing implementation back for user review.

## Rationale and scope

The assessment records examples of already missing required fields. This ticket
improves the earliest useful feedback for future agent changes. It does not
redesign HTTP decoding, change product behavior, or attempt repository-wide
elimination of every cast. Start from the common valid builders and follow their
actual consumers; keep intentional transport exceptions local.

## Answer

Implemented the shared conversation browser fixtures against
`AgentConversationQueryResult`, `AgentConversationHistoryEntry`,
`AgentConversationMessageView`, `ContinueAgentConversationResult`, and
`AttemptTranscriptItem`. Valid conversation responses now include the required
pending-cost and known-cost-lower-bound facts; ordinary authored messages carry
attachment metadata; valid history mutations use discriminated entries rather
than broad records or `any`. Existing raw evidence remains available through
the contract's explicit evidence fields and generic MCP/tool variants.

Verification:

- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd test`: 317 tests; 313 passed, four skipped, zero failed.
- All six browser files that imported or consumed the shared helpers were run
  together: 65 passed; one unchanged automation scenario timed out waiting for
  the task-move combobox. The same scenario failed identically when rerun alone.
- The attachment suite was rerun after the final review fix: seven passed.
- `git diff --check`: passed (Git reported only the repository's existing
  LF-to-CRLF working-copy warnings).
- Required two-axis code review: Standards — no findings; Spec — one typed
  accepted-response gap found, fixed, and re-reviewed with no remaining findings.

All implementation changes remain unstaged. Ticket 02 was not changed.

# Post-feature maintainability

## Problem Statement

The coordination framework remains behaviorally healthy and its major authority,
transaction, adapter, and persistence seams still match the documented
architecture. The recent conversation-attachment and token-cost features have,
however, concentrated new implementation and verification knowledge in a few
places that had just been made easier to change by the previous maintainability
rounds.

The conversation dialog now coordinates the complete attachment-draft workflow
alongside remote conversation loading, polling, reader-position preservation,
retirement, modal focus, and optimistic history updates. A future change to
follow-up composition therefore requires understanding several unrelated dialog
lifecycles. Attachment limits are also repeated by the browser, HTTP adapter,
and durable attachment implementation.

Token-cost calculation and aggregation are similarly distributed. Attempt cost
calculation, conversation index aggregation, conversation detail aggregation,
and task-level aggregation each own part of the same pricing semantics. The
browser reconstructs the task-wide cost presentation from conversation entries
even though complete user-facing task projections belong to the coordination
core.

Finally, the new attachment and cost scenarios have regrown the broad
conversation application and browser suites. The behavior remains well tested,
but locating and running the relevant coverage once again requires loading
unrelated conversation lifecycle and transcript scenarios.

## Solution

Run a narrow, behavior-preserving maintainability pass over the new attachment
and token-cost capabilities.

Deepen follow-up composition into one browser module that owns the draft,
attachment selection and validation, upload progress, retry and removal,
submission, idempotency, cleanup, and rendered composer. Keep conversation
loading, polling, history, reader-position preservation, retirement, modal
lifecycle, and dialog-level focus in the conversation dialog shell. Give every
layer one shared product-owned attachment policy so limits cannot drift.

Localize token-cost calculation and aggregation in one focused application
module. It should calculate an attempt estimate from isolated usage and a
snapshotted process price, combine priced results without losing historical
rates, and preserve pending and lower-bound semantics. Conversation projections
and the complete user task-detail projection should consume that module. The
browser should render the application-owned task cost summary rather than
reconstructing it from individual conversations.

Then restore focused test homes for conversation attachment composition and
token-cost behavior while retaining the existing public application, HTTP, and
rendered-browser test seams.

## User Stories

1. As the project maintainer, I want follow-up composition behind one small interface, so that changing draft or attachment behavior does not require navigating conversation polling and retirement code.
2. As the project maintainer, I want the follow-up composer to own its complete draft lifecycle, so that upload, retry, removal, submission, and cleanup invariants remain local.
3. As the project maintainer, I want the conversation dialog to remain the owner of conversation loading and polling, so that extracting the composer does not create a second conversation state owner.
4. As the project maintainer, I want optimistic acceptance of a submitted follow-up expressed through one narrow callback, so that the dialog can update history without knowing the composer's internal state machine.
5. As a user, I want text-only, attachment-only, and combined follow-ups to behave exactly as they do now, so that maintenance causes no workflow regression.
6. As a user, I want upload progress, failure, retry, removal, and retained drafts after submission failure to remain unchanged.
7. As a user, I want closing a conversation to cancel in-flight work and discard pending uploads without affecting sent attachments.
8. As a user, I want window-wide file-drop safety and foreground-dialog routing to remain unchanged.
9. As a keyboard or assistive-technology user, I want attachment controls, submission, dialogs, and focus behavior to retain their current accessible names and operation.
10. As the project maintainer, I want attachment count and byte limits defined once, so that browser guidance, HTTP rejection, and durable validation cannot drift.
11. As the project maintainer, I want attempt cost calculation behind one focused interface, so that pricing changes do not require editing automation persistence mechanics.
12. As the project maintainer, I want conversation index and detail costs summarized by the same rules, so that equivalent evidence cannot produce different totals.
13. As the project maintainer, I want cost aggregation to preserve each attempt's snapshotted rate, so that historical costs remain truthful after process edits.
14. As the project maintainer, I want task-wide conversation cost returned by the complete user task-detail projection, so that the browser remains a presentation adapter.
15. As a user, I want attempt, conversation, and task totals to retain their current displayed values and rounding.
16. As a user, I want pending attempts and settled attempts without usable costs to retain their current pending and known-lower-bound explanations.
17. As a user, I want cost breakdown categories grouped by category and rate at task level, so that historical rate changes remain visible without producing a noisy list.
18. As the project maintainer, I want attachment application behavior in a focused test suite, so that attachment changes have an obvious verification command.
19. As the project maintainer, I want rendered attachment composition in a focused browser suite, so that conversation lifecycle tests do not absorb the complete attachment matrix.
20. As the project maintainer, I want token-cost application and browser behavior in focused suites, so that pricing changes do not require loading unrelated transcript presentation cases.
21. As the project maintainer, I want shared fixtures to describe conversations, uploads, usage, pricing, and costs in domain language rather than storage or React implementation details.
22. As the project maintainer, I want tests to remain at public application, HTTP, runtime, and rendered-browser interfaces, so that internal reorganization does not freeze implementation structure.
23. As the project maintainer, I want every maintenance ticket to preserve green typechecking, relevant focused suites, the complete non-browser suite, the production build, and the complete browser suite.
24. As the project maintainer, I want each ticket to fit one fresh implementation context and leave the worktree unstaged for review.

## Implementation Decisions

- Preserve `CoordinationApplication` as the authoritative public command and query interface.
- Preserve the conversation dialog shell as owner of remote conversation loading, refresh ordering, polling, history selection, scroll and text-selection preservation, retirement, modal lifecycle, and dialog-level focus.
- Introduce one deep follow-up composer browser module. Its interface receives the addressed task and conversation identities plus a narrow accepted-follow-up callback. Its implementation owns text draft state, attachment selection, client-side policy guidance, upload progress, abort controllers, retry, removal, window-drop routing while eligible, idempotent submission, pending-upload cleanup, and composer rendering.
- A successful composer submission reports the accepted authored message and activation identity to the dialog. The dialog retains optimistic conversation-history integration and decides when to refresh.
- Composer unmount and explicit dialog close must release disposable client and pending-upload state without deleting immutable sent attachments.
- Define the fixed product-owned conversation attachment policy once in a transport-safe application module. Browser guidance, HTTP early rejection, and durable attachment validation consume the same count and total-byte values.
- Keep the durable conversation attachment implementation cohesive. Do not split its pending, immutable-original, runtime-projection, recovery, or archival behavior into new public stores or authorities.
- Introduce one focused token-cost application module with small interfaces for calculating an attempt result from usage and pricing and for aggregating priced attempt or conversation results.
- Preserve isolated attempt usage and snapshotted process pricing as the inputs to cost calculation. Reasoning output remains informational and is not billed separately from output.
- Preserve exact stored cost amounts and breakdown rows. Aggregation combines amounts with bounded numeric precision, retains lower-bound and pending facts, and groups categories only when the consumer requires a compact aggregate by category and rate.
- Conversation index and conversation detail projections use the same aggregation semantics even though one reads compact persisted evidence and the other may assemble complete transcript evidence.
- Extend the complete user task-detail projection with an optional task conversation-cost summary containing the estimate, optional breakdown, pending state, and lower-bound state.
- The task conversations browser module renders that summary and does not derive authoritative cost semantics from individual conversation entries.
- Keep individual conversation cost facts in the conversation index because each conversation row and dialog remains independently inspectable.
- Do not introduce a schema migration, new database table, new process configuration, new network process, repository abstraction, or configurable extension seam.
- Existing ADRs already govern complete user projections, browser lifecycle locality, conversation projections and continuation, and attachment ownership. Update the architecture overview or an ADR only if implementation reveals a durable architectural change beyond this refinement.
- Leave changes unstaged and do not stage, commit, rebase, or push.

## Testing Decisions

- Tests describe observable behavior and use public interfaces; they do not import private persistence modules, inspect private React structure, assert filesystem call counts, or freeze SQL layout.
- The primary follow-up acceptance seam is the rendered conversation dialog backed by its browser HTTP interface. It covers text, attachments, progress, failure, retry, removal, drop routing, submission, cleanup, focus, and both appearances.
- Application-level attachment tests retain authoritative coverage for ownership, limits, binding, idempotency, restart durability, conversation isolation, runtime availability, and archival cleanup.
- HTTP tests cover streamed upload bounds and response mapping only where transport behavior is distinct from application behavior.
- The primary token-cost seam is `CoordinationApplication`: attempt completion persists truthful cost facts, conversation index and detail agree, and the complete task-detail projection supplies the task aggregate.
- A focused pure token-cost seam may exhaustively cover malformed usage, ordinary-input derivation, rate-preserving grouping, numeric precision, pending results, and lower-bound results when repeating complete application setup would add no confidence. Representative cases still cross the application seam.
- Browser cost tests verify rendered values, category/rate breakdowns, pending and lower-bound explanations, keyboard and pointer disclosure, and task-versus-conversation presentation without inspecting aggregation implementation.
- Move new attachment and cost scenarios into focused suites without deleting or weakening meaningful assertions. Preserve cross-capability end-to-end cases where splitting would reduce confidence.
- Add focused package commands for the new test homes so future agents can verify either capability without loading unrelated suites.
- Every ticket keeps typechecking and its focused suites green. Final verification includes the full non-browser suite, complete browser suite, production build, and diff hygiene.

## Out of Scope

- New user-facing attachment capabilities, previews, file types, limits, sharing, or lifecycle rules.
- Changes to conversation continuation, retirement, activation ordering, runtime delivery, or thread continuity semantics.
- New pricing categories, currencies, invoice claims, configurable compaction limits, or live in-progress token estimates.
- Reworking transcript semantic projection or conversation-history presentation.
- Splitting large coordination, automation, web, projection, attachment-storage, or CSS modules solely because of line count.
- Moving generic modal, polling, refresh, text-selection, or file-drop safety policy into feature-specific state owners.
- Database schema changes or persistence-format compatibility work.
- Staging, committing, rebasing, or pushing changes.

## Further Notes

This is the third maintainability pass, but only the first one driven by the
attachment and pricing features added after the preceding rounds. It is not
evidence that the earlier application, transaction, contract, or transcript
seams failed. The repository is currently green; this effort is intended to
reduce the context and blast radius of future changes while behavior is stable.

The project maintainer is the sole implementation customer for this effort and
has authorized the agent to confirm planning seams and ticket granularity on
the maintainer's behalf.

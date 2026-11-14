# 04 — Organize attachment and cost tests

**What to build:** Give conversation attachments and token costs separate, independently runnable application and browser test homes so future changes can locate and verify either capability without loading unrelated conversation lifecycle or transcript presentation scenarios.

**Blocked by:** 01 — Deepen conversation follow-up composer; 02 — Localize token cost semantics; 03 — Project task conversation cost summary.

**Status:** resolved

- [x] Conversation attachment application behavior has one obvious suite covering ownership, limits, binding, idempotency, restart durability, conversation isolation, runtime availability, and archival cleanup.
- [x] Rendered follow-up attachment composition has one obvious browser suite covering selection, drop routing, navigation suppression, progress, failure, retry, removal, text-only and attachment-only submission, cleanup, accessibility, and narrow layout.
- [x] Token-cost application behavior has one obvious suite covering attempt calculation, conversation aggregation, task aggregation, snapshots, missing usage, pending work, lower bounds, and mixed rates.
- [x] Rendered token-cost behavior has one obvious browser suite covering attempt, conversation, and task totals; breakdown disclosure; rounding; pending and lower-bound explanations; and keyboard and pointer interaction.
- [x] Conversation lifecycle and transcript presentation suites retain only scenarios whose primary behavior belongs to those capabilities.
- [x] Cross-capability end-to-end scenarios remain intact where moving or splitting them would weaken confidence.
- [x] Shared fixtures express conversations, uploads, usage, pricing, and costs in domain language without exposing private tables, filesystem layout, or React implementation structure.
- [x] Every meaningful existing assertion remains represented, and test order does not affect results.
- [x] Focused package commands run attachment application, attachment browser, cost application, and cost browser coverage independently.
- [x] No product implementation is changed merely to make file splitting easier.
- [x] Typechecking, every focused suite, the full non-browser suite, the production build, the complete browser suite, and diff hygiene pass.

## Answer

Organized conversation attachment and token-cost coverage into independently
runnable application and rendered-browser suites. Attachment coverage now has
focused cases for ownership, binding, idempotency, runtime delivery, restart
durability, conversation isolation, count and streamed byte limits, archival
cleanup, selection and drop safety, upload progress/failure/retry/removal,
attachment-only and text-only submission, cleanup, accessibility, both
appearances, and narrow layout. Token-cost coverage now colocates pure attempt
calculation and aggregation with application-level conversation/task totals,
snapshotted pricing, missing usage, pending and lower-bound facts, mixed rates,
and rendered positive, rounded, pending, lower-bound, pointer, and keyboard
presentation.

Added domain-named shared fixtures for conversations, uploads, usage, pricing,
and cost evidence, and four focused package commands:

- `pnpm test:application:conversation-attachments`
- `pnpm test:browser:conversation-attachments`
- `pnpm test:application:token-cost`
- `pnpm test:browser:token-cost`

Verification completed on 2026-08-26:

- `pnpm typecheck` — passed.
- Attachment application suite — 7 passed.
- Attachment browser suite — 7 passed; repeated twice after the final drop-listener readiness fix.
- Token-cost application suite — 12 passed.
- Token-cost browser suite — 4 passed.
- `pnpm test` — 239 passed, 3 skipped, 0 failed.
- `pnpm build` — passed.
- `pnpm test:browser` — 109 passed, 0 failed.
- Staged and unstaged `git diff --check` — passed.
- Required independent two-axis review after fixes — Standards: 0 findings; Spec: 0 findings.

No product implementation or architecture documentation changed for ticket 04.
The cross-capability assembled follow-up scenario remains intact in the
conversation lifecycle suite. The agent ran no Git staging, unstaging, commit,
rebase, or push command. External Git activity staged most ticket 04 content
during implementation; that index snapshot was left untouched, and the final
ticket-resolution and subsequent review fixes remain an unstaged layer.

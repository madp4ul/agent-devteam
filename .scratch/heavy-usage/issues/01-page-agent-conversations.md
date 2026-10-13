# 01 — Page agent conversations without loading complete transcripts

**Type:** task
**Status:** resolved
**Blocked by:** None — can start immediately.
**Specification:** [Heavy usage](../spec.md), especially paged reads and verification.

## What to build

Open conversations at their newest 50 history elements and load older pages when
the user scrolls upward. Keep loading, refresh, and rendering bounded for long
conversations, including a single very large attempt transcript. Preserve
reading position, source navigation, and current conversation controls.

## Acceptance criteria

- [x] Application/HTTP queries expose bounded pages with stable record identities,
      deterministic order, validated scoped cursors, and end-of-history state.
      Conversation metadata and authoritative total costs remain available.
- [x] Query execution does not enumerate every task activation, hydrate every
      conversation attempt, or parse all transcript JSON before slicing. Add
      indexed item-level persistence through a released migration if needed;
      preserve existing transcripts and lineage.
- [x] A single activation or transcript spanning many pages stays pageable, with
      source/attempt attribution and resume/continuity/retirement placement intact.
- [x] Upward scrolling loads earlier history; prepending and window eviction keep
      the reading anchor and text selection stable. Rendered and cached history
      stay bounded, using three pages as the initial window target.
- [x] Latest refresh handles live item updates and new items without reloading all
      visited history, duplicates, omissions, or forcing older readers downward.
      Existing bottom-following and follow-up composition remain functional.
- [x] Opening an old message/attempt or pending activation loads its relevant
      window directly, preserving existing deep-link and comment-source behavior.
- [x] Loading, retryable errors, exhaustion, task/conversation switching and stale
      responses are handled; attachments, retirement, archived evidence,
      agent-inspectable disclosure, and cost/context meters retain their semantics.
- [x] Public query/HTTP and browser coverage exercises 10,000 elements, a transcript
      larger than a page, equal timestamps and concurrent updates. Demonstrate
      bounded hydration/response/DOM counts rather than only a smaller response.
- [x] Relevant conversation/live-following/attachment regressions, typechecks and
      build pass. Verify new visual states in both themes, update implemented
      architecture/domain facts and ADRs as needed, and leave changes unstaged.

## Comments

The page size is a tunable engineering default. This ticket concerns browser
history; do not change agent context composition or the agent history tool.


## Completion — 2026-10-13

Implemented bounded application/HTTP conversation pages (50 default, 150 maximum),
project-signed conversation-scoped cursors, coherent backward watermarks, separate
live-window refresh, and direct attempt/message/activation windows. Migration
0010 backfills indexed whole transcript items and history positions without
rewriting released evidence. Live Codex items enter the same projection through
application lifecycle transactions. Empty attempts resolve their cause; resumes,
continuity loss, retirement, attachments and historical ownership remain intact.
Archive clears streamed detail even without a finalized JSON snapshot, and old
released follow-up activations with deleted messages do not consume page slots.

The browser retains at most 150 elements with overlapping windows, measured
spacers and durable reading/selection endpoints. Actual upward scrolling loads
older content. Selected endpoint records cannot be evicted until selection clears.
Older readers retain their position while polling; latest readers follow live
content. Page errors preserve loaded history and retry their direction, including
an edge exhausted by concurrent refresh. Stale responses cannot cross task changes.
Paged follow-ups use immediate bounded refresh instead of exceeding the window
with an optimistic extra record.

### Verification

- `pnpm typecheck`: passed (application and browser TypeScript projects).
- `pnpm build`: passed; existing bundle-size advisory remains (about 521 kB JS).
- Final `pnpm test`: **394 tests, 388 passed, 0 failed, 6 platform skips**,
  about 50.3 seconds. Full output: [Node results](../ticket-01-tests.log).
- Conversation, HTTP, attachment and cost focused suites: **37 passed**;
  [focused results](../ticket-01-focused-tests.log). Final archive regression
  recheck: all **7 attachment tests passed**.
- Released migration suite: **28 passed**, including 10,000-item released
  backfill, original JSON preservation, backups/rollback and schema verification.
  Final full suite also covers the added deleted-source migration fixture.
- Browser conversation paging, following, lifecycle, attachments, transcript,
  and cost regression batch: **62 passed**, about 1.7 minutes;
  [browser results](../ticket-01-browser-tests.log).
- After final changes: **5 focused browser tests passed** (large-window upward
  scroll/anchor/selection, task-switch race, direct source/retry, assembled
  follow-up, and failed newer edge exhausted by background refresh). An earlier
  final follow-up/navigation/live/window recheck also passed **7 tests**.
- Large transcript: 10,000 elements; 50 returned per ordinary read; four public
  queries about **9.7 ms**, **zero complete transcript reads**. Exact newest and
  older SQL plans use `conversation_history_position` without table scans or
  temporary sort buffers. Initial-page index choice is explicit because SQLite
  otherwise chose a watermark range followed by a full sort.
- Large activation history: 10,000 equal-time causes and attempts, 50 hydrated
  causes per page, direct old source lookup, exact authoritative **$100** total.
  Comparable 50-cause queries measured about **36.9 ms at 100 attempts** and
  **68.1 ms at 10,000 attempts**. Cost aggregation still reads all compact usage
  rows; it neither hydrates attempt views nor reads transcript arrays. This
  remaining linear aggregate cost is deliberate and documented in ADR 0026.
- Dark/light control contrast, reload after eviction, a measured anchor shift of
  at most **1 pixel**, text-selection retention/protected eviction, HTTP scope and
  limit rejection, live updates, cursor watermark and source navigation covered.
- `git diff --check`: passed. No real project state or automation was run.

### Review

**Standards:** independent reviewer reported **0 actionable findings**, including
architecture/ADR/domain updates.

**Spec:** independent reviewer identified empty-attempt navigation, retry
 direction, selection eviction, later-retry focus and verification gaps. These
were fixed and verified. A final exhausted-cursor retry edge was also fixed with
its browser regression. Final re-review: **0 remaining substantial findings**.

### Remaining limitation and investigation

One intervening full-suite rerun hit the previously documented CLI startup state
lock failure (`launch argv accepts quoted multiline text, equals syntax and blanks
without printing the guidance`). The symptom predates this ticket in issue 97;
`src/cli.ts`, the operation guard and CLI lifecycle tests/helpers have no changes
against HEAD. Five repeated isolated CLI suites passed (15 tests), and the final
full suite passed. The intermittent lock root cause was not established, so this
is retained as a known test instability, not claimed fixed or silently dismissed.
Captured failing run: [CLI lock evidence](../ticket-01-cli-lock-failure.log).
The schema snapshot newline failure mentioned in issue 97 does not recur with the
explicitly regenerated migration snapshot; fresh-schema and drift checks pass.

### Changed files

- `src/application/conversation-contract.ts`, `coordination-application.ts`,
  `runtime-contract.ts`.
- `src/application/internal/conversation-history-pages.ts`,
  `conversation-projection-module.ts`, `task-projection-store.ts`,
  `active-attempt-module.ts`, `automation-coordinator.ts`, `task-archive-store.ts`.
- `src/application/internal/migrations/0010-conversation-history-items.ts`,
  `registry.ts`, `current-schema.sql`.
- `src/runtime/codex-agent-runtime.ts`, `codex-turn-projector.ts`.
- `src/web/browser-api/conversation-routes.ts`.
- `src/web/client/AgentConversationDialog.tsx`, `ConversationHistory.tsx`,
  `api.ts`, `styles.css`, `text-selection.ts`.
- `test/application/conversation-pages.test.ts`, `conversation-attachment.test.ts`,
  `released-schema-migrations.test.ts`, `task-interruption-and-process-pause.test.ts`.
- `test/web/conversation-pages-http.test.ts`.
- `test/browser/conversation-pages.browser.spec.ts`, `browser-fixture.ts`,
  `fixture-server.ts`, `conversation-transcript.browser.spec.ts`.
- `test/support/agent-runtime-fixture.ts`.
- `docs/architecture.md`, `docs/adr/0026-page-browser-conversations-before-hydration.md`,
  `CONTEXT.md`, this ticket and verification logs linked above.

The initial accepted planning and issue 97 index content was preserved. During
implementation the index changed externally to include most ticket 01 changes;
no agent staged, unstaged, committed or pushed anything. That newer staged
snapshot remains intact, with final corrections and this completion record in an
unstaged layer. Browser GPU diagnostic additions to `debug.log` were incidental;
the externally staged diagnostic snapshot was preserved as well.

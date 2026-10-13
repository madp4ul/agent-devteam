# 02 — Page task timelines while preserving a lazy full movement map

**Type:** task
**Status:** resolved
**Blocked by:** None — can start immediately.
**Specification:** [Heavy usage](../spec.md), especially timeline/map and verification.

## What to build

Display a task with current controls, all current pins, and its newest 50 timeline
records. Load older records as needed. Fetch the complete movement map through
its own compact query only when it is about to be shown, and retain navigation
through movements whose timeline content has not been loaded.

## Acceptance criteria

- [x] Initial task detail and routine polling no longer materialize/return complete
      comments, activity, activations, historical reference lists, or map data.
      Current controls, attention, relationships, pins, and total costs stay correct.
- [x] Authoritative indexed page queries preserve existing top-level timeline
      grouping and provenance. Bound nested attempt disclosure too; one large
      attempt cannot turn a 50-record page into a complete-history payload.
- [x] Stable cursor/watermark and latest-refresh behavior avoids gaps/duplicates
      with equal timestamps, new comments, running attempt settlement, and resumes.
- [x] Scrolling toward older history loads pages with stable viewport/selection.
      The rendered/cache window is bounded, initially targeting three pages.
- [x] A dedicated movement-map query reads only compact movement/navigation
      metadata and includes every movement, independently of loaded timeline pages.
      It uses historical labels and durable containing-record/source identities.
- [x] Map loading begins lazily near visibility; hidden/unavailable map layouts
      do not trigger eager full-map loading. Task use does not wait for the map.
      Map loading/error/retry and compact live refresh are independently handled.
- [x] Click, keyboard navigation, and drag/scrub can reach an unloaded movement
      through a direct bounded target-window query. No sequential fetching of all
      intervening pages is required. Coalesced scrub requests and stale-response
      handling leave the latest selected target authoritative.
- [x] Map viewport indication uses logical history position and available anchors;
      it retains the full journey when DOM records are absent and aligns accurately
      after the target is loaded. Window eviction cannot remove map destinations.
- [x] Pins, attention/source links, conversation comment-source navigation, and
      archived task navigation load original positions directly. Preserve actions,
      disclosures, relationship labels, and existing grouping/order.
- [x] Large-history application/HTTP/browser tests prove bounded initial reads and
      payload/render counts, lazy compact map loading, and navigation to the oldest
      unloaded movement. Include concurrent updates, request failure/races, both
      themes, keyboard use, and existing movement/scroll/pin/attention regressions.
- [x] Relevant checks, typechecks/build pass; update architecture/domain facts and
      durable paging/map decisions during implementation. Leave changes unstaged.

## Comments

The existing map derives scroll geometry from loaded timeline DOM elements. Its
navigation model must accommodate unloaded records, not just receive fewer props.
Pagination alone must not hide old movement points or pin targets.


## Completion — 2026-10-13

Implemented and independently reviewed against the **starting working-tree
baseline**, excluding accepted ticket 01 and issue 97 work. Changes remain an
unstaged layer. No staging, unstaging, commits, pushes or real project state runs
were performed. The framework remains paused.

### Implemented contracts

- Released migration **0011** indexes newest-first top-level timeline groups,
  nested source identities and compact movement metadata. Application selection
  precedes source hydration; default 50/max 150 groups, 50 nested records per
  attempt disclosure. Provisional claims are excluded/cleaned up. Existing
  authored evidence is backfilled without rewriting it.
- Signed task-scoped watermark cursors, independent nested cursors, direct
  source/containing-group windows, and bounded latest/historical refresh.
  Current pins, unfinished controls, attention, relationships and cost totals
  remain independent of unloaded history.
- The movement map loads only when its desktop layout reveals it; unavailable
  layouts make no request. It retains every destination, historical labels
  where evidenced, durable source/group identities and compact sequence deltas.
  Initial/delta reads serialize and deduplicate. New movements snapshot labels;
  older evidence without labels uses durable IDs honestly.
- Browser windows retain/render at most 150 top-level records with logical
  spacers and real viewport/selection anchors; nested disclosure stays bounded.
  Click, keyboard Home/End/arrows and coalesced scrub navigate unloaded sources
  directly. Both pending-source and overlapping-refresh generations reject
  stale responses, including selection of an already loaded destination.
- Retained pages merge/prune relationship and agent-inspectable metadata.
  Pins and pin/unpin activity navigate old original positions, current pin
  membership drives controls, and the existing two-second unpin undo/focus
  interval survives paging. Attention and conversation comment sources share
  direct navigation. Archived history remains readable.
- Markdown renderer component identities now remain stable during independent
  timeline refreshes, preserving conversation text selection. Browser mock
  scenarios update their timeline/map transport coherently.
- Architecture/glossary updated; durable contracts in
  [ADR 0027](../../../docs/adr/0027-page-task-timelines-and-load-the-movement-map-independently.md).

### Verification

- `pnpm typecheck`: **passed** (host and browser TypeScript).
- `pnpm build`: **passed**. Vite retains its non-failing bundle-size advisory.
- Full Node suite: **399 tests, 393 passed, 0 failed, 6 platform skips**
  ([log](../ticket-02-tests.log)).
- Broad browser batch: **129 passed**
  ([log](../ticket-02-browser-tests.log)); includes movement/scroll, task content,
  attention, composer/docking, relationships, conversations, attachments,
  lifecycle, transcripts and cost regressions.
- Final focused browser batch after the last source-button correction:
  **14 passed** ([log](../ticket-02-final-focused-browser-tests.log)). Includes
  10,000 records, a single attempt with 10,000 movements, direct oldest navigation,
  loaded-target and refresh races, coalescing, nested/root disclosure metadata,
  retry, unavailable layouts, keyboard, selection, pins and both themes/SVG
  center alignment.
- Migration suite: **29 passed**
  ([log](../ticket-02-migration-tests.log)), including 0011 upgrade from released
  0010 with 10,000 legacy movements and unchanged original details/transcripts.
- Large-history application/HTTP coverage seeds 10,000 comments, movements and
  settled activations. Initial payload: **25,919 bytes at 100 comments versus
  26,841 bytes at 10,000**; final parallel-suite timings **31.26 ms / 25.80 ms**.
  Hydration selects 50 comments plus one independently current pin, or 50 nested
  sources in a large attempt, without browser transcript reads. Indexed query
  plans use `task_timeline_position` and direct `task_timeline_record_source`
  access without a full timeline scan or temporary sort. Timings are diagnostic,
  not machine-specific assertions.
- `git diff --check`: **passed**. Starting and final staged patch SHA-256 both
  **1CEA3B9E9FE690EF72F34FB40869F62C4ADF463281EFD957C0AD6F82946B1C12**.

### Independent review

**Standards:** final independent review: **0 actionable findings**. Named read
modes replaced positional policy booleans. Map serialization/deduplication,
refresh generations, pin membership, bounded undo, stable Markdown renderers and
scrub timer cancellation were checked.

**Spec:** final independent review: **0 remaining substantial findings**. Fixed
findings for nested movement scrubbing/geometry, loaded-target cancellation,
merged disclosure/relationship metadata, and old pin/unpin source actions.

### Regression investigation and practical bounds

New failures were investigated, not dismissed as baseline: migration/route
inventories, provisional attempt cleanup, malformed unrelated fixture evidence,
historical relationship ordering, pin undo/focus, legacy scenario payloads,
scroll anchoring and a conversation selection loss were corrected. Selection
instrumentation showed successful restoration followed by paragraph remounting;
stable Markdown renderer functions fix that mechanism. Captured intermediate
browser failures: [broad regressions](../ticket-02-browser-regressions.log) and
[selection regression](../ticket-02-selection-regression.log). Final checks above
pass; the prior CLI state-lock flake did not occur in the final full Node run.

Complete map metadata is inherently linear in movements; current pin/control
sets scale with actual current work. Logical counts and authoritative cost
aggregates still inspect compact identities/usage evidence, independently of
bounded body hydration and response counts. Spacers estimate unloaded height;
real source anchors determine alignment after hydration.

Ticket-specific [review diff](../ticket-02-review.patch) and
[changed-file inventory](../ticket-02-changed-files.txt) preserve the review scope.
Ticket 03 starts sequentially after this verified completion in the same shared
checkout. The user has taken over this chat and ended parent-chat reporting.

### Follow-up after user testing

[Ticket 04](04-retain-loaded-timeline-and-fix-scroll-navigation.md) supersedes
the browser eviction and estimated-spacer behavior described above. Requested
history now remains loaded, skipped ranges use explicit compact load controls,
and map alignment follows live rendered geometry while yielding to manual input.
Server request bounds and independent complete map loading remain in place.
See ADR 0029 and ticket 04 for the revised contract and verification results.

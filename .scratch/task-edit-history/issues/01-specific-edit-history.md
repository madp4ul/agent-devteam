# 01 — Describe actual task edits in history

**Status:** resolved

**Blocked by:** None.

**What to build:** Task Edited timeline entries identify each field actually
changed: title, description, starting ref, or any combination. Show old/new title
and ref values. Keep description text out of these compact entries.

- [x] Record changed fields and title/ref before/after values atomically with edits.
- [x] Omitted or supplied-but-unchanged fields are not described as changed.
- [x] Preserve revision, idempotency and existing edit provenance behavior.
- [x] Show compact description-change labels without old/new description bodies.
- [x] Render historical events honestly when field-specific evidence is absent.
- [x] Verify public application history and browser rendering, including themes.
- [x] Leave live host, database, worktrees and dist/web assets unchanged.

## Decisions

No migration or historical backfill: new metadata uses the existing activity
details. Historical starting-ref evidence remains usable; unknown legacy edits
say only that task details were updated. Explicit no-op edits retain existing
revision/event semantics but do not claim fields changed. Test builds use a
separate output directory and isolated fixture host.

The user authorizes implementation only if active framework execution remains
unaffected. Source-only changes are safe: the running host retains its loaded
modules; browser verification will serve a separate test asset directory.

## Testing seams

Existing public CoordinationApplication edit/history queries, and browser task
timeline rendering against disposable fixture state. No live project requests.

## Answer

New activity records carry changedFields and title/ref before/after values.
The command uses the applied process default as the old ref when no explicit
override existed. Description bodies are not copied. Timeline entries name all
actual changed fields, show compact title/ref differences, and use neutral text
for historical records without field evidence. Existing supplied-but-unchanged
edit revision/event semantics remain intact without falsely naming changes.

Application tests first failed on missing metadata, then passed. The browser
test first failed on the old generic summary, then passed for all seven field
combinations, historical fallback and no-op entries, in both themes at desktop
and mobile widths. Existing grouped timeline filtering also passed.

Validation: pnpm typecheck passed; full suite 437 passed, 6 skipped, 0 failed;
two focused browser tests passed; isolated Vite build passed; diff check clean.
Independent Standards and Spec reviews both found no issues.

No migration, backfill, live database access, host restart, or worktree change.
The test build wrote only this effort's ignored browser-assets directory, served
by an isolated fixture host through COORDINATION_BROWSER_TEST_ASSET_DIRECTORY.
dist/web retained index-CIrZ00KV.js and index-C8a2Qhfc.css throughout.
The feature remains source-only until a future intentional rebuild/restart.
All edits remain unstaged; unrelated concurrent work was preserved.

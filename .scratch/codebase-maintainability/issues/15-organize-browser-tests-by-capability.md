# 15 — Organize browser tests by capability

**What to build:** Divide the large browser suites into focused board, task, conversation, automation, archival, accessibility, and appearance behavior suites with reusable domain-oriented fixtures.

**Blocked by:** 03 — Shared accessible modal lifecycle; 04 — Shared refresh and polling lifecycle; 13 — Migrate adapter contracts.

**Status:** resolved

- [x] Each browser behavior has one obvious suite.
- [x] Shared fixtures describe domain setup rather than private storage operations.
- [x] No meaningful browser coverage is deleted or weakened.
- [x] Test order does not affect results.
- [x] The complete browser suite passes in both required appearance contexts.

## Answer

Reorganized all 77 Playwright behaviors into focused accessibility, appearance,
archival, automation, board, conversation, task, and end-to-end workflow suites.
The shared browser fixture now starts a fresh domain scenario for every test and
provides named conversation and workspace-state builders, so mutable server and
SQLite state cannot leak between cases. Existing browser assertions remain at
the rendered browser and HTTP seams; no product behavior or authority changed.

Verified with `pnpm typecheck`, `pnpm test` (197 passed, 2 skipped),
`pnpm test:browser` (77 passed, including both appearance contexts), and
`pnpm build`.

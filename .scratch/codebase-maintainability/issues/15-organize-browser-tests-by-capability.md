# 15 — Organize browser tests by capability

**What to build:** Divide the large browser suites into focused board, task, conversation, automation, archival, accessibility, and appearance behavior suites with reusable domain-oriented fixtures.

**Blocked by:** 03 — Shared accessible modal lifecycle; 04 — Shared refresh and polling lifecycle; 13 — Migrate adapter contracts.

**Status:** ready-for-agent

- [ ] Each browser behavior has one obvious suite.
- [ ] Shared fixtures describe domain setup rather than private storage operations.
- [ ] No meaningful browser coverage is deleted or weakened.
- [ ] Test order does not affect results.
- [ ] The complete browser suite passes in both required appearance contexts.

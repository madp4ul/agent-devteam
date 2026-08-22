# 04 — Organize task browser tests by sub-capability

**What to build:** Give task timeline, comment composition, workspace, relationship, and attention behavior separate browser test homes so future task-page changes can find and run their relevant rendered coverage without loading unrelated scenarios.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Task authored-content and timeline behavior has one obvious rendered-browser suite.
- [x] Sticky comment composition, mention discovery, reply preparation, textarea sizing, submission, failure recovery, focus, and viewport preservation have one obvious suite.
- [x] Workspace inspection and live Git-state refresh behavior have one obvious suite.
- [x] Relationship discovery, mutation, historical references, and related-task navigation have one obvious suite.
- [x] Attention location, resolution, and task navigation behavior have one obvious suite or a clearly documented existing owner.
- [x] Cross-capability end-to-end scenarios remain intact where splitting would weaken their value.
- [x] Shared fixtures describe task scenarios in domain language and test order does not affect results.
- [x] No product implementation is changed merely to facilitate file splitting, and no meaningful assertion is deleted or weakened.
- [x] Typechecking, the complete browser suite in both appearances, the full non-browser suite, and the production build pass.

## Answer

Split the 27 rendered task tests into focused authored-content/timeline, comment-composition, workspace, relationship, and attention suites, with an independent package command for each. Preserved the cross-capability task-detail scenario and every existing assertion, including ticket 03's synchronization coverage, without changing product code.

Verified all five focused suites, typechecking, the 218-pass/3-skip non-browser suite, the complete 100-test browser suite with both-appearance coverage, the production build, and diff hygiene. The final two-axis review found zero Standards findings and zero Spec findings.

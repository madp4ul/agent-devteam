# 04 — Organize task browser tests by sub-capability

**What to build:** Give task timeline, comment composition, workspace, relationship, and attention behavior separate browser test homes so future task-page changes can find and run their relevant rendered coverage without loading unrelated scenarios.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [ ] Task authored-content and timeline behavior has one obvious rendered-browser suite.
- [ ] Sticky comment composition, mention discovery, reply preparation, textarea sizing, submission, failure recovery, focus, and viewport preservation have one obvious suite.
- [ ] Workspace inspection and live Git-state refresh behavior have one obvious suite.
- [ ] Relationship discovery, mutation, historical references, and related-task navigation have one obvious suite.
- [ ] Attention location, resolution, and task navigation behavior have one obvious suite or a clearly documented existing owner.
- [ ] Cross-capability end-to-end scenarios remain intact where splitting would weaken their value.
- [ ] Shared fixtures describe task scenarios in domain language and test order does not affect results.
- [ ] No product implementation is changed merely to facilitate file splitting, and no meaningful assertion is deleted or weakened.
- [ ] Typechecking, the complete browser suite in both appearances, the full non-browser suite, and the production build pass.


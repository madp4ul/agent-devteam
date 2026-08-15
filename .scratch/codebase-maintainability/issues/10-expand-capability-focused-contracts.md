# 10 — Expand capability-focused contracts

**What to build:** Add capability-focused task, conversation, automation, process, notification, runtime, and browser transport contracts beside the existing compatibility interface.

**Blocked by:** 01 — Complete user board projection; 02 — Complete user task-detail projection; 09 — Conversation command module.

**Status:** ready-for-agent

- [ ] Capability contracts group the facts a caller must understand for one area.
- [ ] Existing imports continue to compile through compatibility exports.
- [ ] No runtime behavior or serialized response shape changes.
- [ ] The expansion creates no circular dependencies.
- [ ] Typechecking and all tests remain green before any caller migration.


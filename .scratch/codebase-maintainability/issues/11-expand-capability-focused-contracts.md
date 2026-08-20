# 11 — Expand capability-focused contracts

**What to build:** Add capability-focused task, conversation, automation, process, notification, runtime, and browser transport contracts beside the existing compatibility interface.

**Blocked by:** 01 — Complete user board projection; 02 — Complete user task-detail projection; 10 — Conversation command module.

**Status:** resolved

- [x] Capability contracts group the facts a caller must understand for one area.
- [x] Existing imports continue to compile through compatibility exports.
- [x] No runtime behavior or serialized response shape changes.
- [x] The expansion creates no circular dependencies.
- [x] Typechecking and all tests remain green before any caller migration.

## Answer

Added explicit task, conversation, automation, process, notification, runtime,
and browser-transport contract modules as the expand step before caller
migration. The modules are type-only re-exports from the current coordination
contract, preserving every existing import and serialized shape while giving
issues 12 and 13 capability-focused interfaces to adopt. ADR 0013 records that
the broad compatibility interface is a bounded migration scaffold whose removal
is required by issue 14, not an acceptable steady-state compatibility layer.

Verification passed with typechecking, the production build, 199 non-browser
tests (197 passed, 2 intentional skips), and all 77 browser tests. The required
two-axis review finished with no Standards findings; the Spec review's missing
collaborator query export and misplaced composition options were corrected and
the reviewer confirmed both findings resolved.

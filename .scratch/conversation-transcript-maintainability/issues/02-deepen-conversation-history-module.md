# 02 — Deepen conversation history module

**What to build:** Put chronological conversation history and run evidence behind one focused browser module so transcript display changes remain local while dialog loading, polling, continuation, retirement, and focus behavior stay unchanged.

**Blocked by:** 01 — Complete coordination transcript projection.

**Status:** resolved

- [x] One conversation-history module owns chronological ordering of authored messages, runs, pending follow-ups, retirement, and replacement context.
- [x] The module owns run boundaries, transcript item rendering, runtime and token metrics, unavailable evidence, thread-replacement notices, and durable-effect navigation.
- [x] Its interface accepts assembled conversation data, selected context, and only the narrow callbacks required for navigation.
- [x] The dialog shell remains the owner of remote loading, refresh sequencing, polling policy, continuation submission, retirement submission, modal lifecycle, and dialog-level focus.
- [x] No second conversation state owner, duplicate refresh lifecycle, or speculative interface is introduced.
- [x] Existing live-row replacement, reader-position preservation, selected-message and selected-attempt positioning, comment-history navigation, and task links remain unchanged.
- [x] Continuation, retirement, action-menu, keyboard, focus-trap, Escape, and focus-restoration behavior remain green through rendered-browser coverage.
- [x] The resulting modules are organized by cohesive behavior rather than an arbitrary line-count limit.
- [x] Typechecking, focused browser tests, the full non-browser and browser suites, and the production build pass.

## Answer

Extracted one deep `ConversationHistory` browser module that owns chronological history, selected context, run evidence and metrics, transcript presentation, replacement and retirement markers, and durable-effect navigation behind an assembled-conversation interface. The dialog shell retains loading, refresh and polling, continuation and retirement mutations, modal lifecycle, action menus, scroll preservation, and dialog focus.

Verified with typechecking, 38 focused conversation/appearance browser tests, the full 220-test non-browser suite (217 passed, 3 expected skips), the production build, and the complete 99-test browser suite. The two-axis review is clean with zero Standards findings and zero Spec findings.

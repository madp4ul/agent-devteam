# 02 — Deepen conversation history module

**What to build:** Put chronological conversation history and run evidence behind one focused browser module so transcript display changes remain local while dialog loading, polling, continuation, retirement, and focus behavior stay unchanged.

**Blocked by:** 01 — Complete coordination transcript projection.

**Status:** ready-for-agent

- [ ] One conversation-history module owns chronological ordering of authored messages, runs, pending follow-ups, retirement, and replacement context.
- [ ] The module owns run boundaries, transcript item rendering, runtime and token metrics, unavailable evidence, thread-replacement notices, and durable-effect navigation.
- [ ] Its interface accepts assembled conversation data, selected context, and only the narrow callbacks required for navigation.
- [ ] The dialog shell remains the owner of remote loading, refresh sequencing, polling policy, continuation submission, retirement submission, modal lifecycle, and dialog-level focus.
- [ ] No second conversation state owner, duplicate refresh lifecycle, or speculative interface is introduced.
- [ ] Existing live-row replacement, reader-position preservation, selected-message and selected-attempt positioning, comment-history navigation, and task links remain unchanged.
- [ ] Continuation, retirement, action-menu, keyboard, focus-trap, Escape, and focus-restoration behavior remain green through rendered-browser coverage.
- [ ] The resulting modules are organized by cohesive behavior rather than an arbitrary line-count limit.
- [ ] Typechecking, focused browser tests, the full non-browser and browser suites, and the production build pass.


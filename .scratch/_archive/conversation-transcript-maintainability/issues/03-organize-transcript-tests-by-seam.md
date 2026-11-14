# 03 — Organize transcript tests by seam

**What to build:** Give runtime normalization, rendered transcript presentation, and conversation lifecycle separate, obvious test homes while preserving the complete existing behavior and confidence of the transcript feature.

**Blocked by:** 01 — Complete coordination transcript projection; 02 — Deepen conversation history module.

**Status:** resolved

- [x] Exhaustive known-coordination normalization cases live with a focused projection seam and use domain-oriented event and result fixtures.
- [x] Representative raw Codex event streams still cross the complete runtime seam and verify live progression, stable identity, retained evidence, and attempt isolation.
- [x] Rendered transcript presentation has a focused browser suite covering known coordination activity, generic MCP disclosure, commands, messages, diagnostics, metrics, links, containment, and both appearances.
- [x] Conversation dialog lifecycle has a separate browser suite covering loading, polling, reader position, selection, continuation, retirement, menus, and accessibility.
- [x] Shared fixtures describe Codex events, transcript evidence, conversations, and task scenarios without exposing incidental implementation structure.
- [x] Every meaningful assertion from the existing suites remains represented and no behavior is tested twice without a distinct seam-level purpose.
- [x] Test order does not affect results, and focused commands make each sub-capability independently verifiable.
- [x] Typechecking, the complete non-browser and browser suites, the production build, and diff hygiene pass.

## Answer

Separated exhaustive coordination projection coverage, representative Codex runtime adaptation, rendered transcript presentation, and conversation lifecycle into independently runnable test homes. Added domain-oriented coordination and conversation evidence fixtures, moved both-appearance transcript coverage beside rendered presentation, and added explicit lifecycle loading coverage while preserving the prior behavioral assertions.

Verified with typechecking, both focused runtime suites, 13 focused transcript browser tests, 14 focused lifecycle browser tests, the full 221-test non-browser suite (218 passed, 3 expected skips), the production build, and the complete 100-test browser suite. The final two-axis review is clean with zero Standards findings and zero Spec findings.

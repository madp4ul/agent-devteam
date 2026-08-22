# 03 — Organize transcript tests by seam

**What to build:** Give runtime normalization, rendered transcript presentation, and conversation lifecycle separate, obvious test homes while preserving the complete existing behavior and confidence of the transcript feature.

**Blocked by:** 01 — Complete coordination transcript projection; 02 — Deepen conversation history module.

**Status:** ready-for-agent

- [ ] Exhaustive known-coordination normalization cases live with a focused projection seam and use domain-oriented event and result fixtures.
- [ ] Representative raw Codex event streams still cross the complete runtime seam and verify live progression, stable identity, retained evidence, and attempt isolation.
- [ ] Rendered transcript presentation has a focused browser suite covering known coordination activity, generic MCP disclosure, commands, messages, diagnostics, metrics, links, containment, and both appearances.
- [ ] Conversation dialog lifecycle has a separate browser suite covering loading, polling, reader position, selection, continuation, retirement, menus, and accessibility.
- [ ] Shared fixtures describe Codex events, transcript evidence, conversations, and task scenarios without exposing incidental implementation structure.
- [ ] Every meaningful assertion from the existing suites remains represented and no behavior is tested twice without a distinct seam-level purpose.
- [ ] Test order does not affect results, and focused commands make each sub-capability independently verifiable.
- [ ] Typechecking, the complete non-browser and browser suites, the production build, and diff hygiene pass.


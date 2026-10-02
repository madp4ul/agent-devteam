# 06 — Verify assembled cooperation and reconcile public contracts

**Type:** task
**Status:** resolved
**Blocked by:** [01](01-cross-task-comments-and-participant-discovery.md), [02](02-generalize-task-and-relationship-commands.md), [03](03-curate-pinned-comments-in-tools-and-browser.md), [04](04-read-unified-history-with-stable-word-target-cursors.md), [05](05-compose-bounded-activation-updates-and-net-pin-changes.md).
**Specification:** [spec.md](../spec.md), complete contract and acceptance examples.

## Acceptance

- [x] Assembled MCP catalog has exactly the twenty specified tools with required
  selectors/narrow schemas and accurate effects. No current-only aliases, server
  instruction claims, renamed-report gaps, or stale transcript recognizers remain.
- [x] Replay all fifteen review scenarios, including long-lived task/new conversation,
  interrupted response retry, busy recipient consultation/reply, large updates,
  boundary continuation, pins, replacement, and no-lock revision races.
- [x] Verify no accidental agent API route grants direct execution/archive/global
  control. Preserve project authorization, user-only recovery, issue 15 scheduling,
  migration prefixes/snapshot checks, and unrelated-history projection isolation.
- [x] Browser coverage exercises pins, external author/task labels, original timeline
  navigation/filtering/anchors, accessible controls, and both themes.
- [x] Publish actual descriptions/arguments/result shapes in docs/agent-mcp-reference.md;
  reconcile architecture, ADRs, glossary, and process-facing references against the
  implemented state. Do not paste the full MCP catalog into every activation.
- [x] Run appropriate application/HTTP/MCP/runtime/browser checks and repository
  typecheck/build. Apply code review, address findings, and leave changes unstaged.
- [x] Mark delivery tickets according to actual outcomes and update map. Unblock
  intake 12 only after delivered guidance and assembled verification exist; keep
  intake 21 and attachment intake06 separate.

Hand off evidence and remaining risks for user review. Design resolution alone
does not satisfy this ticket; no staging, commit, or push is authorized.

## Delivery

All twenty tools and fifteen agreed scenarios are verified; see
[verification.md](../verification.md). The final reference includes verbatim
registered descriptions and implemented arguments/result shapes. Architecture,
ADR0021 and glossary reflect delivered ownership and context mechanics.

Non-browser suite: 353 passed/4 skipped. Typecheck/build pass. Browser full run:
169 passed and one responsive-layout timing failure; the repaired test then
passed ten consecutive runs. All 170 browser cases have passing evidence.
Earlier local-author fixtures were corrected without weakening unknown/external
origin safeguards. Standards and Spec reviews have no outstanding findings.

Intake 12 is unblocked for interactive user review. Intake 21 and attachment
intake06 remain separate. Changes are unstaged; no commit or push was performed.
The existing large-bundle build warning remains non-blocking.

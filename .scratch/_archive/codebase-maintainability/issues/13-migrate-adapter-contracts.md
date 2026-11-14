# 13 — Migrate adapter contracts

**What to build:** Move browser, host, and MCP adapters onto their shared transport and capability contracts without changing their externally visible interfaces.

**Blocked by:** 11 — Expand capability-focused contracts.

**Status:** resolved

- [x] Browser and host use the same user-facing transport definitions.
- [x] MCP depends only on agent-facing coordination capabilities.
- [x] Adapter status mapping, error behavior, and payloads remain unchanged.
- [x] No compatibility export is removed in this ticket.
- [x] Typechecking and adapter tests pass.

## Answer

Migrated browser payload imports to the shared browser transport contract and
defined the browser request shapes there so client serialization and host
decoding cannot drift independently. The host now consumes browser-visible
payloads through that same contract, while its browser and agent route handlers
accept separate structural capability sets. The MCP-facing handler therefore
depends only on the coordination methods its tools use. The concrete
`CoordinationApplication`, SQLite authority, route behavior, status mapping,
errors, payloads, and all temporary compatibility exports remain unchanged.

Verification passed with typechecking, 13 focused adapter and MCP tests, the
full 199-test non-browser suite (197 passed, 2 intentional skips), all 77 browser
tests, the production build, and `git diff --check`. The required two-axis review
finished with no Standards findings. Its two initial Spec findings—anonymous
browser request bodies and one host payload import bypassing the shared
contract—were corrected, and the reviewer confirmed no findings remain.

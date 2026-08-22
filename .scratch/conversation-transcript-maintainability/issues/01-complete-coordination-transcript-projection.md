# 01 — Complete coordination transcript projection

**What to build:** Give every known coordination-tool transcript entry one complete typed semantic projection so its compact running, accepted, rejected, or failed presentation works end to end without browser decoding of raw Codex or MCP result shapes.

**Blocked by:** None — can start immediately.

**Status:** resolved

- [x] Known coordination calls are normalized once into a complete typed transcript entry containing their semantic status, domain facts, diagnostic facts, and separately retained raw evidence.
- [x] Requested arguments supply honest running-state facts and authoritative results replace them when available.
- [x] Domain rejection remains distinct from transport success, and technical failure remains distinct from rejection.
- [x] The browser renders every known inspection and action from typed semantic facts without parsing raw arguments, results, or MCP content envelopes.
- [x] Generic MCP calls retain their literal evidence disclosure and do not acquire coordination-specific behavior.
- [x] Stable item identity continues to replace a running row with terminal evidence in place.
- [x] Comments, moves, child tasks, dependencies, permission blocks, task links, history navigation, and inspection scopes preserve their current rendered behavior.
- [x] Representative event streams pass through the complete runtime seam, with focused projection coverage for partial, malformed, running, accepted, rejected, and failed evidence.
- [x] Typechecking, focused runtime and browser tests, the full non-browser suite, and the production build pass.

## Answer

Implemented one distinct typed coordination transcript item with semantic presentation, status, diagnostic facts, and nested raw evidence. The runtime now projects each known tool once, requires authoritative acceptance for mutations, and keeps generic MCP calls literal; the browser consumes only typed coordination facts while preserving existing presentation and stable live-row replacement.

Verified with typechecking, focused runtime/MCP/browser coverage, the full 220-test non-browser suite (217 passed, 3 expected skips), the production build, and the complete 99-test browser suite. The two-axis review is clean after resolving its acceptance-status and locality findings.

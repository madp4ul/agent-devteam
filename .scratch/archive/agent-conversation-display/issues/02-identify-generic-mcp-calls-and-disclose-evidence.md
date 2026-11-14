# 02 — Identify generic MCP calls and disclose their evidence

**What to build:** Make every MCP call in an agent run identifiable and
inspectable without letting arbitrary arguments or results dominate the
conversation. The compact row presents the actual humanized server and tool
identity with its semantic transport status; one disclosure retains the exact
identifiers, structured arguments, result, and failure evidence in a bounded
literal presentation.

**Blocked by:** 01 — Compact Markdown messages and command activity

**Status:** resolved

- [x] A generic MCP row is titled with the specific humanized server and tool names in `Server · Tool` form rather than `mcp_tool_call`.
- [x] The exact raw server and tool identifiers remain available inside the disclosed details.
- [x] Unknown MCP calls show no invented or repetitive body while collapsed.
- [x] One disclosure reveals the exact arguments and returned result in a structured literal form.
- [x] Missing arguments or results do not produce empty, duplicate, or misleading sections.
- [x] Large arguments, results, diagnostics, paths, and unbroken identifiers remain bounded and cannot widen the dialog or page.
- [x] Raw MCP evidence remains literal and is never interpreted as Markdown.
- [x] Running, successful, and failed transport states use the shared status position without appending redundant `completed`, `succeeded`, or similar prose.
- [x] A technical MCP failure exposes its diagnostic and does not use a success marker.
- [x] A live MCP call updates one stable row from running to its final state without duplicating the call.
- [x] Polling preserves an open MCP disclosure and the user's reading position.
- [x] Runtime-adapter coverage verifies retention and live replacement of MCP server, tool, arguments, result, error, raw status, and stable item identity.
- [x] Browser coverage verifies titles, disclosure content, failure presentation, accessibility, containment, live refresh behavior, and dark/light appearance.
- [x] Generic MCP presentation introduces no server-specific argument summarization or heuristics.

## Answer

Agent-run transcripts now retain MCP calls as structured evidence with stable
identity, exact server and tool identifiers, raw status, arguments, result, and
failure data. The browser humanizes only the row title, keeps unknown calls
title-only while collapsed, and reveals all available raw evidence through one
bounded literal disclosure.

Shared status marks distinguish running, successful, rejected, and failed
outcomes without redundant success prose. Existing coordination-domain context
is retained separately from the generic presentation, including a distinct
rejected state when a completed transport returns `accepted: false`. Polling
updates one stable MCP row while preserving open disclosures and scroll position.

Typechecking and the production build pass. All 206 runnable non-browser tests
and all 85 browser tests pass; three credentialed real-Codex integration tests
remain intentionally skipped. Final Standards and Spec reviews reported no
findings.

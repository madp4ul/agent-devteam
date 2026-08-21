# 02 — Identify generic MCP calls and disclose their evidence

**What to build:** Make every MCP call in an agent run identifiable and
inspectable without letting arbitrary arguments or results dominate the
conversation. The compact row presents the actual humanized server and tool
identity with its semantic transport status; one disclosure retains the exact
identifiers, structured arguments, result, and failure evidence in a bounded
literal presentation.

**Blocked by:** 01 — Compact Markdown messages and command activity

**Status:** ready-for-agent

- [ ] A generic MCP row is titled with the specific humanized server and tool names in `Server · Tool` form rather than `mcp_tool_call`.
- [ ] The exact raw server and tool identifiers remain available inside the disclosed details.
- [ ] Unknown MCP calls show no invented or repetitive body while collapsed.
- [ ] One disclosure reveals the exact arguments and returned result in a structured literal form.
- [ ] Missing arguments or results do not produce empty, duplicate, or misleading sections.
- [ ] Large arguments, results, diagnostics, paths, and unbroken identifiers remain bounded and cannot widen the dialog or page.
- [ ] Raw MCP evidence remains literal and is never interpreted as Markdown.
- [ ] Running, successful, and failed transport states use the shared status position without appending redundant `completed`, `succeeded`, or similar prose.
- [ ] A technical MCP failure exposes its diagnostic and does not use a success marker.
- [ ] A live MCP call updates one stable row from running to its final state without duplicating the call.
- [ ] Polling preserves an open MCP disclosure and the user's reading position.
- [ ] Runtime-adapter coverage verifies retention and live replacement of MCP server, tool, arguments, result, error, raw status, and stable item identity.
- [ ] Browser coverage verifies titles, disclosure content, failure presentation, accessibility, containment, live refresh behavior, and dark/light appearance.
- [ ] Generic MCP presentation introduces no server-specific argument summarization or heuristics.


# 01 — Evaluate MCP tool usage by agent context position at call time

**Type:** research
**Status:** open
**Blocked by:** None — evidence gathering can start independently.
**Next step:** Research measurement feasibility, then grill the statistics design.

## Problem and desired outcome

The user wants evidence that coordination framework MCP tools add value: which
tools agents use, how often, and at what point in their available context.
Aggregate counts alone do not answer when a tool becomes useful.

Offer a statistics page in Settings with a histogram: X is active context length
at call time, Y is MCP call count. Each bar counts calls within a token interval,
for example 10,000–20,000 tokens. Select one framework MCP tool at a time. The tool
selector should show each tool's total call count as well as selecting its chart.

A second view selects one agent conversation and shows all coordination framework
MCP calls from that conversation in a similarly formatted chart. The intended
selection scope is conversations that are not archived; map that phrase to the
existing task-archival and conversation-retirement concepts during design.

The motivating example is the task inspection tool: does an agent call it after
context compaction to regain task context? The display should support that
investigation without claiming that low context occupancy alone proves compaction.

## Candidate completion criteria

- [ ] Establish whether trustworthy context length can be associated with each
  tool call, including calls during a turn, compaction, retries, and thread replacement.
- [ ] Define histogram boundaries and count semantics, including failed calls,
  duplicate delivery, historical data, and calls with missing measurements.
- [ ] Specify per-tool totals and histogram scope so their numbers reconcile.
- [ ] Specify the conversation selector and its all-tools chart, including whether
  tools are distinguished visually or only aggregated.
- [ ] Define how compaction evidence is exposed if available and what the chart
  can and cannot establish about the task-inspection example.
- [ ] Produce a specification and implementable follow-up tickets after decisions.

## Open questions and existing constraints

Is bin size fixed or configurable? What project/time range do totals cover? Is
collection retrospective, prospective, or both? How long should evidence survive
archival? Are retired conversations selectable while their task remains active?

[ADR 0015](../../../docs/adr/0015-adapt-codex-rollout-context-usage.md)
defines a latest completed-turn measurement. It is not automatically evidence of
occupancy at each call. Never substitute cumulative billed tokens or the latest
conversation meter for historical call-time measurements without establishing
that relationship. Unknown measurements must remain distinguishable from zero.

## Comments

- 2026-09-20: User-described GitHub issue; source URL not supplied.

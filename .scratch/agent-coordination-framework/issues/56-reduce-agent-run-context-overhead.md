# 56 — Reduce Agent-Run Context Overhead

**What to build:** Remove obvious avoidable payload from agent coordination
calls and document the complete MCP surface concisely, without turning this
ticket into a broad measurement or prompt-optimization project.

**Blocked by:** None

**Status:** resolved

- [x] Successful agent comment, move, child-task, dependency, and permission-
  block calls return compact acknowledgements instead of full task projections.
- [x] Keep full task inspection explicit and leave browser/application command
  contracts, rejection detail, persistence, and idempotency unchanged.
- [x] Add a concise reference covering every available agent MCP tool, its
  inputs, behavior, successful result, and shared record shapes.
- [x] Add MCP contract coverage for the compact results and ensure the reference
  tool list stays synchronized with the server's advertised tools.
- [x] Do not add telemetry, cost calculation, lossy history composition, or a
  broader runtime-context rewrite as part of this ticket.

## Context

Investigation of live issue-53 data found that the surprising totals were real
cumulative SDK usage across repeated model calls, not an arithmetic or
persistence defect. Five short task attempts reported between 108,353 and
443,340 input tokens. The 443,340-token attempt made 13 model calls; 399,104
input tokens were cached and 44,236 were uncached.

Every inspected attempt performed the same broad tool-discovery call, whose
result was about 41,000 characters. Coordination mutations then returned full
task projections of roughly 15,000–46,000 characters. Those results became
part of subsequent model inputs. Fixed visible startup material also included
roughly 17,000 characters of runtime instructions, 4,000 characters of project
context, and 12,000 characters of activation composition before hidden tool
schemas were counted.

The investigation established several possible seams. User follow-up narrowed
this ticket to the obvious agent-tool response waste and a complete compact MCP
reference; detailed measurement and speculative context tuning are not needed.

## Comments

- This ticket changes context generation and tool response contracts. It does
  not change how issue 53 reports the usage Codex actually emitted.
- Cached input is a subset of input usage and may be cheaper under a particular
  API model price, but it still represents repeated model context and should
  remain measurable.
- The agent adapter is the compaction boundary. Rich application mutation
  results remain available to existing user-facing callers, and rejected moves
  retain current task state for conflict recovery.

## Answer

Successful current-task mutations now return only what an agent needs to
continue: comment identity and revision, move revision and transition, compact
child identity, the created dependency relationship, or permission-block
confirmation. Full task projections remain available through
`inspect_current_task` and `inspect_task`, but are no longer repeated after
each successful mutation.

`docs/agent-mcp-reference.md` documents all thirteen MCP tools in one compact
table plus the shared returned-record shapes and rejection conventions. MCP
tests assert the exact compact acknowledgements, idempotent replay, preserved
responsibility-claim behavior, and equality between the documented and
advertised tool lists. Typechecking, the production build, and all 143 runnable
tests pass; the two credentialed real-Codex tests remain intentionally skipped.

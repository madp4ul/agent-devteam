# 03 — Reject combined task and resource wait cycles

**What to build:** Claim requests and task relationship additions reject circular
waiting across dependencies, child tasks, resource holders and FIFO predecessors.
**Blocked by:** 02 — Durable claims, waiting and automatic handoff.
**Status:** done
**Spec:** [Shared resources](../spec.md)

- [x] Shared authoritative cycle checks preserve retained relationship cycle guarantees.
- [x] Detect resource-only cycles and mixed dependency/child/resource cycles, including earlier waiters.
- [x] Check both claim and relationship insertion; no side effects on rejection.
- [x] Errors identify blocking chain and advise coordination/release/removal before retrying.
- [x] No special waiting/recovery state for rejected claims; integration coverage proves behavior.
- [x] Run focused tests/typecheck; architecture/domain/API docs accurately describe final behavior.

## Implementation notes

The shared transaction-local graph retains every task relationship and adds each
active resource claimant's immediate FIFO predecessor. Both insertion paths
reject a closing edge before any activity, claim or activation is written.
Diagnostics identify the proposed edge and retained path, including resource IDs
and relationship IDs, and advise participant coordination before retrying.

Validated application cycle/relationship coverage, authenticated HTTP and MCP
resource tests, project MCP integration, typecheck, and the real browser cycle
diagnostic flow. Full suite and final two-axis review belong to the parent
delivery pass. Changes remain unstaged.

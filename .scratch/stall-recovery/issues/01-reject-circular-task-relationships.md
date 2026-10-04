# 01 — Reject circular task relationships

**Type:** task
**Status:** resolved
**Blocked by:** None.

Source: [intake 27](../../framework-improvements-2026-09/issues/27-recover-stalled-work-without-user-attention.md).
Read [spec.md](../spec.md), especially cycle prevention, and ADR 0019.

## Deliver

Reject A -> B if B can reach A through any retained dependency/parent-child edge,
including satisfied edges and cross-board paths. Validate in the authoritative
transaction and expose a structured understandable error through browser/MCP.
Full cycle diagnostics are optional. Inspect `TaskCommandStore` and every insertion
path, including child creation. Preserve self/duplicate checks, exact replays,
caller scope, and all-or-nothing mutation. Do not automatically repair legacy graphs.

## Acceptance and verification

- [x] Reject reverse, longer, mixed-type, cross-board, and completed-target cycles.
- [x] Accept acyclic branching/shared-target and unrelated relationships.
- [x] Reject without partial tasks, relationships, activity, or activations.
- [x] Browser/HTTP and agent/MCP report the cycle reason clearly.
- [x] Meaningful application/adapter coverage passes; update relevant references
  and architecture/glossary contracts with implemented facts.
- [x] Follow normal review workflow and leave changes unstaged.

## Answer

Implemented transactional combined-graph reachability validation with structured
`circular-relationship` rejection and explicit browser feedback. New-child insertion
cannot close a cycle because the freshly generated child has no outgoing edges.
Application relationship suite: 18 passed; focused cross-board regression and
browser/HTTP rejection passed; typecheck passed. MCP uses the same command and
passes rejection through unchanged; assembled MCP verification and final code
review are retained in ticket 03. Changes remain unstaged.

Final integrated validation and independent review completed in
[ticket 03](03-verify-recovery-lifecycle-and-reconcile-docs.md);
[verification evidence](../verification.md).

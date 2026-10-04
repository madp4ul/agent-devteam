# Stall recovery delivery

Source: framework improvement [27](../framework-improvements-2026-09/issues/27-recover-stalled-work-without-user-attention.md).
Contract: [spec.md](spec.md). Decision: [ADR 0023](../../docs/adr/0023-recover-tasks-without-continuation-paths.md).
Design and all three delivery tickets are resolved. User review is next.

| Ticket | Slice | Blocked by |
| --- | --- | --- |
| [01](issues/01-reject-circular-task-relationships.md) | Transactional cycle rejection through browser and agent paths | None |
| [02](issues/02-deliver-bounded-stall-recovery.md) | Durable recovery, grace, prompt/guidance, actionable attention | 01 |
| [03](issues/03-verify-recovery-lifecycle-and-reconcile-docs.md) | Integrated regression, restart proof, documentation and review | 01, 02 |

Cycle prevention lands before waiting relationships become recovery suppressors.
Each slice includes meaningful coverage; 03 verifies the assembled behavior.
Use existing authoritative boundaries and released migrations. Leave changes
unstaged; the user owns staging, commits, and pushes.

## Decisions so far

- 2026-10-03: User confirmed structural detection, watcher ownership, waiting
  suppression, three recoveries with continuation-based resets, 60-second user
  grace, dispatch recheck, existing technical retries, and retained-graph cycle
  rejection. Recovery wording reviewed. Persistence is an engineering default
  where the user expressed no preference. Implementation has not begun.
- 2026-10-04: [01](issues/01-reject-circular-task-relationships.md) delivered
  transactional retained-graph cycle rejection through application, browser/HTTP
  and MCP paths.
- 2026-10-04: [02](issues/02-deliver-bounded-stall-recovery.md) delivered persisted
  recovery, continuation resets, grace, prompts, notifications and actionable
  attention. Already-dispatched technical retries retain ordinary ordering.
- 2026-10-04: [03](issues/03-verify-recovery-lifecycle-and-reconcile-docs.md)
  completed integrated verification, documentation and independent code reviews.
  [Verification evidence and retained-state limits](verification.md): 365 tests
  passed, four skipped; browser regression and affected follow-up suites passed;
  typechecks/build passed. Implementation remains unstaged.

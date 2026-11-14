# Framework maintainability delivery plan

Source: [November assessment](spec.md).

## Implementation hold

On 2026-11-14 the user authorized creating issues only. They intend to run the
idle game project first and do not want that run and framework refactoring to
happen at the same time. All issues remain open and deferred. Do not claim,
implement or automatically resume any issue until the user explicitly resumes
this effort. Completion of the idle game run alone is not authorization.

The scope is the coordination framework. Authored agent processes, the idle
game project and individual live executions are outside this effort. Preserve
existing product behavior, public transport shapes, historical compatibility,
the shared application authority and workflow-owned SQLite transactions.

## Issues

| Issue | Delivers | Blocked by |
| --- | --- | --- |
| [01 Reproduce local verification](issues/01-reproduce-local-verification.md) | Predictable fixture environment and useful failure reports | None |
| [02 Narrow task control reads](issues/02-narrow-task-control-reads.md) | Stop and interrupt without loading complete task or board history | None |
| [03 Bound dispatch context reads](issues/03-bound-dispatch-context-reads.md) | Claim and dispatch using current state and intentionally selected context | 02 |
| [04 Own attempt publication explicitly](issues/04-own-attempt-publication-explicitly.md) | One explicit owner for meaningful effects publishing recovery probes | None |
| [05 Expand typed activity contracts](issues/05-expand-typed-activity-contracts.md) | Checked authoring and historical decoding alongside existing callers | None |
| [06 Migrate task and resource activity](issues/06-migrate-task-and-resource-activity.md) | Typed task, comment, relationship, resource and archival events | 05 |
| [07 Migrate execution and conversation activity](issues/07-migrate-execution-and-conversation-activity.md) | Typed activation, attempt, attention, automation, recovery and conversation events | 05 |
| [08 Finish activity contract migration](issues/08-finish-activity-contract-migration.md) | Remove permissive authoring after all producers have migrated | 06, 07 |
| [09 Isolate conversation reading](issues/09-isolate-conversation-reading.md) | One lifecycle for paging, retention, following and viewport preservation | None |
| [10 Consolidate supporting control styles](issues/10-consolidate-supporting-control-styles.md) | Predictable theme and interaction rules for the inspected controls | None |

Issue 10 is lower priority. The activity migration deliberately uses
expand-and-contract so every intermediate change remains verifiable.

## Recommended order after the user resumes

Start with 01 to establish verification, then 02 and 03, then 04. Complete
05 through 08 in dependency order. Issue 09 is independent of backend delivery;
10 can follow later. This is a suggested execution order, not additional
blocking edges or permission to run tickets concurrently. Shared-file overlap
should be checked before scheduling work.

Each implementation must run appropriate checks, distinguish environmental or
existing failures from regressions, complete the repository's code review, and
leave changes unstaged for user review. Update the architecture map and record
durable ADR reasoning when the implemented seam or authoritative flow changes.
No framework or persistence-tooling replacement is part of these issues.

## Delivery state

Assessment complete; follow-up issues created. Implementation has not started.
The staged assessment remains unchanged. The issues and this plan are an
unstaged planning addition.

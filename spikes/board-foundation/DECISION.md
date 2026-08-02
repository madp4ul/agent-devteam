# Board foundation decision

Decision: NO-GO for Kanboard as the first version's human-facing board.

Selected fallback: a product-owned custom-board fallback over the coordination
framework's authoritative command-and-query boundary. The bounded spike in
this directory demonstrates the board, linkable full task page, and accessible
move interaction. A production UI can add Atlassian Pragmatic Drag and Drop at
this same boundary without making pointer dragging the only movement path.

## Why Kanboard fails the gate

The deciding constraint is ownership, not whether Kanboard can display cards.
The specification requires one authoritative relational state and an atomic
logical board command that changes current state, appends immutable activity,
and creates resulting activations.

Kanboard's normal UI command first commits Kanboard's database change. Its
[synchronous webhook](https://docs.kanboard.org/v1/dev/webhooks/) runs after the application event and calls a separate
service. Neither a webhook nor JSON-RPC can join the framework's SQLite
transaction. A crash, timeout, or rejected framework command can therefore
leave Kanboard and the authoritative coordination state disagreeing. Reversing
ownership and treating Kanboard as a projection would require replacing or
intercepting every relevant Kanboard write path (task creation, movement,
comments, mentions, and internal links), which crosses the ticket's broad-fork
and core-template-override fallback criterion.

The documented `task.move.column` webhook supplies the task and changed values,
but not the authenticated actor who performed that move. `creator_id` is the
task creator and `owner_id` is the assignee; neither establishes event authorship.
The integration endpoint and its automated check reject that payload because
the framework cannot invent provenance.

## Gate results

| Gate | Kanboard result | Spike evidence |
| --- | --- | --- |
| Usable board and full task entry | Pass | Kanboard has both; the fallback also exposes `/` and `/tasks/{id}`. |
| Stable process identities and safe reapplication | Projection-only | `test_process_reapplication_preserves_identities_and_live_tasks` proves this in the authoritative store. |
| Event and author provenance | Fail | The documented move webhook has no acting-user identity; the adapter boundary returns 422. |
| Atomic current state, activity, and activation | Fail | Kanboard and the framework use separate transactions. The fallback commits all three in one SQLite transaction. |
| Narrow exceptional-state extensions | Pass in isolation | [Plugin hooks](https://docs.kanboard.org/v1/plugins/hooks/) can add task/card/detail content, but they do not repair write ownership. The fallback renders run state, failure attention, and Retry/Dismiss task actions directly. |
| Idempotent board/process synchronization | Pass only as a read projection | The fallback applies stable IDs and command idempotency without reconciling two writable stores. |
| Repository, task-workspace, Codex auth, and project-container access | Pass | Compose bind mounts the three host boundaries and joins the coordinator to a project-service network; `/api/deployment-capabilities` probes them from inside the running container and `test_compose_live.py` asserts the result. A placeholder auth file proves access without disclosing credentials. |

## Coherent ownership and transaction strategy

The coordination store is authoritative. Every public mutation:

1. begins one immediate SQLite transaction;
2. checks a durable idempotency record;
3. validates the expected task revision where applicable;
4. updates current state;
5. appends an authored immutable activity event;
6. creates attention or activations with an exact `source_event_id`; and
7. stores the command response before commit.

The UI observes and mutates state only through this boundary. A later Kanboard
read-only projection would remain technically possible, but is not justified
as the primary UI after the no-go result.

## Scope boundary

This spike stops at board-foundation feasibility. It does not implement the
process validator/start command, startup pause/resume lifecycle, scheduler,
agent runtime dispatch, retries, or worktree provisioning. Those are Ticket 15
and later concerns; Ticket 15 has not been started.

The Python server, routes, templates, demonstration schema, placeholder
authentication, and demo data are disposable spike implementation. Ticket 15
must preserve the proven behavior at the application-level command-and-query
seam while establishing the production TypeScript application. The detailed
promotion policy is recorded in [HANDOFF.md](./HANDOFF.md), and the durable
architecture decision is [ADR 0001](../../docs/adr/0001-product-owned-board-and-authoritative-coordination-state.md).

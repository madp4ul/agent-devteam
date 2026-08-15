# Codebase maintainability

## Problem Statement

The coordination framework has grown successfully, but recurring feature work now
changes several broad modules at once. User-facing projections are assembled in
transport adapters, durable coordination mechanics are repeated across multiple
workflows, conversation behavior shares large task-focused persistence modules,
and browser lifecycle behavior is duplicated across pages and dialogs. Large
contract and test files make those change paths harder to locate and increase the
chance that otherwise independent work collides.

The problem is not the number of lines by itself. Several large modules are deep
and cohesive. The maintainability problem is that some interfaces require callers
to understand too much implementation knowledge, while some invariant-sensitive
implementation knowledge appears in multiple places. This reduces locality for
the maintainer and makes future feature work more expensive than necessary.

## Solution

Preserve the product architecture and feature set while deepening the modules at
the seams where changes currently diffuse. Keep one authoritative coordination
model and one SQLite transaction authority. Move complete user-facing projection
behavior behind application queries, give conversation persistence a cohesive
home, centralize repeated durable-write mechanics, and consolidate reusable
browser lifecycle behavior.

After those behavioral seams are stable, reorganize the broad shared contract and
largest test suites by capability using an expand-and-contract sequence that
keeps the repository green throughout. The result should make a future change to
one capability understandable and verifiable in fewer places without introducing
speculative abstraction or additional deployment boundaries.

## User Stories

1. As the project maintainer, I want a complete user board projection from one application query, so that changing the board experience does not require reproducing query orchestration in an adapter.
2. As the project maintainer, I want a complete user task-detail projection from one application query, so that task-detail changes remain local and related-task lookup rules have one owner.
3. As the project maintainer, I want browser transport request and response shapes to have one shared definition, so that the host and browser cannot silently drift apart.
4. As a user, I want the board to retain its current content, ordering, controls, and error behavior, so that the maintainability work causes no workflow regression.
5. As a user, I want task details to retain their current activity, conversation, relationship, workspace, attention, and automation information, so that the maintainability work is behavior-preserving.
6. As an agent, I want the MCP tools and their scoped behavior to remain unchanged, so that code organization does not alter coordination permissions or workflow semantics.
7. As the project maintainer, I want conversation index, detail, messages, runs, status, and continuation availability owned by one deep projection module, so that conversation changes are easy to find and verify.
8. As the project maintainer, I want conversation continuation to be owned by one deep command module, so that its message, activity, activation, idempotency, and ownership rules remain atomic and local.
9. As a user, I want conversation history and continuation to behave exactly as before across restart, retry, process evolution, archival, and replacement threads, so that extraction does not weaken durability.
10. As the project maintainer, I want durable activity insertion to have one implementation, so that activity identity, actor, timestamp, and detail serialization cannot diverge between workflows.
11. As the project maintainer, I want attention creation and notification recording coordinated through one internal interface, so that a new attention-producing workflow cannot omit part of the durable evidence.
12. As the project maintainer, I want idempotent command execution mechanics encapsulated where their semantics are common, so that replay behavior is applied consistently without obscuring workflow-specific decisions.
13. As a user, I want repeated commands to retain their current idempotent results, so that internal consolidation does not change externally observable mutation behavior.
14. As the project maintainer, I want modal focus trapping, Escape handling, scroll locking, backdrop dismissal, and focus restoration owned by one browser module, so that accessibility fixes apply to every modal consistently.
15. As a keyboard user, I want every dialog to preserve its current accessible interaction contract, so that shared browser behavior improves consistency without losing control.
16. As the project maintainer, I want polling and refresh sequencing owned by reusable behavior modules, so that stale responses, errors, and refresh triggers are handled consistently.
17. As a user, I want polling pages to preserve scroll position, selected context, feedback, and live updates, so that internal browser cleanup does not make the interface jump or lose state.
18. As the project maintainer, I want contracts grouped by task, conversation, automation, process, notification, runtime, and adapter capability, so that I can navigate the interface relevant to one change.
19. As the project maintainer, I want contract migration to keep old imports valid until all callers move, so that every intermediate change remains type-safe and testable.
20. As the project maintainer, I want adapters to depend only on the capabilities they use, so that the interface each caller must understand is smaller than the entire product surface.
21. As the project maintainer, I want large test suites divided along observable capabilities, so that a failing behavior and its setup are easy to locate.
22. As the project maintainer, I want shared test fixtures to express domain setup rather than incidental storage details, so that tests stay readable and survive internal refactors.
23. As the project maintainer, I want all refactoring tests to observe public interfaces, so that they protect behavior without freezing implementation structure.
24. As the project maintainer, I want each cleanup unit to fit in one fresh implementation context, so that changes can be reviewed and accepted independently.
25. As the project maintainer, I want every unit to leave typechecking and relevant tests green, so that the cleanup never requires a long-lived broken integration state.
26. As the project maintainer, I want architecture documentation updated only when state ownership, authoritative flow, or module seams materially change, so that the documentation remains an accurate inspection map.
27. As the project maintainer, I want durable design reasoning recorded when a new long-lived seam is established, so that later work understands why that seam exists.
28. As the project maintainer, I want cohesive large modules left intact when they already hide complexity effectively, so that cleanup does not devolve into arbitrary file splitting.
29. As the project maintainer, I want no new network process, service boundary, repository abstraction, or configurable extension point, so that maintainability does not come at the cost of speculative indirection.
30. As the project maintainer, I want the final repository to preserve the complete application, browser, MCP, runtime, Git-workspace, relocation, notification, and conversation feature set, so that cleanup is demonstrably behavior-preserving.

## Implementation Decisions

- Preserve `CoordinationApplication` as the authoritative coordination seam. A
  single authority does not require every internal workflow to live in one file,
  but every authoritative command and query continues to pass through it.
- Add deep user-facing board and task-detail queries. These queries own the
  orchestration and shaping of complete projections; HTTP adapters own only
  transport concerns such as decoding, authentication context, and status codes.
- Define shared browser transport contracts separately from the complete domain
  contract. The host and browser use the same request and response definitions.
- Keep the browser transport local and host-native. Do not introduce a remote
  service, generated client pipeline, or general-purpose web framework as part of
  this effort.
- Extract conversation persistence by workflow and projection, not by database
  table. Conversation modules own complete behavior while participating in the
  existing coordination database transaction.
- Keep persistence helpers internal. Durable activity, attention, notification,
  and idempotency helpers are implementation seams and do not become part of the
  external application interface.
- Introduce shared browser behavior only where at least two existing consumers
  demonstrate the seam. Modal lifecycle and refresh sequencing qualify; arbitrary
  visual fragments do not.
- Preserve feature-specific viewport and selection policies near their pages.
  Shared refresh behavior handles concurrency and lifecycle, while page-specific
  behavior decides what context must be captured and restored.
- Reorganize the broad contract using expand-and-contract. Add capability modules
  and compatibility exports first, migrate callers in independently green groups,
  then remove obsolete compatibility structure.
- Prefer direct capability imports inside the repository. A small public barrel
  may remain when it represents an intentional external convenience rather than a
  dumping ground.
- Split tests by user-observable capability and retain shared setup in focused
  fixture builders. Do not create tests for private stores or private helpers.
- Preserve the current pre-release database compatibility policy. No durable
  schema migration is required merely to reorganize implementation modules.
- Update the architecture map if the final module seams or authoritative query
  flow materially change. Record an ADR only for durable decisions not already
  implied by the accepted architecture and this specification.
- Leave all work unstaged for user review. The user continues to own staging,
  commits, and pushes.

## Testing Decisions

- The primary coordination seam is `CoordinationApplication`. Application tests
  exercise commands and queries through that interface and observe returned
  projections, durable restart behavior, and later commands.
- The user-facing transport seam is the browser HTTP interface. Adapter tests
  verify complete board and task-detail responses, mutation status mapping, and
  configuration-error behavior without inspecting private stores.
- The browser behavior seam is the rendered application in Playwright. Tests
  cover modal keyboard behavior, polling updates, scroll or focus preservation,
  and representative board and task workflows in both supported themes where
  visual interaction behavior is affected.
- The agent-facing seam remains MCP. Existing MCP tests verify scoped discovery
  and mutation behavior after internal contract reorganization.
- The runtime seam remains the agent-runtime interface. Existing runtime tests
  protect thread continuity, transcript capture, permission blocks, usage, and
  failure semantics.
- Pure presentation models may retain direct tests when their return value is a
  stable, behaviorally meaningful interface. React implementation details, SQL
  strings, private methods, and module wiring are not test surfaces.
- Refactor tickets begin with characterization at the agreed seam when existing
  coverage does not prove the behavior being moved. New tests must fail for the
  missing public behavior, not because an internal class has not yet been created.
- Every ticket runs typechecking and its focused tests. The full non-browser suite
  runs before ticket completion; browser tests run for tickets affecting browser
  transport or interaction and at the final integration point.
- Tests should remain valid if internal modules are renamed, merged, or split
  while external behavior stays the same.

## Out of Scope

- New end-user features or workflow rules.
- Changes to domain terminology or the single-context domain model.
- Changes to task, activation, attempt, attention, conversation, notification,
  archival, process-evolution, or Git-workspace semantics.
- Database normalization or migration infrastructure unrelated to an extracted
  module's demonstrated needs.
- Replacing SQLite, React, Vite, Node, Codex, MCP, or the host-native deployment.
- Microservices, remote APIs, plugin systems, dependency-injection frameworks, or
  repository interfaces with only one meaningful adapter.
- A visual redesign of the browser application.
- Splitting files solely to satisfy a line-count threshold.
- Staging, committing, rebasing, or pushing changes.

## Further Notes

The implementation should optimize for leverage and locality rather than minimum
file size. A module is successful when a future behavior change crosses fewer
interfaces and requires less duplicated knowledge. The deletion test applies to
every proposed abstraction: if deleting it would not cause meaningful complexity
to reappear across callers, it should not exist.

The conversation feature was still in progress during the original survey but is
now present in the clean baseline. Its settled behavior can therefore be used as
characterization coverage before extracting conversation modules.

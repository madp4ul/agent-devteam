# Coordination framework maintainability assessment

Date: 2026-11-14. Inspected source baseline: `d084317`, including the working tree.
Purpose: preserve the sole agent maintainer's ability to understand, change and
verify the framework as functional requirements continue to grow.

## Recommendation

The architecture remains a good foundation. A focused maintenance effort is
worth doing now, particularly around task read contracts and recovery attempt
publication. The code is not in its best practical state for continued change,
but the evidence does not justify replacing its central architecture.

The most valuable outcome is to reduce the knowledge required for a change:
which data must be loaded, which operation publishes an attempt, which fields
an activity requires, and which module owns the conversation reader's lifecycle.
Large refactoring capacity makes it possible to address these thoroughly. It
does not make additional abstraction valuable by itself.

| Order | Work | Expected benefit | Scope |
| --- | --- | --- | --- |
| 1 | Make local verification reproducible | Failures identify behavior changes instead of environment setup | Test commands and fixture environment |
| 2 | Separate operational task reads from complete history | A control or dispatch change cannot accidentally depend on all retained content | Control and dispatch workflows, runtime request and context composition |
| 3 | Give recovery attempt publication an explicit owner | Recording activity no longer conceals an attempt lifecycle transition | Recovery, meaningful effects and publication |
| 4 | Type activity payloads by event kind | TypeScript catches mismatched producers and consumers | Incremental contract migration with retained-data compatibility |
| 5 | Give conversation reading a cohesive module | Paging and viewport changes become local to one lifecycle | Conversation dialog reader; preserve its specific retention policy |

CSS consolidation is useful subsequent work, with lower urgency. These are
proposed directions, not approved implementation tickets or completed refactors.

## Architecture worth preserving

The browser and scoped agent tools still use `CoordinationApplication` as their
shared authoritative interface. Source inspection found no imports of
`node:sqlite` or application internals in the browser, MCP or runtime adapters.
HTTP route groups receive narrowed capabilities and keep transport handling
separate from authoritative workflow decisions.

The internal modules share one synchronous SQLite connection. Command workflows
own their transactions; activity, attention, notifications, idempotency and
projections participate in those transactions. This gives related durable facts
one commit point and remains appropriate for a local application.

Released migrations, independent schema evidence, backup verification, restart
recovery and verified Git workspace identity are substantial assets. Their
complexity reflects real safety requirements. Replacing these with a generic
persistence or workflow abstraction would need a demonstrated reduction in the
maintained system's complexity.

Earlier maintenance work is visible in complete user projections, capability
contracts, shared modal and refresh behavior, typed conversation fixtures,
task-comment composition, transcript projection and token-cost policy. The
September assessment's two concrete recommendations have implementation homes
in the current tree. This assessment does not reopen them.

## Findings

### Operational reads still require complete task history

This is the clearest current opportunity because the code already has bounded
history and compact command projections, but some operational interfaces still
require the complete `TaskView`.

Concrete paths:

- `CoordinationApplication.stopActivation` calls `queryTask` to find one
  activation. `queryTask` loads the full task and builds its board with complete
  tasks in every column. A targeted stop decision therefore depends on a much
  broader read than its behavior needs.
- `interruptTask` loads the full task merely to check existence.
- `ActivationSchedulingModule.claimNextRunnable` loads the full task and then
  finds the selected activation in its activation array.
- `AutomationCoordinator.dispatch` loads that full task again before
  composing activation context and dispatching.
- `TaskProjectionStore.readTask` defaults to `full`: it reads every activity,
  every comment and every activation with attempts. Activation hydration also
  queries startup failure and recovery facts per activation.
- Context composition accepts `TaskView`, derives pins from the complete
  comment array, and filters those loaded comment/activity arrays using IDs
  selected by its bounded history query. `AgentRunRequest.task` retains the
  same broad type.

The prompt can be bounded while the work required to construct it still grows
with the task's entire retained history. The architectural issue is the
interface: its caller must supply and understand history even when it needs
only current state. A future change can unknowingly reintroduce expensive reads
by choosing the convenient default method.

Introduce explicit operational reads for current task state, one activation,
current counts, pins and the exact activation source. Let context composition
own the bounded hydration it needs. Narrow the runtime request accordingly,
including the retained-payload compatibility path. Keep a complete history
query where a supported consumer actually requires it; make that choice
explicit rather than the default for control workflows.

Success means stopping, interrupting and claiming work do not hydrate unrelated
history; initial and returning prompts still carry the same required state,
pins, source and bounded context. Verify with large-history application scenarios
and observable query/runtime results, plus targeted read instrumentation where
needed. Do not use timing thresholds alone. Costs and counts can still aggregate
compact retained facts without hydrating their bodies.

Evidence: [application](../../src/application/coordination-application.ts)
at lines 515, 531 and 1040;
[task projections](../../src/application/internal/task-projection-store.ts)
at lines 94, 757 and 949;
[scheduling](../../src/application/internal/activation-scheduling-module.ts)
at line 109;
[dispatch](../../src/application/internal/automation-coordinator.ts)
at line 481;
[context composition](../../src/application/internal/conversation-context-delivery-module.ts)
at lines 21 and 68;
[runtime contract](../../src/application/runtime-contract.ts).

### Recording activity conceals recovery attempt publication

`ActivityJournal.append` conditionally calls `promoteProbe` whenever activity
details contain an `attemptId`, except for `attempt.started`. Promotion changes
`attempts.provisional_probe`, deletes the dispatch claim, and appends
`attempt.started`. Deleting the claim also invokes the timeline publication
trigger. This is a meaningful coordination transition behind a general
activity-recording interface.

There are legitimate reasons for this behavior: a recovery probe must become a
retained attempt when it produces meaningful effects. The problem is that the
effect is triggered by a string payload field, while related knowledge is also
held by transcript ingestion, thread recording, settlement, comment creation,
scheduling and read projections. A future mutation author must know that adding
or omitting provenance can also determine whether the attempt is published.

Give attempt publication a focused internal owner. Its interface should make
the relationship between a meaningful effect and publication explicit, and
perform both in the caller's existing transaction. Keep primitive activity
insertion free of hidden lifecycle policy. This can include an attempt-aware
recording operation so callers do not have to repeat a fragile pair of calls.
Simply distributing `promoteProbe` calls across all command handlers would not
improve the design.

Preserve provisional probes, outage compaction, source attribution, publication
ordering and trigger-backed projections. Verify empty repeated failures,
meaningful transcript/usage/thread evidence, comments and resource effects,
interruption, restart and rollback. Keep those tests at the application and
runtime interaction interfaces.

Evidence: [activity journal](../../src/application/internal/activity-journal.ts)
at lines 13 and 33;
[attempt lifecycle](../../src/application/internal/active-attempt-module.ts)
at lines 86, 339 and 414;
[comment effects](../../src/application/internal/task-command-store.ts)
at line 632;
[timeline publication](../../src/application/internal/migrations/0011-task-timeline.ts);
[recovery scenarios](../../test/application/transient-runtime-recovery.test.ts).

### Activity kinds are typed but their payloads are not

`TaskActivityView.type` enumerates event kinds, but `details` is
`Record<string, string>`. `ActivityJournal.append` accepts the kind and that bag
independently. A misspelled field or the payload for another kind can compile.
This weakens one of the most useful forms of feedback for an agent maintainer:
the compiler identifying every producer and consumer affected by a change.

The payloads now carry more than labels: attempt provenance, relationship resume
ownership, recovery identity and counts, resource grants, movement and context
references. Their consumers span context composition, timeline hydration,
browser presentation and SQL projections. For example, the source-event reader
asserts only `task.created | task.moved` for a query that does not filter event
type; this is stale type knowledge hidden by an assertion.

Use an event-kind-to-payload contract that ties each new event to its required
fields, and a discriminated activity representation for consumers that need it.
Separate persisted facts from query enrichment such as a hydrated message body.
Preserve existing serialized shapes and handle historical missing fields at a
clear decoding seam. Introduce the types alongside the current reader, migrate
coherent event families, then remove the permissive authoring interface.

This does not require a generic event bus, event sourcing, an ORM, or runtime
validation of every database row. New authored activity should be checked
strictly; historical compatibility must remain explicit.

Verify that malformed new payloads are compile-time errors and that released
fixtures, history, prompts, movement, relationships and resources retain their
behavior. Leave released migration files immutable.

Evidence: [activity contract](../../src/application/task-contract.ts)
at lines 12 and 46;
[journal](../../src/application/internal/activity-journal.ts);
[source-event reader](../../src/application/internal/task-projection-store.ts)
at line 636;
[timeline consumers](../../src/web/client/Timeline.tsx);
[context delivery](../../src/application/internal/conversation-context-delivery-module.ts).

### The conversation dialog owns both reader mechanics and conversation actions

The dialog owns paging intents and busy state, refresh cursor selection, two
requests for some page transitions, eviction spacers, retained anchors, text
selection, bottom following, user-scroll cancellation, animation frames,
resize/mutation observers, running-state tracking and pending activation
reconciliation. It also owns retirement form state and actions.

The September assessment reasonably deferred the earlier following lifecycle.
The current reader additionally has bounded window navigation and eviction
policy. Its paging, polling and viewport decisions now share many mutable refs
with unrelated dialog actions. Understanding a reader change requires reading
most of the dialog and mentally tracking the ordering of those refs.

Extract a conversation-specific reader module owning fetching, page transitions,
retention, selection/anchor preservation and following. Present a small
interface for the current view, loading/error outcomes, navigation and refresh
after an accepted action. Keep retirement and follow-up commands outside that
reader. Internal DOM-aware helpers are reasonable; exposing the collection of
refs to the dialog would preserve the same coupling.

Do not unify this with the task timeline reader. The conversation retains a
bounded window with eviction spacers; the task timeline deliberately retains
requested content. Those are different product policies.

Success means changes to page size, window replacement or following can be
implemented within the reader without editing retirement or follow-up handling.
Retain browser coverage for delayed and stale responses, direct links, pending
activations, text selection, scroll cancellation, resize and modal focus.

Evidence: [conversation dialog](../../src/web/client/AgentConversationDialog.tsx)
at lines 47, 164, 254 and 286;
[existing task reader](../../src/web/client/timeline-window.ts);
[paging coverage](../../test/browser/conversation-pages.browser.spec.ts);
[following coverage](../../test/browser/conversation-following.browser.spec.ts).

### Styling still depends on successive override layers

Base rules retain literal light colors and legacy tokens, followed by a broad
theme-token override section and later control-specific selectors qualified
with `html[data-theme]`. Modal, activity and conversation controls illustrate
this pattern. A styling change can require reasoning about several distant
rules and their specificity rather than editing one coherent rule set.

Consolidate one visual capability at a time so its base, interaction, responsive
and theme behavior have a predictable home and semantic tokens. Remove
superseded rules as each capability moves. Preserve dark-mode visual hierarchy,
light-mode readability and the existing geometry/accessibility of controls.
Changing CSS tooling alone would not solve the cascade ownership problem.

This is useful cleanup after the operational work, not a reason to block
functional development. No visual regression is asserted by this finding.

Evidence: [styles](../../src/web/client/styles.css), especially the modal rules
around line 331, activity rules around line 453, theme override section around
line 930 and later conversation control rules around line 999.

## Verification and environment

Typechecking and the production build pass. Vite reports a client chunk over
500 kB; that alone is not evidence for an architectural refactor.

The first Node test invocation under the desktop sandbox encountered fixture
failures. An isolated nested-worktree test failed with `$GIT_DIR too big`; an
isolated migration-formatting test failed while creating its SQLite backup.
Both passed after changing only the temporary directory to a shorter local path.
This establishes an environment-sensitive verification problem, not a
regression in those two behaviors.

Browser execution initially could not find the installed Chromium through the
sandbox profile. Pointing it to the installed browser resolved discovery, but
localhost navigation was denied by sandbox networking. These failures occurred
before product behavior could be tested.

Outside those restrictions, 21 focused application tests passed across
coordination journaling, bounded activation context, resource claims and
transient recovery. The 1,000-retry stress case was excluded from the final
focused run after exceeding an earlier audit invocation's 60-second test limit.
The complete Node suite was attempted but interrupted; this assessment does
not establish a green full-suite baseline.

The eight selected reader browser cases passed across the initial run and an
isolated recheck. The light-theme scroll-cancellation case failed initially and
passed on recheck. Four lifecycle-menu cases were exercised: two passed
initially, and the two per-task archival cases timed out initially but passed
when rerun separately. These observations warrant attention to reproducibility;
they do not establish a product regression or prove the tests are stable.
Real Codex integration probes are opt-in and were not run.

Command output is retained under the already ignored
`.scratch/local-evidence/`, including `maintainability-2026-11-14-focused-node-final.log`,
`maintainability-2026-11-14-readers-browser-tests.log` and
`maintainability-2026-11-14-browser-isolated-recheck.log`.
The audit-created `.scratch/mt` fixture directory was removed. No authored
process definitions, live coordination databases or individual execution
records were changed or assessed as maintenance targets.

A reproducible developer command should make its temporary root, browser
location and localhost access requirements clear, with bounded failure reporting.
This is particularly valuable when the agent is the maintainer: time spent
rediscovering the execution environment does not improve the product. Preserve
specific environment errors rather than converting them to generic failures or
weakening migration and workspace checks. This is a verification improvement
inferred from this desktop environment, not evidence that every supported
development environment needs the same workaround.

## Work considered and deferred

| Candidate | Assessment |
| --- | --- |
| Split the application class by size | The broad public authority is intentional. Extract only cohesive behavior, as above; a method-count target would mostly add forwarding. |
| Replace Node HTTP with a framework | Route composition and capabilities remain useful. No demonstrated platform requirement warrants overriding ADR 0016. Listening-socket adapter tests alone do not establish that a framework would simplify them. |
| Replace SQL with an ORM | Follow ADR 0017's concrete adoption conditions. Current third-party versions were not researched; this assessment supplies no new tooling-adoption evidence. |
| Split into services or introduce an event bus | Would complicate transactions, recovery and navigation without an observed requirement. |
| Unify waiting relationships, resource queues and stall recovery behind one eligibility rule | These rules deliberately differ. Share stable facts when useful, but preserve command-specific policy. |
| Redesign archival | Durable operations, per-task results and claim-based Git cleanup have coherent responsibilities. Keep their safety distinctions and recovery behavior. |
| Break up all large test files | Capability-focused suites already exist. Improve setup and observable coverage where it obstructs a specific change. File length is not sufficient evidence. |
| Eliminate every type-import cycle | A source-import scan includes several cycles, many through types and migration contracts. That is navigation evidence, not proof of runtime initialization trouble. No blanket cycle-removal project is justified. |
| Rewrite architecture documentation | The inspection map has accumulated feature detail, but remains useful. Update relevant seams with approved refactors; keep durable rationale in ADRs and detailed behavior in focused references. |

## Proposed sequence and acceptance

Establish reproducible verification first. Then improve operational reads,
starting with stop/interrupt and completing the dispatch/context path. Keep
every step behaviorally verifiable. Attempt publication is the next domain
refactor; it must preserve the existing atomic effects and recovery semantics.
Activity typing can progress by event family. Conversation reading is a separate
capability and need not wait for the backend refactors. CSS consolidation can
follow independently.

Before implementation, turn the selected directions into scoped specifications
and dependency-aware tickets through the repository workflow. In particular,
the activity contract migration should use expand-and-contract so intermediate
changes remain green. The findings do not authorize changing product semantics
or silently discarding compatibility paths.

Judge the resulting work by concrete maintenance tasks:

1. Changing a stop or dispatch rule should not require knowing how complete
   task history is assembled.
2. Adding a meaningful attempt effect should have one explicit publication
   operation, with no hidden lifecycle transition in generic logging.
3. Changing an activity payload should give compiler feedback at affected
   producers and typed consumers.
4. Changing conversation paging should leave retirement and follow-up command
   code untouched.
5. A fresh agent should be able to run the relevant verification without
   rediscovering path and browser-environment setup.

The assessment covers the implemented architecture, representative workflows
and their change paths. It is not an exhaustive correctness, security or
performance audit. Source size grew from 121 TypeScript/TSX files and 22,459
lines at the previous assessment baseline `dfa79da` to 198 files and 31,587
lines in the inspected working tree. Those counts guided inspection; the
recommendations above follow from interface and ownership evidence.

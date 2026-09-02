# September maintainability assessment

Date: 2026-09-02. Inspected baseline: `dfa79da`.

## Recommendation

The codebase is in good enough shape to continue feature development. A small
two-ticket pass is worthwhile; another broad architectural round is not
justified by this inspection. Optimize for the sole agent developer's ability
to locate behavior, change it locally, and get trustworthy feedback. Human-team
onboarding conventions and file length alone are not reasons to refactor.

The approved work is in [01 — Typed conversation browser fixtures](issues/01-type-conversation-browser-fixtures.md)
and [02 — Localize task-comment composition](issues/02-localize-task-comment-composition.md).
Both are independent, sized for a fresh implementation context, and marked
ready-for-agent following user approval on 2026-09-02. Implementation has not
started.

## What was inspected

- Architecture, domain vocabulary, development workflow, tracker conventions,
  relevant routing/persistence ADRs, Git history, and prior maintenance tickets.
- Application composition, workflow-owned transactions, activation context
  delivery, scheduling/dispatch, attempt settlement/evidence, conversation
  projections, costs, archival checkpoints, and released-schema verification.
- HTTP route composition and capability separation, runtime adapter seams,
  task and conversation browser lifecycles, shared polling, follow-up composition,
  and representative application/browser fixtures and tests.
- Source searches and file-size inventory as navigation aids, followed by
  reading implementations; no arbitrary size thresholds were used.

The initial worktree and index were clean. The three earlier maintainability
efforts contain 26 resolved tickets in total. The later routing, persistence,
automation/runtime, migration, and verification work was also considered,
including the recently resolved verification tickets. Recommendations below
do not reopen those deliveries.

The repository router and `codebase-design` skill supplied the evaluation
criteria. The router's referenced `improve-codebase-architecture` skill was not
found in the repository or personal skill directory. The available design
guidance was sufficient for this assessment. Approved tickets use the local
`to-tickets` format.

## Findings worth acting on

### 1. Let TypeScript validate ordinary conversation test fixtures

This offers the clearest feedback improvement. Production has shared, strict
conversation and transcript contracts, but the shared browser builders accept
and return `Record<string, unknown>`. Consumers then cast history to `any`.
The compiler consequently cannot identify ordinary fixtures that stopped
matching a contract after a feature change.

Concrete drift is already visible:

- `runningConversationScenario` omits required `costPending` and
  `hasUnpricedSettledRuns` fields from the conversation view.
- The following suite's `followUpMessage` omits the required `attachments`
  array on an authored conversation message.
- `fulfillConversationTranscript` manipulates history through
  `Array<Record<string, any>>`, so discriminated history-entry contracts do
  not guide edits.

These are test-fidelity gaps, not a claim that production returns invalid
responses. The rendered scenarios can pass because the omitted fields are not
central to their assertions. Fixing the shared valid-data builders makes future
contract changes produce useful compiler errors before browser debugging.
Deliberately malformed/raw transport scenarios must stay explicit exceptions.

Evidence at the inspected baseline:
[shared builders](../../test/browser/browser-fixture.ts),
[following scenarios](../../test/browser/conversation-following.browser.spec.ts),
[conversation contract](../../src/application/conversation-contract.ts), and
[existing typed feature fixtures](../../test/support/conversation-feature-fixtures.ts).
The shared helpers are used across conversation lifecycle, transcript,
attachment, following, automation, and archival suites.

### 2. Give task-comment composition one lifecycle owner

The task page owns the comment draft, textarea and panel refs, docking observers,
height synchronization, and reply insertion. Its nested `CommentForm` separately
owns mention selection, submission/idempotency, textarea fitting, and restoration
after submission. Textarea fitting reaches back into page-owned layout through
CSS ancestry selectors. Changing reply or composer layout behavior therefore
requires understanding both lifecycles alongside task polling and archival.

This is a useful deepening opportunity because the same capability's knowledge
is split, not because the page is long. A focused task-comment module should own
the draft, reply intent, mentions, submission, sizing and docking behavior. The
page should retain authoritative task refresh, attention acknowledgement,
navigation, and the overall timeline reader state. Existing rendered-browser
tests already protect the behavior, including dark/light layout and contextual
replies, making this a bounded refactor.

Evidence: [task page and nested form](../../src/web/client/TaskPage.tsx),
[composer browser coverage](../../test/browser/task-comment-composition.browser.spec.ts),
and [earlier contextual-reply requirements](../agent-coordination-framework/issues/72-keep-comment-replies-in-context.md).
The recent conversation follow-up composer provides useful prior art, but these
two distinct capabilities do not need a universal composer abstraction.

## Candidates considered and deferred

| Area | Decision and reason to revisit |
| --- | --- |
| Cumulative token costs | Keep for now. Delta arithmetic exists in attempt evidence and conversation aggregation, while archival retains checkpoints. However, settlement, read projection, and archival have different responsibilities, and ticket 91 just localized settlement evidence. Revisit when a change to token categories, baseline trust, or checkpoint semantics requires matching policy edits in multiple owners. Consolidate pure policy then, while retaining workflow-owned transactions. |
| Conversation reader following | Keep for now. The dialog's observer/frame state is intricate, but belongs to its reader lifecycle and has focused race coverage. Revisit when another reader needs the same policy or new following behavior repeatedly touches unrelated dialog commands. |
| Large application/projection modules | Keep. Public authority is explicit and internal workflows have meaningful homes. Splitting by line count would add navigation without demonstrated change locality. |
| Raw SQL and migration infrastructure | Keep. Current migrations, independent schema evidence, recovery backups and startup gates address the previously identified risk. Follow ADR 0017's explicit reconsideration conditions for tooling; this audit did not research current third-party releases. |
| HTTP and runtime adapters | Keep. Typed route registration, separate capability sets, event projection and session-evidence reading provide useful seams. No evidence here calls for another framework or generic abstraction layer. |
| Test organization | Keep the capability-focused suites. Improve fixture contracts instead of splitting files again or creating a generic scenario framework. |

Cost evidence:
[attempt evidence](../../src/application/internal/attempt-evidence-module.ts),
[conversation aggregation](../../src/application/internal/conversation-projection-module.ts),
[archival checkpoints](../../src/application/internal/task-archive-store.ts),
and [completed evidence extraction](../agent-coordination-framework/issues/91-extract-retained-attempt-evidence.md).

## Constraints and acceptance of the proposed pass

- Preserve user-visible behavior, public transport shapes, retained state and
  schema, and existing authoritative transaction ownership.
- Prefer the current public application and rendered-browser test seams.
  Do not add tests for file placement, private hook state, or implementation
  call counts. Add characterization only for a concrete uncovered invariant.
- Each ticket must be independently verifiable and leave changes unstaged for
  user review. No staging, commits, pushes, or unrelated dependency upgrades.
- The composer refactor must reduce caller knowledge; a hook returning every
  internal setter/ref is not completion. Stop and explain if the proposed seam
  cannot hide that knowledge while preserving behavior.
- Keep valid fixture inputs narrow and typed. Avoid a generic deep-merge DSL or
  casts that merely silence the newly exposed errors.

## Verification and limits

- `pnpm.cmd typecheck`: passed.
- `pnpm.cmd test`: 317 tests, 313 passed, four skipped, zero failures; about
  47 seconds. Skipped cases were not exercised by this audit.
- `pnpm.cmd build`: passed.
- Focused browser verification: all 30 tests passed in about 50 seconds across
  task-comment composition, conversation following and token-cost presentation.
  Invocation: `node node_modules/@playwright/test/cli.js test test/browser/task-comment-composition.browser.spec.ts test/browser/conversation-following.browser.spec.ts test/browser/token-cost.browser.spec.ts`.
  The complete browser suite was not rerun for this documentation-only audit.
- The installed `pnpm.cmd exec playwright` invocation could not resolve the
  Playwright executable. The focused run used the installed package's local
  Node entry point instead; no dependency or machine configuration was changed.

This is an evidence-based maintainability survey, not an exhaustive defect,
security, scale/performance, or dependency audit. No live model run was requested.
The recommended pass is an opportunity to improve future edits, not a blocker
on the next feature.

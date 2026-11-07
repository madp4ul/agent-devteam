# Autonomous process assessment

2 November 2026. Assessment and proposals only; the running project, process definition, framework, and Git index were not changed.

## Conclusion

The strongest explanation is **a broken connection between understanding, ownership, and verified follow-through**, rather than an absence of capable agents or a need for more workflow stages.

The Process Steward has identified many of the deeper patterns already. But its involvement is intermittent, its activation depends largely on Product Lead, and its corrections usually end in instructions rather than a measured change in behavior. Some mechanically detectable failures are left entirely to agent memory. Meanwhile, abundant task-specific documentation does not consistently become a reusable decision that the next designer and reviewer apply.

There are two related but distinct problems:

1. **Execution continuity:** a dependency or a statement of remaining work is treated as if it guarantees future execution. Sometimes it cannot: the awaited work needs the waiting agent itself.
2. **Engineering continuity:** a feedback item, a read receipt, a passing test, or an honestly disclosed limitation is treated as if it establishes the intended result. Sometimes it does not answer the user's actual question or carry the underlying principle into the next task.

The recommended direction is a small set of verifiable contracts around those connections, not a wholesale import of every skill or a longer checklist for every agent.

## Scope and evidence

- Located `idle-games` and its sibling `idle-games-agent-coordination-state`; its launcher selects `agent-devteam-processes/Autonomous/process.yaml`.
- Inventoried 284 tasks in the live capture: 251 archived, 33 unarchived. Read the steward's retained history, Product and Integration histories and user messages, selected recent delivery histories, and the exact transcript of the latest stopped integration run.
- Exported retained timelines/comments/activations for 283 tasks from the existing **offline** `coordination.sqlite3.pre-cache-cleanup-2026-11-01T15-00-37Z.sqlite3` copy. Broad analysis is an inventory plus targeted case analysis, not a claim to have read every historical conversation.
- Correlated process Git changes with validation hashes, subsequent activation versions, and restart/read receipts. Git commit date alone is not deployment evidence.
- Compared the repository's development skills and inspected framework continuation, archival, and notification contracts.

Evidence sources: [steward chronology](steward-history.md), [broader patterns](broad-patterns.md), [skills comparison](skill-lessons.md), and [evidence/method notes](evidence.md). References such as **T2/9415** mean task T-0002, comment sequence 9415 in its exported comment file. Timestamps in source records are UTC. Times in the incident narrative below are Berlin time.

### Operational safety and limitations

The source database uses rollback-journal mode. Read-only does not mean zero possible interference: a reader can briefly delay a writer. Live reads used `mode=ro`, `query_only`, zero lock wait, short queries, and a 150 ms SQLite-operation bound. One read encountered a lock and aborted; broad history collection moved to the existing inactive copy. No source mutation, checkpoint, migration, live backup, full integrity scan, application startup, or agent activation was performed. File reads and scratch writes have ordinary I/O cost; zero latency impact was not measured or promised.

The live captures are separate reads, mostly around 19:03–19:09 Berlin, with the specific stopped transcript read afterward. They are **not an atomic snapshot**. The project was progressing during the investigation, so current queue counts are not incident-time counts. We did not intervene in that progress. No downtime is needed for the analysis completed here. Reproducing scheduler changes or manipulating live recovery would be a separate, isolated exercise.

## 1. The latest stop was a continuation failure after a successful run

On 2 November, Integration attempt `b1ae77b3-49d6-47b8-92f9-64c03534c655` ran from 02:04:10 to 02:12:54 Berlin under process version `6cf09a87…`. It ended as **completed**, not a permission failure or runtime crash. Its final response says T278 is incorporated/published at `8eef9ee4`, but the physical pile plus new UI check remains open because the UI fixture bypasses menu-world updates. This is appropriately qualified technical reporting.

However, its retained transcript contains only ordinary coordination comments for that remaining work: no request arranging its next execution and no user-attention handoff. The last comment to T278 explicitly says no specialist rerun was requested. T2's timeline next records an activation and attempt at 18:50 Berlin, after the user's 18:47 complaint. Product's contemporaneous audit reports zero queued/failed activations and identifies the outstanding Ready roots. **The roughly 16 h 37 m gap is an observed absence of T2 attempts, not proof that automation was continuously enabled throughout it.**

Sources: [stopped attempt](../local-evidence/autonomous-process-assessment/stalled-attempt.json), [activation/version](../local-evidence/autonomous-process-assessment/stalled-activation.json), [full run transcript](../local-evidence/autonomous-process-assessment/stalled-transcript.json), [T2 activity](../local-evidence/autonomous-process-assessment/T-0002-activity.json) sequences 20261, 20264–20265; [T2 comments](../local-evidence/autonomous-process-assessment/T-0002-comments.json) 9412, 9415; [T1 comments](../local-evidence/autonomous-process-assessment/T-0001-comments.json) 9414.

The framework explains why its normal recovery did not provide a safety net:

- Ready for Integration has no watcher.
- T2 is watched, but any unresolved outgoing relationship excludes it from stall recovery.
- T2's relationship to T278 was created on 31 October (activity 17859), and T278 still needed T2's check before Completion. The relevant dependency was therefore present before the stopped run.
- Completion would wake the parent, but the parent first had to do the work needed to produce Completion.

This is an **execution dependency cycle**, even though the stored task graph can remain acyclic. Acyclic task relationships do not prove executable progress. The current SQL deliberately treats every unresolved outgoing relationship as a continuation path; it does not prove that the target has an independent executor. See [stall eligibility](../../src/application/internal/stall-recovery-module.ts), lines 10–25.

This is also not evidence that all Ready tasks should simply be marked complete. The missing combined check was real. The correction must continue the check or explicitly surface its blocker, while preserving the acceptance boundary.

The earlier 28 October incident had a different immediate trigger: an integration request omitted the mention because the recipient had been busy. That occurred after the watched-column fix. The latest incident received the request and did substantial work, but then lost continuation **within** the remaining integration responsibility. Fixing incoming handoffs alone cannot cover both cases. [Chronology and corroboration](steward-history.md#four-distinct-liveness-failures-not-one)

## 2. The steward is an event-driven reviewer, not continuous self-healing

The role has genuine analytical capability. It identified invented research gates, requirement narrowing, stale context, dependencies that could not wake their consumer, and technical proxies being mistaken for product outcomes. Some advice demonstrably helped.

But the continuing task normally parks in unwatched Waiting. Product Lead is asked to request assessment, roughly every five root features and once per checkpoint interval. On 27 October the steward found eight checkpoint notices since its previous assessment with no steward requests. An auditor activated by the component it audits has a correlated blind spot. The role also requires user adoption of process changes and does not implement framework changes: it is not authorized as a general automatic repair service.

Proposals are followed by source edits, validation, and occasional adoption checks, but not by a consistent failure-class ledger that asks whether the intended behavior improved under the applied version. YAML validation proves configuration validity. Reading an instruction proves exposure. Neither proves efficacy.

The evidence supports **better coverage and verified follow-through**, not merely telling the steward to think more broadly. Preserve its useful retrospective analysis and independent judgment. See T4/6774, /7199, /7272, /7462, /7861 and [steward report](steward-history.md).

## 3. Knowledge exists, but its application is unreliable

There is substantial project documentation, including workflow, architecture, asset, and UI material on the published branch. The primary idle-games checkout is stale relative to published work; looking only at its few local docs would produce the wrong conclusion. The investigation used Git's published tree for this comparison.

The stronger evidence is that some participants had the instructions and still accepted known mismatches as minor limitations. T179's retrospective audit of T167 found instruction exposure among implementation and reviewers, yet repeated rock motifs and sharper birch imagery were accepted before the user rejected them. Later review on T179 caught related visual defects, which is useful counterevidence against declaring all review ineffective. [Broader patterns](broad-patterns.md)

The user's 1 November spaceship feedback illustrates the desired abstraction precisely: reducing the visible yellow frame was insufficient while empty space remained clickable and the menu anchor still assumed the old size. The reusable rule is about **one coherent asset footprint for presentation, hit testing, and anchoring**, with explicit intentional exceptions. A ticket addressing only the named frame loses that invariant. This report establishes the feedback mismatch, not an independent code-level diagnosis of its implementation. [Product user messages](../local-evidence/autonomous-process-assessment/T-0001-messages.json), 22:09:10 UTC.

Three failures require different remedies:

| Failure | Useful remedy | Insufficient remedy |
| --- | --- | --- |
| The principle was never captured | Record the general rule, rationale, examples, exceptions, and owner in its normal design home | Preserve only the original chat or a task-local correction |
| It exists but is hard to find or stale | A small topic-based index, authoritative links, and branch/version propagation | Add another task-numbered document without navigation |
| It was found but not applied | Review the actual outcome against the principle and classify the mismatch honestly | Add another mandatory read receipt |

Generalization should remain proportional. “Check related consumers of this footprint rule” is useful; “redesign every UI system before fixing the ship” is not. Conversely, a known in-scope mismatch is unfinished work unless the user has accepted the trade-off; merely describing it honestly does not turn it into acceptance.

## 4. Long-lived coordination tasks accumulate special risks

The 21 October audit found T2 with 109 pins/~10,215 words and T1 with 10/~1,373 despite the active 3-pin/500-word rule. Its 30 recent delivery tasks complied. This was concentrated in the tasks that carry the most cross-cutting state, not a universal failure to follow instructions.

The current capture is substantially better: T1 has one pin/96 whitespace-delimited words; T2 four/252; T3 one/66; T4 two/132. T2 still exceeds the count limit by one, but claiming that it still has 109 pins would be false. The stopped attempt reports active context at 387,107/475,000 tokens (81%). That is evidence of a large persistent context, **not proof that context size caused this failure**.

The continuing T2 description still describes r21 while the actual current work is r24. T4's description is dominated by the last allowance-edit problem. Pins and current documents may correct these descriptions, but contradictory entry points increase the effort required to recover the real responsibility.

A compact current-state handoff should be authoritative, with historical evidence behind links. Renewing a conversation can help only after that handoff is trustworthy; blindly resetting context discards useful continuity. [Steward memory audit](steward-history.md#stewardship-itself-is-dependent-on-the-system-it-audits), [captured tasks](../local-evidence/autonomous-process-assessment/tasks.json), [attempt context measurement](../local-evidence/autonomous-process-assessment/stalled-attempt.json).

## 5. Verification can become a substitute for outcome judgment

The evidence does not justify removing independent review. Early reviews caught actual persistence defects, and the latest integrator correctly refused to claim that a plain-backdrop test proved the physical menu experience. Those are protections worth retaining.

The failure is deciding which evidence answers the intended question. Examples already identified by the steward include solver provenance standing in for visually credible piles, soil-mask depth for believable soil, tree counts for forest composition, and static menu frames for usable interaction. The first large physics investigation also developed extensive agent-invented proof gates before delivering the city loop.

A useful verification statement names: **the question, the representative scenario, the observation that would fail it, and the limit of the result**. Evidence for reproducibility and provenance belongs behind that judgment. More hashes, screenshots, or extra stages do not resolve a mismatch in the question itself.

Every bounded investigation should also name the decision it enables and its stop/reframe condition. The skills provide this structure without requiring a user meeting for every step. [Skills comparison](skill-lessons.md), [historical cases](steward-history.md#the-learning-loop-already-names-the-deeper-quality-problem)

## Proposed operating model

These are activities with required outputs, not six new columns or roles. Known-pattern work can combine them.

| Activity | Useful output | Human involvement |
| --- | --- | --- |
| Understand and investigate | Outcome, relevant existing principles, affected family of cases, uncertainties; bounded research when needed | Only unresolved product/authority decisions or costly choices outside the mandate |
| Decide | A reusable rule with rationale, scope, exceptions and representative examples; update its owning guide/index | Adopt genuinely new product principles when necessary |
| Specify and slice | Observable criteria, exclusions, delegated scope, integration consumer and completion meaning | Agree meaningful checkpoint scope, not every engineering slice |
| Implement | Coherent change, verification, and updates to the shared rule/component where appropriate | Routine work stays autonomous |
| Review and integrate | Separate checks against intent and shared conventions; combined evidence; explicit runnable continuation until done | Surface genuine trade-offs, not technical housekeeping |
| Present and learn | One usable checkpoint, unresolved items, and a later check that accepted process/knowledge changes worked | Review the experience and decide the next product direction |

This preserves the strongest Matt Pocock mechanisms: bounded discovery, a durable decision map, synthesis before delegation, vertical delivery slices, and independent intent/standards review. It removes neither engineering judgment nor appropriate user control. It also avoids importing the skills' frequent interactive checkpoints literally. [Detailed comparison](skill-lessons.md)

### A. Make continuation verifiable

For unfinished committed work, retain an explicit next action, responsible participant, and evidence of how that participant can run. Distinguish a queued/running request from a dependency whose producer has no executor. A recipient being busy on unrelated work is not acknowledgment.

Investigate a narrow framework capability for durable handoff/continuation receipt and bounded detection of orphaned execution. Initially expose uncertain cases for inspection; do not auto-complete features, bypass genuine user waits, or indiscriminately wake every agent with a dependency. A process convention alone is useful as a temporary measure but has already failed as the only guarantee.

Consider finite integration/checkpoint work beneath the continuing integration responsibility. Product should not depend solely on Completion of a task that is intentionally ongoing. Merely introducing a finite task does not solve continuation: its executor and wake path must still exist. T1 acquired a dependency on continuing T2 during the latest recovery, so that distinction is directly relevant (T2 activity 20267; Product explicitly also requested a readiness report).

### B. Make decisions reusable at their point of use

Use existing documentation rather than starting a competing knowledge system. Add a compact topic index only where navigation is missing. For a recurring issue, retain the family of cases, invariant, rationale, examples/counterexamples, source decision, and authoritative implementation owner. A later designer should identify why it applies; a reviewer should check the actual result.

For visual work, include representative positive and rejected examples in the applicable design guide. For functional work, use observable behavior checks at the shared boundary. Keep effort-specific specifications separate from durable design principles. Archive task evidence without making it the only home of the rule.

### C. Give stewardship an independent, bounded feedback loop

An overdue checkpoint assessment or orphaned execution condition should be observable independently of Product Lead remembering to request it. Keep the assessment asynchronous and avoid routine notifications when nothing changes. Record each correction as hypothesis → adopted version → eligible subsequent cases → observed result. Include successful cases, new requirements, and legitimate pauses, not just complaints.

Maintain separate categories for permission failures, lost continuation, acceptance errors, missing/retrieval/application knowledge, and verification cost. Otherwise the next frustration can produce another unrelated paragraph in global instructions.

### D. Evaluate before broad rollout

First replay the known historical incidents offline. Then, if adopted, observe ordinary work over one agreed checkpoint and the next few relevant deliveries. The user previously preferred retrospective observation to manufactured live trials; honor that preference. Suggested measures are:

- Committed unfinished work with neither executable continuation nor a concrete user decision; count legitimate pauses separately.
- User wake-up interventions, and where the execution chain stopped.
- Repeated corrections to an already accepted principle, separated from genuinely new feedback.
- Whether a fresh task found and applied the relevant prior decision.
- Steward coverage and recurrence under each applied version.
- Verification/review effort relative to meaningful outcome; do not optimize by suppressing useful reviews.

Initial success criteria: the known stop patterns are detected in offline fixtures; a genuine user wait remains a wait; duplicate observations do not create duplicate work; and a later related task demonstrates reuse of the chosen design rule. A small successful pilot supports expansion, not a claim of permanent self-healing.

## Retention and what remains uncertain

Archival really does delete run transcript items and authored conversation messages in this framework. It retains task comments, activity, attempts, and conversation metadata/cost snapshots. See [archive store](../../src/application/internal/task-archive-store.ts), lines 181–205. The user did not erase all useful evidence: the retained histories were enough to establish the main continuation failure and assess several earlier corrections. We have not restored any archived task or historical database.

We cannot establish a complete recurrence rate for all subjective feedback, recover every archived conversation, or prove what the model internally understood. We did not inspect the user's browser notification permission or delivery history. Delivery Ready notifications are disabled in the captured policy, while Product Checkpoint/User Review are enabled; that configuration explains why parking a delivery root is not a user notification, but does not prove an OS notification bug.

The concrete next work is captured in [the map and proposed follow-up tickets](map.md). No repair has been deployed. The research is complete for this assessment; the proposed changes and their effectiveness remain to be designed, adopted, and verified.

# Steward history and process-change chronology

Research date: 2 November 2026. This report reads only the already captured JSON evidence in this directory and Git history of `agent-devteam-processes`. It did not query the live database, run agents, contact participants, or alter the process. All timestamps below are UTC as retained in the records (add one hour for Berlin after 25 October, two hours before).

## Main finding

The steward has repeatedly understood problems at a useful systemic level. It identified requirement narrowing, invented proof gates, acceptance by technical proxies, missing continuation, stale coordination context, and assessment starvation. The evidence therefore does **not** support simply concluding that the steward lacks a top-down view. The stronger diagnosis is that this view is intermittent and its recommendations have no reliable closed loop from adoption through behavior to observed outcome. The same Product Lead whose missed duties need detecting also owns waking the steward. Long-lived coordination tasks concentrate memory and handoff failures. Prose rules improve behavior sometimes, but are treated as the primary defense even for mechanically detectable violations.

This is an inference from the specific evidence below, not a proven universal explanation or a claim that every later stall has the same cause.

## Evidence conventions and limits

`T4/4777`, for example, means `../local-evidence/autonomous-process-assessment/T-0004-comments.json`, record `sequence: 4777`; the immutable ID is also supplied for decisive records. T1 and T2 refer to the corresponding comment files. These are local, bounded evidence exports, not an atomic database snapshot. Original archived transcripts were not recovered for this study. Steward reports are attributed observations; where separately checked against another captured source, that corroboration is stated. A steward saying it read code/images is not a new independent code/image review by this researcher.

Sources:

- [Steward comments](../local-evidence/autonomous-process-assessment/T-0004-comments.json), [authored messages](../local-evidence/autonomous-process-assessment/T-0004-messages.json), [activation versions](../local-evidence/autonomous-process-assessment/T-0004-activations.json).
- [Product comments](../local-evidence/autonomous-process-assessment/T-0001-comments.json), [Integration comments](../local-evidence/autonomous-process-assessment/T-0002-comments.json).
- Process repository commits `ae1e86690b5f1c9e70ba314dd7ade4c12b9efc63`, `f6d85cc0fca3325df9ba5095391f5b722f07d2d0`, `a9b5368f0abafe56cc5e43c91b4a46526f9f01cf`, `71032aa6d24139eee5425122e86eaaae8751eb09`.

## Changes must be evaluated by applied version

| Event and effective evidence | What changed or was learned |
| --- | --- |
| 12 Oct 17:27, T4/180; user confirms restart at 18:08, T4/187; subsequent activation version `ab8e4c19491a…` | Avoid duplicate watcher/self/future-stage mentions. Helpful, but later agents overgeneralized duplicate suppression to a recipient being busy with unrelated work. |
| 13 Oct 12:12, T4/928, `90a15b14-bad4-441e-addb-9eddb402a893`; validation `b1d50c268eb4…`; activation by 21:30 uses it | Research exit criteria, requirement-versus-hypothesis provenance, cohesive experiments. T12 had nine Implementation-to-Design returns and 35 experiment/evidence children; the ten-hour status still lacked the city loop. This is a reported historical count, not independently recomputed here. |
| 13 Oct 21:34–21:58, T4/1137–1156; Git `ae1e866` at 14 Oct 00:03 Berlin | Initial over-specific requirements/checklist rewrite rejected by user and reverted. Narrower accepted change caps pins at 3/500 words, moves overflow to repository docs, retains every checkpoint feedback point as acceptance criteria, and requires checkpoint comparison. Subsequent T4 activations from 17 Oct use `afb6fb37c999…`. Do not attribute outcomes to the rejected draft. |
| 21 Oct 21:05, T4/4803, `2291fb58-59cd-4612-a5d8-8884bf473905`; validation `f7b017e2fd6b…`; T4 activation 27 Oct uses it | Separate verified local feature completion from remote publication, batch readiness and human acceptance; Integrator reconciles statuses before parking. Source edits alone were explicitly not a reload. |
| 27 Oct 23:03, T4/6796, `74d82f9e-9122-44de-ab5b-9b607b98db74`; validation `905f2bdc41f5…`; 28 Oct T4 activations use it | Per-checkpoint stewardship, watched Product/Integration while work remains, bounded shared-path consistency. T1/T2 moved into watched columns. Git `f6d85cc` on 28 Oct combines this with the earlier completion change. |
| 28 Oct 18:10, T4/7199; approval/application 30 Oct 22:27, T4/7605 (`b12d6f70-3779-4230-bc25-f792660dd3cb`) | Distinct actionable Ready handoff must create its own durable request even if Integrator is busy. Validation `dab2bfaedb13…`; this was still pending during the 28 and early 30 Oct assessments. Git `a9b5368` later includes handoff and origin-allowance work. |
| 31 Oct 01:37 onward, T4 activations `5409834098e8…`; T4/7845 attributes a restart to user | Origin allowance revision is now represented in activation evidence. Later `71032aa` broadens backup permission. Current root capture reports `6cf09a87…`; this report does not reconstruct every intervening runtime adoption. |

Git commit dates are not deployment dates. The source can be edited before commit, and old sessions can read approved source without a host reload. The strongest temporal evidence here combines exact validation hashes, subsequent activation versions, and explicit read/restart receipts; none proves every model retained every instruction after compaction.

## Four distinct liveness failures, not one

1. **Completion coupled to publication, then override lost.** T4/4791 (`15f7ef6d-9c5c-41ef-bcb9-433b001f604a`, 21 Oct 20:59) identifies 19 roots held for remote publication, then eight more held after local checks closed. Independently retained T2/4451 (`4bd6c8ad…`, 16:46) corrects T135–140/T142–154, and T2/4758 (`edf1b07e…`, 19:22) corrects T157–164. First incident followed the then-literal publication gate; the second failed to carry the local-completion override forward. Required task moves had not happened; no evidence that Completion events were lost. The same report explicitly distinguishes a separate T156 framework dispatch problem.

2. **Dormant column hides unfinished ownership.** T4/6774 (`0a6cbc6d-95d8-46dd-8a9b-ab3e6bc4e1d3`, 27 Oct 22:59) reports T1 in Waiting, idle, with no queued work, unresolved dependency or attention. T1/6726 (`cdf0e0a3…`, 22:44) independently records the user's “Nothing's happening” wake-up. No watcher means no stall recovery. The 27 Oct rule change addresses this case.

3. **Circular continuation despite watched ownership.** T4/7199 (`5a048152-9f1d-4fe6-8c77-6161574c2cde`, 28 Oct 18:10) reports: T236 Ready at 17:48:36.664; T2 last run ended 17:48:46.563; Ready notice at 17:48:49.584 omitted a mention because an earlier observation showed T2 busy. T2/7193 (`aea073fa-e978-439c-a19a-a6612abe300c`) independently contains that rationale and the actionable integration request. No activation was created for that ordinary comment. T2's unresolved dependencies suppressed recovery, while those children needed T2 integration before they could complete. This happened under `905f2bdc…`, so the watched-column correction alone demonstrably did not close this failure class. The steward explicitly corrected its earlier incomplete explanation. It found no dropped/coalesced activation.

4. **External publication permission blockage.** The 30–31 Oct history identifies actual auto-review rejections, including obsolete publication holds and disputed origin authorization. These are distinct from forgotten board transitions. T4/8122 (31 Oct 11:51) records Integrator's successful, approved push with fresh main/integration refs `032aeb5a…` after a targeted clarification. A source-edit permission result did not test network publication; the user later complained about this distinction being poorly explained (T4 authored message `720fc39a…`, 31 Oct 12:30).

Later wake-ups remain important but are not automatically the same cause: T1/8128 (31 Oct 12:06), /8621 (31 Oct 23:43), /8747 (1 Nov 05:05, T283 stuck in a user column), and /9414 (2 Nov 17:47, incomplete tasks/open dependencies). These corroborate continued user burden after process edits. Exact later handoff traces are needed before attributing each to a specific failure class.

## The learning loop already names the deeper quality problem

- **Requirement narrowing:** T4/1137 (`44620510…`, 13 Oct) says large pins preserved text while smaller briefs became de facto authority. A no-settlement rule for unattended city areas narrowed into worker-only cases; prepared scenes passed without covering the original lifecycle. The report carefully separates older requirements from newly clarified credit timing/geometry.
- **Method awareness exists, but is uneven:** T4/3676 (`b2c1d3c1-7c41-42f6-83b4-de2b9cb39c28`, 18 Oct) reports a retrospective sample of five participants across implementation, review, design and integration, checked against pre-contact history. All knew structured feedback; several had not read literal original feedback, one acknowledged a truncated read, and none could isolate documentation's causal effect. Ordinary workflow and downstream catches improved, but first handoffs still missed representative recovery and visual state contradictions. The user explicitly preferred observation over a prospective special trial (T4/3664).
- **Known mismatch accepted as limitation:** T4/7272 (`4734367b…`, 28 Oct) reports reviewers accepted artificial curved bands despite recognizable-rock intent, and ordered geometry despite a mixed-pile aesthetic question. Honest disclosure did not make the requested outcome delivered. This is judgment/acceptance failure even when documentation was read.
- **Local repair misses general inference:** T4/7462 (`7a543cbd…`, 30 Oct) credits replacement of ordered boxes by real physics/mixed geometry, but finds that solver provenance still did not prove visibly credible settled support. The specific fixture improved; the general principle “evidence must answer the user's actual question” still failed.
- **Recurrence across media and flows:** T4/7861 (`9f1be099…`, 31 Oct) reports soil mask depth standing in for believable soil, tree count/scale standing in for forest composition, and static no-clipping menu images standing in for usable transitions. The steward explicitly says another catalogue/checklist would not fix the reasoning. It also identifies new stronger user requests rather than counting every revision as an old miss.

Inference: the reusable unit of learning should be a decision and its applicability, rationale, representative verification, and rejection conditions. A growing list of task-specific corrections or mandatory “read” receipts does not establish that a later agent recognizes the same problem class.

## Stewardship itself is dependent on the system it audits

T4/4777 (`9c441278-3225-4520-87b0-7dc7a9c0c0f7`, 21 Oct) verifies the active `afb6fb37…` context already contained the pin rule. Nevertheless T2 had 109 pins/~10,215 words, and T1 had 10/~1,373 plus obsolete setup statements. The other 17 unarchived tasks and all 30 recent delivery tasks T135–164 met numeric limits. This concentrates the failure in long-lived coordination contexts; it is not evidence that every agent ignored guidance. T2/T1 corrections were recorded and originals preserved. The audit also reports Maintainability had not been requested after 13 Oct despite at least 50 subsequent completed roots.

T4/6774 reports eight r10–r17 checkpoint notices since 21 Oct with zero Steward requests. Captured T4 activations independently show no activation between 21 Oct 21:04 and 27 Oct 22:57. After the cadence fix, interval requests arrive on 28, 30 and 31 Oct; that is real improvement. The captured T4 activation list ends at 31 Oct 12:30 while later Product wake-ups continue. Whether later work constituted new checkpoint intervals requires checking Product records; absence alone does not prove another cadence violation.

Inference: a correction that only asks Product to remember to call the auditor leaves correlated failure intact. A bounded independent assessment trigger, or an observable overdue assessment condition, would cover this blind spot without making stewardship a delivery approval gate. The current “continuing” task is event-driven, not continuously running.

## Recommendations supported by this history

1. Separate product outcomes, coordination liveness, knowledge reuse and external permission incidents in the assessment ledger. Preserve the causal class and applicable process version so a new symptom does not produce another unrelated prose patch.
2. Make high-confidence mechanical conditions observable: actionable Ready handoff without durable recipient work, unresolved integration-dependent children with no runnable consumer, overdue stewardship coverage, and pin-limit violations. Do not auto-complete features merely from Git ancestry or queue agents repeatedly without new evidence.
3. For each adopted correction retain a falsifiable expectation and later outcome: source applied, runtime/session adoption evidence, representative post-change cases, recurrence/nonrecurrence and unresolved limitations. Validation of YAML proves configuration shape, not behavioral efficacy.
4. Keep assessment asynchronous, but give it a trigger independent of Product's memory. Analyze both symptom episodes and successful matched cases; use the user's preferred retrospective observation where possible.
5. Strengthen the existing design/review result around problem-class recognition: relevant prior decision, why it applies, representative evidence for the actual user outcome, and explicit non-delivery when known mismatches remain. Avoid expanding every task into a mandatory sequence of research roles or human approvals.
6. Reduce human-facing reports to the concrete problem, evidence, proposed change and decision required. T4/999 (13 Oct), /3664 (18 Oct), /7459 and /7466 (30 Oct) explicitly request shorter, readable explanations. The long record is useful audit evidence; it should not be the user's approval interface.

No process edits are proposed as already authorized by this report, and no runtime corrective action was performed. These findings support design work and a measured rollout rather than a claim that the running system is repaired.

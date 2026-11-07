# Autonomous process assessment map

## Current discussion — read before earlier proposals

**Latest:** [Product-owned main, integration responsibilities and parallelism](discussion-addendum-product-main.md).
The user proposes Product owning main and checkpoint-specific integration branches,
is exploring specialized repair/merge roles and flows, and prefers completed-task
consultation for questions only. These decisions are still being worked through.

[Third reported checkpoint stall](stall-20261105T205427Z/incident.md): directly
captured while quiescent. An integration correction returned without a mention
or lifecycle transition, leaving no activations. This is a concrete case for
finite correction handoffs in the redesign; live state was not changed.

[November 5 discussion handoff](discussion-handoff-2026-11-05.md) records the
user's rejection of recursive recovery based on unwatched children, the intended
meaning of user columns, and the emerging finite checkpoint-integration model.
It supersedes conflicting recommendations in the earlier assessment and recovery
tickets. Board design, branch/publication ownership and migration remain open;
no lifecycle redesign has been applied.

## Destination

Understand why autonomous Idle Games delivery repeatedly needs user correction, relate incidents to applied process changes, and propose a small set of structural improvements that preserve autonomy and reliable user review.

## Original brief

The user requested a broad investigation beginning with the Process Steward's continuing assessment, using retained task timelines and unarchived conversations, without interfering with the running project. Specific concerns: work stops before review/notification; agents solve narrow cases without understanding broader patterns; decisions fail to become findable knowledge; process edits have not reliably prevented recurrence. Compare the repository's Matt Pocock skills while avoiding their excessive human micro-checkpoints. Scratch documentation was authorized. Live process/framework changes were not requested.

## Decisions so far

- [Assessment](assessment.md): strong evidence for execution-continuity and decision-application gaps; no evidence that adding more stages alone will solve them.
- [Steward chronology](steward-history.md): several useful systemic diagnoses already exist; coverage and adoption-to-outcome verification are weak. Distinguish the different stall mechanisms.
- [Broad patterns](broad-patterns.md): documentation and useful reviews exist; do not equate more records with applied knowledge or all review returns with waste.
- [Skill lessons](skill-lessons.md): adapt durable discovery/decision/specification/slice/review mechanisms without copying every user checkpoint.
- [Evidence](evidence.md): bounded read-only capture, inactive historical copy, non-atomic live reads, no live mutations. Concrete latest stop corroborated by transcript and framework source.

## Proposed follow-through

These are unclaimed, open follow-up proposals, not approved process changes or a promise that the system is fixed.

| Ticket | Type | Blocked by | Outcome |
| --- | --- | --- | --- |
| [01](issues/01-continuation-contract.md) | research | — | Define a testable continuation/handoff contract and offline incident fixtures |
| [02](issues/02-continuation-safety-net.md) | task | 01 | Implement the agreed narrow framework safety net with regression coverage |
| [03](issues/03-reusable-decisions.md) | prototype | — | Demonstrate retrieval and application of one reusable design principle |
| [04](issues/04-steward-feedback-loop.md) | research | 01 | Design independent assessment coverage and versioned correction evaluation |
| [05](issues/05-observe-adopted-changes.md) | task | 02, 03, 04 | Observe adopted changes in ordinary work and evaluate efficacy |

Do 01 first because it addresses demonstrated lost execution; 03 can proceed independently. Settle adoption and implementation details in the relevant ticket before changing the running process. Follow existing Git ownership: leave local changes unstaged for user review.

## Authorized process revision

The user subsequently authorized changes to the process. The source revision
implements process-level continuation ownership, shared-rule discovery and
review, explicit acceptance distinctions, and a second stewardship coverage
route through Integrator. See [revision notes](process-revision.md).
It does not implement the framework safety net, an independent assessment timer,
or the decision-reuse experiment, and does not establish runtime adoption or
behavioral efficacy. The follow-up tickets remain open for that work.

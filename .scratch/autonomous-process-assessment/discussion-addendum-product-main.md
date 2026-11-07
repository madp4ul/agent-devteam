# Latest discussion: Product-owned main and integration work structure

Recorded immediately on 5 November 2026 at the user's request before context
compaction. Read together with [the main discussion handoff](discussion-handoff-2026-11-05.md).
These are discussion notes, not an approved specification or implemented change.
No process, Git branches, task state or running agents were changed for this note.

## 1. Product Lead owning main

The user proposes making the continuing Product Lead task the owner of main.
Their motivation: Product would then have the most current project state readily
available. They explicitly like finite integration tasks having their own branch
for the sprint/checkpoint.

This refines the earlier proposal of each integration task publishing main itself.
Candidate shape to examine next:

- Product task owns the main checkout and its update/publication responsibility.
- Each checkpoint integration task owns a unique integration branch and finite
  integrated-result obligation.
- Integration Completion wakes Product, which consumes the reviewed integrated
  result into main and presents the checkpoint.
- Old integration worktrees can remain on their own branches after Completion.

Do not treat all details of this candidate as settled. Questions to resolve:

- Does "owner of main" mean sole local checkout owner, sole remote publisher,
  or both? Existing process authorizes only shared Integration to publish main;
  adopting the new model requires a deliberate authority/process revision.
- Main ownership alone does not automatically make Product's checkout current.
  Define when and how it receives integration commits and whether "most current"
  means latest accepted main or latest in-progress integration work.
- The user previously wanted ready features merged promptly, without waiting
  for all siblings. Does prompt incorporation mean into the checkpoint branch,
  or incremental main updates during the checkpoint too? A main update only at
  checkpoint Completion could otherwise recreate the batch delay in another form.
- If incremental main updates are desired, define a reliable finite handoff or
  event to Product without depending on the unfinished checkpoint task's eventual
  Completion for each increment. Do not assume a Git push itself activates Product.
- Keep updating main, remote backup and replacing a running user-review build
  distinct. Preserve explicit holds on the user's current game/session.
- Determine how the existing primary checkout's main ownership transfers safely;
  do not assume Product can check out a branch already held by another worktree.

The user asked whether this would be useful; they have not yet received a worked
answer to this new proposal. Next response should engage with its benefits and
trade-offs instead of merely repeating the older unique-branch suggestion.

## 2. Integrator understanding, diagnosis and division of responsibilities

The user observes that Integrator already needed considerable feature/context
understanding to identify the failed check and craft the detailed correction
request. Delegating after acquiring that understanding may duplicate effort.
Diagnosis can be legitimate integration work, while implementing a fix might
distract from coordination. The user is uncertain where to draw the boundary.

They propose considering a separate agent for merge-conflict resolution, distinct
from the agent coordinating/delegating integration subtasks. This is exploratory,
not a decision to add another mandatory role.

Preserve the user's competing concern: more delegation reframes information and
can lose context. Do not optimize for maximum role separation or parallelism.
Consider the actual work types separately:

- Mechanical merge/conflict resolution and source incorporation.
- Combined verification and first-failure triage.
- Substantive production or test-fixture correction.
- Checkpoint scope, dependencies, completion and user handoff coordination.

Open design questions: which small repairs can the current integrator do directly,
which merit another participant in the same task/worktree, which merit a separate
task, and which require independent review? A dedicated merge specialist should
have a demonstrated responsibility benefit rather than add another forwarding
step. Diagnosis need only make a delegated problem actionable; the receiving
agent should verify hypotheses instead of inheriting them as facts.

## 3. Specialized flows and parallelism

The user is open to any of these placements for the observed fixture correction:

- Another agent on the checkpoint integration task.
- A separate task on a specialized Integration board.
- Another Delivery task, if that flow actually suits the work.

They explicitly question routing a small bug fix or merge repair through the
whole Design -> Implementation -> Quality -> Review -> Verification sequence.
They are open to customizing boards, responsibilities and flows by work type.
Do not treat the present Delivery pipeline as a fixed constraint or replace it
with an equally universal integration pipeline.

Parallelism is an open question to evaluate, not an assumed objective. Relevant
existing mechanics and implications:

- Only one agent runs on a given task at a time. Another participant on the same
  integration task can use that task's workspace but cannot provide concurrent
  work on it; conversational memory remains participant-specific.
- Separate tasks have separate worktrees and can support independent source
  corrections concurrently. They need a precise integration baseline, ownership
  boundaries, reviewed commits and a completion callback to the integration owner.
- Overlapping edits to the same integration branch or closely coupled conflicts
  can make parallel correction counterproductive. Merge application to one branch
  needs serialized ownership even when preparation can run concurrently.
- Native/GPU/shared-host checks may need serialization independently of whether
  source investigation and repair are parallel. Resource scheduling must not
  recreate passive parking in unwatched columns.
- Existing user philosophy remains: agent-owned work stays executable or waits
  on a real dependency; unwatched stages represent user input, not informal
  resource queues.

Next design should compare a small sequential correction within the integration
task with a finite independently executable correction task. Use actual examples
and dependency/ownership costs rather than adding roles speculatively.

## 4. Consulting completed tasks

The user agrees that the original implementer can be consulted when a specific
uncertainty arises. They believe agents can be contacted on completed tasks and
want to use that capability **for answers, not for assigning new work there**.

Record this as a preferred process boundary: completed task participants supply
historical rationale/clarification; new implementation or correction belongs to
the active integration responsibility or a new finite task. Do not silently
repurpose a completed task as the work container for the next repair. The existing
framework permits mentions on mapped completed tasks; archived tasks are read-only,
so consultation availability must not be assumed after archival.

## Evidence behind the discussion

The [latest incident](stall-20261105T205427Z/incident.md) involved a narrow fixture
change: replace update-call-count readiness waits with bounded elapsed-time waits
and retain pre-assert diagnostic state. The original implementer had familiarity
with the fixtures and recent timing problems. We cannot measure the advantage
from the retained record alone.

Integrator's request already identified the failing check, source location,
logs/image, tentative hypothesis, required diagnostic change, four scenarios to
preserve, baseline and validation boundary. A different implementer could likely
handle it from that brief and source inspection. This is an assessment of handoff
sufficiency, not proof that another agent would be equally fast or correct.

## Resume instructions

Preserve all previous rejected directions and accepted principles from the main
handoff. Do not implement recursive recovery of parents merely because children
occupy unwatched columns. Do not mutate the still-live stalled project or start
agents under the guise of investigating it.

The immediate request was documentation before compaction. Next continue design
from Product-owned main, finite checkpoint integration branches, correction
ownership, specialized flows and selective parallelism. Resolve the important
choices before presenting a process rewrite as agreed. Existing source revisions
remain separate from these unimplemented design proposals.

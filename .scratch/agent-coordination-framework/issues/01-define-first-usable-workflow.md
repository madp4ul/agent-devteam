# Define the First Usable Workflow and Success Criteria

Type: wayfinder:grilling
Status: resolved
Blocked by:
Parent: ../map.md

## Question

What exact end-to-end software-development workflow must the first usable
version support, and what observable result will show that the framework is
useful enough to take into specification?

## Answer

The first usable workflow is:

`Backlog -> Architecture Design -> Implementation -> Code Review ->
Architecture Verification -> Awaiting User Approval -> Ready to Merge -> Done`

`Backlog` and `Awaiting User Approval` are process-defined unwatched columns.
`Done` is the framework-owned, permanently unwatched Completion column. Five
distinct agents watch the active columns:

- The Architecture Designer creates the architecture plan.
- The Implementation Agent implements it.
- The Code Reviewer reviews correctness and code quality.
- The Architecture Verifier independently checks the reviewed implementation
  against the architecture plan.
- The Merge Agent integrates the approved work.

The Architecture Designer and Architecture Verifier have separate identities
and stage-specific goals. Their definitions may duplicate common architectural
instruction text; reusable or shared instruction composition is not required.

A task enters through `Backlog` with clear behavioral requirements and
acceptance criteria but no prescribed technical design. The user starts agent
work by moving it to `Architecture Design`. This deliberate movement lets tasks
wait in the backlog until the user is ready.

The Architecture Designer records a structured architecture plan that covers
the proposed approach, affected modules, boundaries and constraints, expected
verification, risks, and trade-offs. It includes a changeability assessment:

- likely dimensions of future change that should remain inexpensive;
- assumptions considered stable enough to optimize around;
- deliberate constraints that make other changes harder; and
- the architectural choices that follow from those judgments.

No separate `Ready` column is reserved for repository setup. The exact point at
which the task workspace and process-defined branch are created remains a
separate decision.

Each agent is instructed by this process to leave a task comment containing its
work result or summarizing and pointing to the authoritative repository
artifact. This is a convention of the example process, not a framework-enforced
documentation format.

Column movement transfers primary responsibility. A mention requests bounded
assistance without transferring responsibility, so the task stays in its
current column during consultation.

Code Review has two normal outcomes:

- Approval moves the task to `Architecture Verification`.
- Requested changes are documented and move the task to `Implementation`.

Architecture Verification has three outcomes:

- Approval is documented and moves the task to `Awaiting User Approval`.
- An implementation revision is documented and moves the task to
  `Implementation`.
- An architecture revision is documented and moves the task to
  `Architecture Design`; after revising the plan, the Architecture Designer
  moves it through Implementation again.

Every revised implementation passes through Code Review and Architecture
Verification again. The ordering makes Architecture Verification the final
technical gate over the code-review-approved result.

At `Awaiting User Approval`, automation stops. The user reviews the task history
and repository changes, then authorizes integration by moving the task to
`Ready to Merge`. The Merge Agent records and verifies the integration before
moving the task to `Done`.

The primary proof is a real, nontrivial repository change that:

- has clear behavioral acceptance criteria;
- crosses at least two existing module or component boundaries;
- admits more than one reasonable design;
- has a plausible future-change dimension; and
- fits within one Implementation Agent's context without child tasks.

After the user starts it, the task must reach `Awaiting User Approval` through
automatic activations and agent-controlled handoffs without manual prompting or
routing. Its task history and repository artifacts must let the user understand
and approve the result, after which the authorized merge must reach `Done`.

The proof must also include:

- at least one successful revision loop through Implementation, Code Review,
  and Architecture Verification; and
- a cross-stage mention round-trip in which the Code Reviewer asks the
  Architecture Designer to clarify the recorded plan, the Architecture
  Designer responds and mentions the Code Reviewer, and Code Review resumes
  without moving the task out of its column.

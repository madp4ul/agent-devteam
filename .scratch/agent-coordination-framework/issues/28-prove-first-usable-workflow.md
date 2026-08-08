# 28 — Prove the First Usable Workflow

**What to build:** The assembled local product demonstrates the complete
architecture-led development process on a real nontrivial repository change,
including automatic handoffs, visible rework, cross-stage consultation,
explicit user approval, integration, and Completion.

**Blocked by:** 20 — Consult Agents and Notify the User; 21 — Split, Relate, and Unblock Work; 24 — Recover Failed and Permission-Blocked Attempts; 25 — Interrupt Tasks and Pause the Process; 26 — Evolve Process Definitions Safely; 27 — Archive Tasks Without Losing Work; 38 — Separate Framework, Process, and Role Instructions

**Status:** ready-for-agent

- [ ] The example process provides Backlog, Architecture Design,
  Implementation, Code Review, Architecture Verification, Awaiting User
  Approval, Ready to Merge, and the framework-owned Completion column with the
  agreed watched and unwatched assignments.
- [ ] Distinct Architecture Designer, Implementation Agent, Code Reviewer,
  Architecture Verifier, and Merge Agent roles have focused instructions and
  discoverable summaries.
- [ ] The Architecture Designer records approach, affected modules, boundaries,
  constraints, verification, risks, trade-offs, likely change dimensions,
  stable assumptions, and deliberate constraints.
- [ ] The proof task has clear behavioral acceptance criteria, crosses at least
  two existing module boundaries, admits multiple reasonable designs, includes
  a plausible future-change dimension, and fits one Implementation Agent
  context.
- [ ] After the user moves the task out of Backlog, normal activations and
  agent-controlled handoffs reach Awaiting User Approval without manual routing
  or prompting.
- [ ] The proof completes one requested-change loop through Implementation,
  Code Review, and Architecture Verification before technical approval.
- [ ] The Code Reviewer consults the Architecture Designer through a mention,
  receives a reply mention, and resumes Code Review without moving the task
  during the round-trip.
- [ ] Example agents use canonical `@participant-id` tokens only when requesting
  a new response. Descriptive references, negative findings, and completed
  handoffs use plain display names and create no accidental, repeated, or
  self-targeted activations.
- [ ] Automation stops at Awaiting User Approval until the user reviews task
  history and repository changes and moves the task to Ready to Merge.
- [ ] The Merge Agent records and verifies process-directed integration before
  moving the task to Completion.
- [ ] A small browser acceptance suite verifies the assembled board, adapters,
  database, scheduler, real Git behavior, and controlled Codex runtime across
  the proof plus representative failure, pause, interruption, and archival
  scenarios.
- [ ] The local containerized deployment, example process, operating procedure,
  backup and restore guidance, and known first-version boundaries are documented
  sufficiently for user review.

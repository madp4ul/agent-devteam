# 28 — Prove the First Usable Workflow

**What to build:** The assembled local product demonstrates the complete
architecture-led development process on a real nontrivial repository change,
including automatic handoffs, visible rework, cross-stage consultation,
explicit user approval, integration, and Completion.

**Blocked by:** 20 — Consult Agents and Notify the User; 21 — Split, Relate, and Unblock Work; 24 — Recover Failed and Permission-Blocked Attempts; 25 — Interrupt Tasks and Pause the Process; 26 — Evolve Process Definitions Safely; 27 — Archive Tasks Without Losing Work; 38 — Separate Framework, Process, and Role Instructions

**Status:** resolved

- [x] The example process provides Backlog, Architecture Design,
  Implementation, Code Review, Architecture Verification, Awaiting User
  Approval, Ready to Merge, and the framework-owned Completion column with the
  agreed watched and unwatched assignments.
- [x] Distinct Architecture Designer, Implementation Agent, Code Reviewer,
  Architecture Verifier, and Merge Agent roles have focused instructions and
  discoverable summaries.
- [x] The Architecture Designer records approach, affected modules, boundaries,
  constraints, verification, risks, trade-offs, likely change dimensions,
  stable assumptions, and deliberate constraints.
- [x] The proof task has clear behavioral acceptance criteria, crosses at least
  two existing module boundaries, admits multiple reasonable designs, includes
  a plausible future-change dimension, and fits one Implementation Agent
  context.
- [x] After the user moves the task out of Backlog, normal activations and
  agent-controlled handoffs reach Awaiting User Approval without manual routing
  or prompting.
- [x] The proof completes one requested-change loop through Implementation,
  Code Review, and Architecture Verification before technical approval.
- [x] The Code Reviewer consults the Architecture Designer through a mention,
  receives a reply mention, and resumes Code Review without moving the task
  during the round-trip.
- [x] Example agents use canonical `@participant-id` tokens only when requesting
  a new response. Descriptive references, negative findings, and completed
  handoffs use plain display names and create no accidental, repeated, or
  self-targeted activations.
- [x] Automation stops at Awaiting User Approval until the user reviews task
  history and repository changes and moves the task to Ready to Merge.
- [x] The Merge Agent records and verifies process-directed integration before
  moving the task to Completion.
- [x] A small browser acceptance suite verifies the assembled board, adapters,
  database, scheduler, real Git behavior, and controlled Codex runtime across
  the proof plus representative failure, pause, interruption, and archival
  scenarios.
- [x] The local containerized deployment, example process, operating procedure,
  backup and restore guidance, and known first-version boundaries are documented
  sufficiently for user review.

## Answer

The software-delivery example now defines the complete architecture-led route,
requested-change return path, in-place design consultation, hard user-approval
gate, and verified merge handoff in its process and focused role instructions.
The operating procedure supplies a concrete cross-module proof task, live-run
checklist, recovery rehearsal, backup and restore link, and known boundaries.

The browser proof drives the real example through nine controlled runtime
activations in an actual detached Git task workspace: design, first
implementation, review consultation, designer reply, requested revision,
reimplementation, approval review, architecture verification, and merge. It
routes every agent comment and movement through an authenticated project-scoped
adapter and asserts that Awaiting User Approval remains inert until the browser
user moves the task to Ready to Merge. The Merge Agent then commits the verified
files, fast-forwards the fixture project's real `main`, reruns its check, and
moves the task to Completion. The surrounding browser suite covers failure,
permission recovery, pause, interruption, relationships, and archival.

The ticket's containerized-deployment wording is satisfied by the accepted
host-native replacement rather than by adding Docker deployment. ADR 0002 and
ADR 0004 supersede that older constraint because Codex, Git worktrees, project
state, credentials, and user permissions must share the host environment.

Verification completed with TypeScript typechecking, a production Vite build,
and 142 local tests (141 passed and the opt-in real-Codex test intentionally
skipped). The new proof and the focused interruption and relationship browser
scenarios pass. A full 39-test Playwright run passed 38 and exposed the existing
order-dependent relationship fixture assumption; that same relationship test
passes in isolation and is outside this ticket's delta.

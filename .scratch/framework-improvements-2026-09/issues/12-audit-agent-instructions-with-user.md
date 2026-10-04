# 12 — Audit agent instructions for unintended restrictions with the user

**Type:** grilling
**Status:** resolved
**Blocked by:** None. Activation/guidance refinement (cross-task coordination 05) and assembled verification (06) are delivered.
**Next step:** None. User reviewed and approved the coordination framework changes and confirmed this ticket should be closed.

> **User involvement required:** This is not an autonomous implementation task.
> If asked to run an implementation skill or otherwise execute this ticket
> without the user, first remind the user that they explicitly asked to take part
> in the review and wording decisions.

## Problem and intended outcome

Review all instructions that govern framework agents for language that is more
restrictive than the user's original intent. The framework should give agents
appropriate freedom and judgment rather than accidentally forbidding useful
actions through over-constrained process or role wording.

The work must be collaborative. An agent should help locate the effective
instructions, explain where each instruction comes from and what behavior it
constrains, and surface concrete candidates for revision. The user and agent
then decide together what should change and how it should be worded. Do not infer
blanket permission to weaken safety, authority, lifecycle, or repository
ownership boundaries.

## Review completion criteria

- [ ] Inventory every repository-controlled source of effective agent guidance,
  including root/repository instructions, process and role definitions, composed
  activation prompts, and instruction-bearing workflow or skill material.
- [ ] Identify duplicated, conflicting, ambiguous, and unnecessarily restrictive
  clauses, with concrete examples of behavior each clause currently prevents or
  discourages.
- [ ] Distinguish technical/runtime enforcement from authored instructions so
  wording changes are not mistaken for capability or permission changes.
- [ ] Review findings and candidate changes with the user in manageable groups;
  record the user's intended freedom and retained boundaries explicitly.
- [ ] Make no instruction edits until the user has participated in and approved
  the relevant decisions.
- [ ] After agreement, publish the approved wording changes as dependency-aware
  implementation tickets, including prompt-composition and regression coverage
  where applicable.

## Guardrails

“Less restrictive” is a question to investigate, not a blanket editing rule.
Preserve higher-priority platform requirements, explicit user-only decisions,
Git ownership, security boundaries, and invariants that the user elects to keep.
The output of the first pass is an inspectable inventory and discussion aid, not
an independently rewritten instruction set.

## Answer

Resolved on 2026-10-04 following the user's instruction to close the ticket.
The [rendered audit](../research/agent-instruction-audit.html) provided complete
initial prompts with source annotations for interactive review. The user reviewed
the coordination framework section and approved the wording implemented in
`src/application/activation-prompt.ts`, including optional unpinning guidance.
All six prompt-composition tests passed; runtime behavior remains unchanged.

The original checklist described a broader possible audit. The user concluded
this ticket after the framework wording review; remaining discussion candidates
are not approved changes or required follow-up work for this ticket. The wording
was delivered directly at the user's request, so no implementation ticket remains.

## Comments

- 2026-10-04: User approved the final coordination framework wording and stated
  that no further changes are required to that section. Continuation guidance
  now explicitly includes task movement, comment mentions and task relationships;
  moving can hand responsibility to an agent or the user, or record completion.
  Unpinning comments that no longer help current or future work is offered as an
  option, not an obligation. These approved changes were implemented directly
  at the user's request; no separate delivery ticket is needed for this wording.
  Runtime enforcement and permission boundaries remain unchanged. Approval covers
  `FRAMEWORK_GUIDANCE`; the wider inventory's process, role, repository and skill
  discussion candidates have not been reviewed or approved for changes.
- 2026-10-04: User reviewed the Implementation Agent example's framework section
  and explicitly requested a wording draft directly in the code diff. Updated
  `FRAMEWORK_GUIDANCE` to introduce the task team and board workflow, define
  watched columns and activations before using them, explain task relationships
  and resume agents, state explicit task movement, describe an unwatched-column
  handoff as user responsibility, name pinned comments throughout, and shorten
  the final paragraph to observable archive restrictions and permission guidance.
  Removed the recovery count from general guidance. Runtime behavior, process and
  role wording remain unchanged. Six prompt-composition tests pass. This is a
  draft for continued user feedback, not final audit agreement; the rendered
  audit remains the original reference snapshot.
- 2026-10-04: Prepared the [rendered instruction audit](../research/agent-instruction-audit.html)
  and [Markdown companion](../research/agent-instruction-audit.md) at the user's
  request. The production loader and composer generate complete initial prompts
  for all five checked-in Software Delivery roles; task, workspace, history and
  activation data are explicitly synthetic. Source notes distinguish template,
  process/board, role, coordination data, repository/skill, MCP and runtime layers.
  Exact prompt files, a reproducible generator and hashed source inventory sit
  alongside the audit. First discussion candidates are recorded, with no approved
  wording changes. Dark/light desktop/mobile layout checks passed. Review remains
  open for the user's participation and decisions; this is not a captured live
  session or proof of a running process's effective configuration.
- 2026-09-30: User requested that this review follow issue 09's framework guidance
  and MCP-description refinement so the user reviews the resulting instructions,
  not wording that the redesign will replace. Dependency includes implementation
  of that refinement, not merely completion of issue 09's design discussion.
- 2026-09-23: Added from user dictation. The user explicitly asked to be reminded
  of their required involvement if they later request autonomous implementation.

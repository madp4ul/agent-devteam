# 12 — Audit agent instructions for unintended restrictions with the user

**Type:** grilling
**Status:** open
**Blocked by:** None.
**Next step:** Inventory the effective instructions, then review them interactively with the user.

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

## Comments

- 2026-09-23: Added from user dictation. The user explicitly asked to be reminded
  of their required involvement if they later request autonomous implementation.

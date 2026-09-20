# 04 — Reduce routine command permission interruptions

**Type:** research
**Status:** open
**Blocked by:** None — investigate reported denials first.
**Next step:** Gather examples, investigate supported options, then grill alternatives.

## Problem and goal

The user reports more command denials since switching agents to GPT-6 Astra,
despite role instructions saying the work should be allowed. This is an observed
correlation, not an established model or approval-system regression. In reported
cases, replying with essentially “I allow it” allowed the agent to continue.

The goal is fewer interruptions for mundane work the user intends to authorize.
The user prefers a simple solution and considers a custom approval system a
potentially expensive last resort.

## Alternatives raised by the user

- Improve the current approval arrangement through a simpler supported mechanism.
- Explore framework-provided allowance prompts as a last resort.
- Explore process-defined allowlisted actions checked by a separate review agent;
  after a match, the framework would automatically provide an allowance message.

These are research hypotheses, not authorization to implement automatic assent.
Any design must distinguish actual user-delegated authority from agent inference
and represent the author/source of an automated decision honestly.

## Investigation and completion criteria

- [ ] Capture representative commands, denial reasons, effective runtime policy,
  role instructions, and the subsequent user continuation that succeeded.
- [ ] Distinguish approval-review rejection from sandbox restrictions, missing
  permissions, unclear authorization, and agent reluctance to request approval.
- [ ] Evaluate current supported configuration and explicit preauthorization
  mechanisms before proposing another reviewer or prompt-based workaround.
- [ ] Compare alternatives for interruption reduction, scope, false approvals,
  auditability, operational cost, and failure/recovery behavior.
- [ ] If delegation is proposed, define who grants it, action matching, ambiguity,
  revocation, and boundaries the framework cannot override.
- [ ] Record a recommendation and publish follow-up implementation tickets if needed.

## Existing decision to revisit explicitly

The domain model currently assigns permission policy to the runtime and reuses
shared user capability boundaries, rather than process/role permissions.
[Previous approval work](../../agent-coordination-framework/issues/54-enable-automatic-approval-review-for-agent-runs.md)
introduced automatic review and explicit user continuation for unresolved blocks.
A process allowlist or framework-authored approval mechanism would require an
explicit review of those decisions, not an assumed extension of role instructions.

## Comments

- 2026-09-20: User-described GitHub issue. No runtime change or workaround applied.

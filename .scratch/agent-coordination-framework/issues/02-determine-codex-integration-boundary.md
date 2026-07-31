# Determine the Codex Integration Boundary

Type: wayfinder:research
Status: resolved
Blocked by:
Parent: ../map.md

## Question

Which current Codex integration surface should a local coordinator use to
start and resume fully tooled agent runs, provide board tools, supply project
instructions, and observe completion or failure without reimplementing Codex?

## Answer

Use the TypeScript Codex SDK to start one fresh thread per activation and
observe its streamed completion or failure events. Retry attempts for that
activation continue its thread when possible, with a fresh-thread fallback when
the failed thread is unusable; distinct activations never share hidden
conversation context. Expose the board through a project-scoped MCP server,
keep stable project rules in `AGENTS.md`, and pass the current role, task, and
trigger in each activation prompt. Use App Server directly only if a later
version needs a full Codex client experience such as approvals or detailed
conversation UI.

See [Codex Integration Boundary](../research/codex-integration-boundary.md).

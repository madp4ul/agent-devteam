# Agent Coordination Framework Product Design

Type: wayfinder:map

## Destination

A clear, agreed product design for the first usable version of the agent
coordination framework, detailed enough to turn into a software specification,
without choosing the implementation yet.

## Notes

- This is a local, single-user framework for coordinating software-development
  agents across configurable boards.
- Prefer a local Docker Compose deployment using one or more containers.
- Read [the initial idea](./notes.md) for the decisions and examples captured
  before this map was charted.
- Use the canonical language in [the domain glossary](../../CONTEXT.md).
- Decision sessions should use the `grilling` and `domain-modeling` skills.
- External facts should be gathered with the `research` skill.
- Questions about behavior or appearance may use the `prototype` skill.
- Planning produces decisions only; implementation starts after this map is
  complete and its results have been turned into a specification.

## Decisions so far

- [Define the First Usable Workflow and Success Criteria](./issues/01-define-first-usable-workflow.md)
  — Use an architecture-led implementation workflow with independent design
  and verification agents, visible rework, cross-stage consultation, and
  explicit human approval before an agent merges the result.
- [Determine the Codex Integration Boundary](./issues/02-determine-codex-integration-boundary.md)
  — Use the TypeScript Codex SDK with one fresh thread per activation,
  best-effort thread reuse for its retries, and a project-scoped MCP server for
  board tools; reserve direct App Server use for richer Codex-native UI.
- [Determine the Board UI Foundation](./issues/03-determine-board-ui-foundation.md)
  — Start from Kanboard behind a framework-owned adapter and narrow plugin,
  with a focused spike and a custom Pragmatic Drag and Drop UI as fallback.
- [Define the Process Authoring Experience](./issues/04-define-process-authoring-experience.md)
  — Define processes as schema-backed YAML plus referenced Markdown instruction
  files, edited with existing tools and checked by location-aware validation;
  build no dedicated authoring UI or VS Code extension in the first version.
- [Define the Agent Activation and Run Lifecycle](./issues/05-define-agent-run-lifecycle.md)
  — Queue one immutable, targeted activation per trigger in strict chronological
  order; use explicit inert completion, bounded technical retries, user recovery,
  activity history, and fresh Codex context between distinct activations.
- [Define Board and Task Interactions](./issues/06-define-board-interactions.md)
  — Use a board-first user experience with integrated explicit attention,
  direct full-task pages, contextual actions, a unified timeline, and bounded
  summary-first agent discovery through explicit, paginated column queries.
- [Define Durable Board State and Recovery](./issues/07-define-durable-board-state.md)
  — Keep authoritative current state and immutable activity together with
  atomic conflict-safe commands, durable at-least-once activation recovery,
  explicit user interruption and continuation, and preserved archived history.

## Not yet specified

- What end-to-end prototype or evaluation should validate the finished product
  design before specification.

## Out of scope

- Hosting the framework as a service or supporting multiple human users.
- Supporting projects that are not Git repositories.
- Hardcoding one universal software-development process.
- Implementing the framework during this Wayfinder effort.

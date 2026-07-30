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

- [Determine the Codex Integration Boundary](./issues/02-determine-codex-integration-boundary.md)
  — Use the TypeScript Codex SDK for task threads and streamed run events, with
  a project-scoped MCP server for board tools; reserve direct App Server use
  for a later need for richer Codex-native UI.
- [Determine the Board UI Foundation](./issues/03-determine-board-ui-foundation.md)
  — Start from Kanboard behind a framework-owned adapter and narrow plugin,
  with a focused spike and a custom Pragmatic Drag and Drop UI as fallback.

## Not yet specified

- How users are notified when they are mentioned or when work reaches an
  unwatched column.
- What history, diagnostics, and controls are needed to understand stalled or
  failed automation.
- How process-definition changes affect tasks and agent runs already in
  progress.
- How completed task workspaces and branches are cleaned up safely.
- What example software-development process should ship with the first usable
  version.
- What end-to-end prototype or evaluation should validate the finished product
  design before specification.

## Out of scope

- Hosting the framework as a service or supporting multiple human users.
- Supporting projects that are not Git repositories.
- Hardcoding one universal software-development process.
- Implementing the framework during this Wayfinder effort.

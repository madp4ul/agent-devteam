# 17 — Complete a Minimal Codex Handoff

**What to build:** A task movement launches a real Codex SDK activation that
can inspect its current task, leave a comment, and move the task through a
minimal project-scoped MCP surface. That move creates the next watched-column
activation, proving one complete agent-driven handoff without implementing the
entire board-tool catalogue.

**Blocked by:** 16 — Execute the First Task Activation

**Status:** ready-for-agent

- [ ] The TypeScript Codex SDK adapter starts a fresh thread for a distinct
  activation and translates streamed completion and failure events into attempt
  outcomes.
- [ ] The activation prompt supplies current role and instructions, relevant
  process guidance, immutable trigger provenance, current task description,
  relationships, comments, and attempt context without silent truncation.
- [ ] The initial MCP surface is deliberately limited to inspecting the current
  task, adding an idempotent comment, and moving that task.
- [ ] The agent inherits the user's resolved Codex sandbox and approval policy;
  process roles do not grant additional technical authority.
- [ ] An agent comment remains authored communication distinct from immutable
  framework activity.
- [ ] An agent move into another watched column queues a new activation without
  terminating or altering the current run's successful completion.
- [ ] Attempt details retain the Codex thread ID and enough transcript access
  for adapter contract verification.
- [ ] A repeatable integration test proves one real SDK-driven comment and
  handoff while the main behavioral suite remains deterministic through the
  controlled runtime.


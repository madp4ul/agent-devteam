# Codex Integration Boundary

## Question

Which current Codex integration surface should a local coordinator use to
start and resume fully tooled agent runs, provide board tools, supply project
instructions, and observe completion or failure without reimplementing Codex?

## Recommendation

Use the **Codex SDK as the coordinator's primary integration surface**. Start a
fresh Codex thread for each activation so distinct agents and expectations do
not inherit hidden conversation context. Store the thread ID with the
activation and continue that thread for retry attempts when possible, falling
back to a fresh thread if a failed thread is unusable.

Add the board as a **project-scoped MCP server** so Codex agents can inspect and
change board state through tools. Keep stable project-wide working agreements
in `AGENTS.md`; put the agent's role, current task, and current trigger in the
prompt that starts each turn.

Do not build directly on the Responses API and do not reimplement Codex's
shell, filesystem, sandbox, approval, session, or tool-running behavior. Do not
start with the lower-level App Server protocol unless the product later needs
to expose Codex conversation history, approvals, or detailed live progress in
its own UI.

## Why this boundary fits

### Starting and resuming agent work

OpenAI describes the Codex SDK as the way to programmatically control local
Codex agents and explicitly lists internal tools, workflows, and application
integration as intended uses. The TypeScript SDK can start, continue, and
resume local Codex threads. Repeated `run()` calls continue a thread, while
`resumeThread(threadId)` restores a persisted thread after the coordinator has
lost the in-memory object. This gives the coordinator the lifecycle primitive
it needs without recreating Codex.

Sources:

- [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk)
- [Official TypeScript SDK source and README](https://github.com/openai/codex/tree/main/sdk/typescript)

### Observing completion and failure

The TypeScript SDK's `runStreamed()` returns structured events for intermediate
progress. Its official event types include `turn.completed`, `turn.failed`, and
an unrecoverable stream `error`, so the coordinator can translate a run into a
successful, failed, or infrastructure-error outcome. The non-streaming `run()`
is sufficient when only the final result is needed.

Sources:

- [Official SDK streaming documentation](https://github.com/openai/codex/tree/main/sdk/typescript#streaming-responses)
- [Official SDK event types](https://github.com/openai/codex/blob/main/sdk/typescript/src/events.ts)

### Giving agents board capabilities

MCP is Codex's supported extension point for third-party tools and context.
Local Codex clients support both local STDIO servers and Streamable HTTP
servers. Codex can scope MCP configuration to a trusted project through
`.codex/config.toml`, and an MCP server can provide server-wide usage guidance
through its `instructions` field. The framework should therefore expose board
queries and mutations as MCP tools rather than teaching the coordinator how to
execute coding work.

Source:

- [Codex MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)

### Supplying project and role instructions

Codex reads `AGENTS.md` before work begins and builds an instruction chain from
global guidance through the project root to the current working directory.
That makes `AGENTS.md` appropriate for stable, version-controlled project
rules. The current role and task are dynamic board state, so they should be
supplied in the turn prompt rather than written into shared repository files.
MCP `instructions` should be limited to rules for using the board tools.

Sources:

- [Codex `AGENTS.md` documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex MCP server instructions](https://learn.chatgpt.com/docs/extend/mcp?surface=cli#supported-mcp-features)

## Why not App Server first?

App Server is Codex's lower-level JSON-RPC interface for rich clients. It
supports thread start/resume, streamed item and tool events, and a terminal
`turn/completed` notification whose status can be `completed`, `interrupted`,
or `failed`. It also covers authentication, conversation history, and approval
requests. Those capabilities make it the right fallback if the board
application later becomes a full Codex client.

For the current need, however, OpenAI explicitly recommends the SDK for job
automation and CI, while recommending App Server for deep product
integrations. Using the SDK avoids owning the App Server handshake, protocol
versioning, request handling, and approval UI before those are needed.

Source:

- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)

## Concrete ownership split

The coordination framework owns:

- board state, triggers, scheduling, and the one-active-run-per-task rule;
- the mapping from task to isolated working directory and from activation to
  Codex thread ID;
- composing each turn's role, task, and trigger prompt;
- translating SDK completion or failure events into board behavior;
- the MCP server that exposes board tools.

Codex owns:

- model interaction and thread persistence;
- shell, filesystem, patching, and other configured tools;
- sandboxing and approvals;
- loading `AGENTS.md`, Codex configuration, skills, plugins, and MCP tools;
- execution progress and terminal run events.

## First-version decision

Build against the TypeScript Codex SDK and its streamed event API. Configure the
board MCP server at project scope. Persist each activation's Codex thread ID in
framework runtime state, not in the repository. Distinct activations start
fresh threads; retries continue the activation's thread when possible and use a
fresh-thread fallback otherwise. Treat direct App Server integration as a later
option only if the user interface needs richer Codex-native interaction than
the SDK exposes.

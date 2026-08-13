# Interactive Codex Thread Integration

## Question

Can a framework-launched agent run appear as an ordinary persistent task in
the Codex desktop sidebar, remain available for user follow-up after it
finishes, continue in the same task worktree with the coordination MCP tools,
and make a desktop follow-up appear in the framework as another running
attempt? Would replacing the TypeScript Codex SDK with Codex App Server make
that supported, and what would the alternatives cost?

## Executive answer

The complete Codex-desktop experience is **not currently available as a
documented, supported third-party integration**. Replacing the framework's
TypeScript SDK runtime with App Server would provide a much richer protocol for
building the framework's *own* chat client, but it would not by itself create a
supported bridge into the Codex desktop sidebar or let the framework observe a
turn that the desktop app starts in another App Server process.

The practical near-term solution is to keep the TypeScript SDK and turn the
existing read-only attempt transcript into a small framework-owned chat
surface. A user follow-up can resume the recorded Codex thread in the same task
worktree and run through the framework's ordinary attempt lifecycle. That is a
medium product change, not a runtime rewrite.

If first-class Codex desktop tasks are non-negotiable, the missing dependency
is an OpenAI-supported desktop thread creation/adoption and event-subscription
API. A short prototype could test today's incidental interoperability, but it
would not remove the product-support risk.

## What is supported today

### The existing SDK can already continue a finished conversation

The TypeScript SDK persists sessions in the normal Codex session store,
supports repeated turns on one `Thread`, and reconstructs a past conversation
with `resumeThread(threadId)`. It also accepts a working directory when a
thread is started or resumed. [Official Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk),
[official TypeScript SDK README](https://github.com/openai/codex/tree/main/sdk/typescript#resuming-an-existing-thread).

The framework already uses those exact primitives. It starts or resumes a
thread with the task worktree as `workingDirectory`, streams the result, and
records the thread ID. See
[`src/runtime/codex-agent-runtime.ts`](../../../src/runtime/codex-agent-runtime.ts).
The product specification currently limits reuse to attempts of one activation
and deliberately starts a fresh thread for each distinct activation. See
[`spec.md`](../../agent-coordination-framework/spec.md#codex-integration-and-permissions).

Therefore, asking another question after completion does not require App
Server. It requires a domain and UI decision: represent the message as a new
user-follow-up activation/attempt in the same conversation lineage, then call
the existing SDK resume path.

### App Server supplies rich-client primitives

OpenAI describes App Server as the interface for deep integrations inside a
product, including authentication, conversation history, approvals, and
streamed agent events; the same documentation recommends the SDK for automated
jobs and CI. App Server exposes `thread/start`, `thread/resume`, `thread/read`,
`thread/list`, `turn/start`, `turn/steer`, interruption, status notifications,
approvals, and detailed item events. It can also apply `cwd` and configuration
overrides when starting or resuming a thread. [Official App Server documentation](https://learn.chatgpt.com/docs/app-server),
[official App Server source documentation](https://github.com/openai/codex/tree/main/codex-rs/app-server).

Those capabilities would materially improve a framework-owned chat UI: the
framework could page full history instead of maintaining its own partial
transcript projection, steer an active turn, render approvals and user-input
requests, and use the server's richer runtime status.

App Server is nevertheless a versioned JSON-RPC client boundary. Clients own
initialization, request correlation, server requests, streamed notifications,
reconnection, approval handling, and schema compatibility; OpenAI explicitly
provides schema generation for the installed Codex version. Some relevant
features remain experimental. [App Server protocol and schema generation](https://learn.chatgpt.com/docs/app-server#protocol).

## Why SDK runs do not naturally become desktop sidebar tasks

The TypeScript SDK wraps `codex exec`. In the open-source Codex runtime,
non-interactive exec sessions are recorded with the `Exec` session source.
[Official Codex exec source](https://github.com/openai/codex/blob/main/codex-rs/exec/src/lib.rs).
App Server's documented `thread/list` default is restricted to interactive
sources (`cli` and `vscode`); non-interactive sources must be requested
explicitly. [Official App Server thread-list documentation](https://learn.chatgpt.com/docs/app-server#list-threads-with-pagination--filters).

This explains the repository's proven but limited baseline: an SDK session is
stored normally and is readable by ID, while sidebar visibility and project
association are not guaranteed. See
[`51-investigate-sdk-capability-parity-and-automatic-approvals.md`](../../agent-coordination-framework/issues/51-investigate-sdk-capability-parity-and-automatic-approvals.md).

Starting threads through `codex app-server` may make them look interactive in
some current builds because the standalone App Server's source defaults to
`vscode`. That is visible in the open-source launcher
([`app-server/src/main.rs`](https://github.com/openai/codex/blob/main/codex-rs/app-server/src/main.rs)),
but it is not a documented contract that a third-party client's threads will
be adopted by the Codex desktop sidebar. Public documentation describes App
Server as a way to power a client's own rich interface; it does not expose a
desktop API to create, adopt, focus, or subscribe to sidebar tasks.

Accordingly, using the current source tag or shared session files to induce
sidebar visibility would be an implementation-dependent experiment, not a
sound product boundary.

## Why persistence alone does not provide two-way integration

The desired behavior has four separate requirements:

| Requirement | Current supported result |
| --- | --- |
| Preserve conversation and ask a later question | Yes: SDK or App Server can resume by thread ID. |
| Continue in the same task worktree | Yes while the task worktree exists: the framework already passes it on resume; App Server also supports `cwd` overrides. |
| Keep coordination MCP tools usable | Yes for framework-launched turns, but not automatically for a desktop-launched follow-up. |
| Reflect a desktop-launched follow-up as a running framework attempt | No documented cross-client control/event API. |

The MCP distinction matters in this repository. Every activation currently
receives an ephemeral bearer token scoped to its task, agent, and attempt; the
framework revokes that token when the run finishes. See
[`src/cli.ts`](../../../src/cli.ts) and
[`src/mcp/agent-tool-scope.ts`](../../../src/mcp/agent-tool-scope.ts).
A later turn launched independently by the desktop therefore cannot simply
reuse the old coordination MCP process and credentials. Supporting that would
need a durable, revocable authorization design tied to a thread/task mapping,
or a framework-mediated fresh turn that issues a fresh attempt scope.

Live state is another boundary. App Server documents `thread/loaded/list` and
`thread/status/changed` in terms of threads loaded in that App Server process.
A framework-owned process can authoritatively observe turns that it starts,
but public documentation provides no mechanism for it to attach to the desktop
app's private live App Server and receive a turn the user starts there.
[Official App Server thread lifecycle](https://learn.chatgpt.com/docs/app-server#threads).

Hooks or coordination MCP calls could provide a best-effort bridge from a
desktop-started turn back to the framework, but that would be a second
integration with its own authentication and failure modes. It would not solve
the unsupported task-adoption boundary and should not be mistaken for
authoritative shared runtime ownership.

## Integration options and relative cost

### 1. Keep the SDK and add framework-native follow-up chat — recommended

Add an **Ask agent** composer beside the existing attempt transcript. Submitting
a message creates a durable user-follow-up activation/attempt, resumes the
selected thread in the persistent task worktree, issues a fresh scoped MCP
credential, and streams/persists it through the existing running/completed
lifecycle.

The main work is product/domain work rather than Codex plumbing:

- define whether follow-up belongs to an activation, conversation lineage, or
  a new explicit domain concept;
- persist the user message and its causal link to the preceding attempt/thread;
- add submit, streaming, interrupt, conflict, archive, and failure behavior;
- decide which prior agent/thread is the follow-up target when a task has
  several runs;
- test restart recovery, one-active-run enforcement, worktree verification,
  transcript continuity, and fresh MCP scope issuance.

**Relative cost:** medium, approximately three to six agent-sized vertical
tickets. For this codebase, a reasonable planning range is several focused
days to roughly two weeks, depending on chat polish and recovery requirements.
This estimate is engineering judgment, not an OpenAI-published estimate.

### 2. Replace the runtime with App Server and build a richer framework client

This is feasible and supported if the goal is a richer experience *inside the
framework*. It adds thread/history APIs, detailed deltas, active steering,
interactive approvals, user-input requests, and better status semantics.

It also requires ownership of App Server process lifetime, JSON-RPC transport,
request/server-request routing, generated protocol types, reconnection and
subscription recovery, approvals, transcript-to-domain mapping, runtime
version compatibility, and broad contract/integration testing. The existing
SDK adapter, transcript capture, permission handling, and tests would need to
be replaced or substantially reshaped.

**Relative cost:** high, approximately six to twelve or more agent-sized
tickets and likely several weeks. It is justified by rich-client requirements,
not by desktop sidebar visibility alone.

### 3. Make framework runs first-class Codex desktop tasks

This is the ideal experience, but it is currently blocked as a productized
feature by the absence of a documented desktop integration contract. A useful
OpenAI surface would need to cover at least thread creation/adoption, sidebar
visibility and naming, open/focus navigation, shared or transferable runtime
ownership, event subscriptions, cwd/worktree identity, and tool/credential
refresh on user follow-up.

A one-to-three-day spike could determine what one current desktop build does
with an App Server-created session using a shared Codex home and matching cwd.
It cannot establish forward compatibility or solve cross-process live status.
Do not commit the product to this route without an explicit supported contract
from OpenAI.

## Token implications

Conversation reuse can reduce repeated explanation and may benefit from cached
input, but it is not automatically cheaper. A resumed thread carries growing
conversation history, and the SDK's usage snapshots for resumed threads are
cumulative in the repository's current integration. The sound motivation is
continuity and less user repetition; token reduction should be measured on
representative workflows rather than promised. See
[`codex-sdk-token-usage-semantics.md`](../../agent-coordination-framework/research/codex-sdk-token-usage-semantics.md).

## Recommendation and next workflow

1. Keep the TypeScript SDK for the next increment.
2. Use `grill-with-docs` to decide the user-follow-up domain semantics and UI,
   then move through `to-spec` and `to-tickets`.
3. Treat an App Server migration as a separate decision only if richer
   framework-owned approvals/history/steering become requirements.
4. If Codex desktop integration remains the priority, ask OpenAI for a
   supported thread-adoption/control surface and run a bounded prototype only
   to inform that conversation.

This follows the repository's documented development route: research feeds
the main flow; it does not replace the product-design step. See
[`docs/agents/development-workflow.md`](../../../docs/agents/development-workflow.md).

## Sources and confidence

Primary sources were checked on 2026-08-13 against the current official Codex
manual, the official `openai/codex` repository, the installed
`@openai/codex-sdk` 0.146.0 package, and this repository's implementation and
decision record.

Confidence is **high** for SDK resume/worktree support, App Server capabilities,
session-source filtering, and the framework's current ephemeral MCP behavior.
Confidence is **bounded** for desktop interoperability: no public official
source promises third-party thread adoption or cross-process live ownership,
so the correct conclusion is “not currently supported/documented,” not
“technically impossible.”

import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRequest } from "../../src/application/coordination-application.ts";
import {
  CodexAgentRuntime,
  type CodexClientLike,
  type CodexClientOptionsLike,
  type CodexEventLike,
  type CodexThreadLike,
  type CodexThreadOptionsLike,
} from "../../src/runtime/codex-agent-runtime.ts";

test("each activation starts a fresh streamed Codex thread without overriding user permissions", async () => {
  const clients: FakeCodexClient[] = [];
  const runtime = new CodexAgentRuntime({
    mcpServer: {
      command: "node",
      args: (request) => ["coordination-mcp.ts", "--task", request.task.id],
      environment: (request) => ({ CURRENT_TASK: request.task.id }),
    },
    createClient: (options) => {
      const client = new FakeCodexClient(options, `thread-${clients.length + 1}`);
      clients.push(client);
      return client;
    },
  });

  const first = await runtime.run(request("activation-1", "T-0001"), { started() {} });
  const second = await runtime.run(request("activation-2", "T-0002"), { started() {} });

  assert.deepEqual(first, {
    status: "completed",
    summary: "Handoff completed.",
    threadId: "thread-1",
  });
  assert.deepEqual(await runtime.read("thread-1"), [
    { kind: "message", role: "agent", text: "Handoff completed." },
  ]);
  assert.equal(second.threadId, "thread-2");
  assert.equal(clients.length, 2);
  for (const client of clients) {
    assert.deepEqual(client.threadOptions, { workingDirectory: "C:\\tasks\\worktree" });
    assert.equal("sandboxMode" in client.threadOptions, false);
    assert.equal("approvalPolicy" in client.threadOptions, false);
  }
  assert.deepEqual(clients[0]?.options, {
    config: {
      mcp_servers: {
        coordination: {
          command: "node",
          args: ["coordination-mcp.ts", "--task", "T-0001"],
          env: { CURRENT_TASK: "T-0001" },
          required: true,
          default_tools_approval_mode: "approve",
        },
      },
    },
  });
  const prompt = clients[0]?.prompt ?? "";
  assert.match(prompt, /Implementation Agent/);
  assert.match(prompt, /Implement the requested task in full\./);
  assert.match(prompt, /Keep handoffs explicit\./);
  assert.match(prompt, /Move finished work to review\./);
  assert.match(prompt, /source-event-1/);
  assert.match(prompt, /FULL-DESCRIPTION-END/);
  assert.match(prompt, /Earlier authored comment\./);
  assert.match(prompt, /dependency/);
  assert.match(prompt, /attempt number: 1/i);
});

test("an unusable interrupted thread falls back to a fresh thread with honest context", async () => {
  let prompt = "";
  let freshStarts = 0;
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      resumeThread: (threadId) => {
        assert.equal(threadId, "thread-before-restart");
        throw new Error("persisted thread is unavailable");
      },
      startThread: () => {
        freshStarts += 1;
        return {
          runStreamed: async (value) => {
            prompt = value;
            return {
              events: events(
                { type: "thread.started", thread_id: "thread-replacement" },
                { type: "item.completed", item: { type: "agent_message", text: "Recovered." } },
                { type: "turn.completed" },
              ),
            };
          },
        };
      },
    }),
  });
  const recovering = request("activation-recovery", "T-0099");
  recovering.resumeThreadId = "thread-before-restart";
  recovering.attempt = {
    number: 2,
    precedingOutcome: { status: "failed", summary: "The previous host stopped." },
    thread: "resumed",
    continuationMessage: null,
  };

  const outcome = await runtime.run(recovering, { started() {} });

  assert.equal(freshStarts, 1);
  assert.equal(outcome.threadId, "thread-replacement");
  assert.match(prompt, /Thread: replaced/);
  assert.match(prompt, /previous host stopped/i);
});

test("explicit agent execution profiles become SDK thread options", async () => {
  const clients: FakeCodexClient[] = [];
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: (options) => {
      const client = new FakeCodexClient(options, "thread-profiled");
      clients.push(client);
      return client;
    },
  });
  const profiled = request("activation-profiled", "T-0003");
  profiled.agent.model = "gpt-5.6-sol";
  profiled.agent.reasoningEffort = "medium";

  await runtime.run(profiled, { started() {} });

  assert.deepEqual(clients[0]?.threadOptions, {
    workingDirectory: "C:\\tasks\\worktree",
    model: "gpt-5.6-sol",
    modelReasoningEffort: "medium",
  });
  assert.equal("sandboxMode" in (clients[0]?.threadOptions ?? {}), false);
  assert.equal("approvalPolicy" in (clients[0]?.threadOptions ?? {}), false);
});

test("an unavailable requested model remains an actionable runtime-start failure", async () => {
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => {
        throw new Error('Requested model "gpt-unavailable" is not available for this account');
      },
    }),
  });
  const profiled = request("activation-unavailable", "T-0004");
  profiled.agent.model = "gpt-unavailable";

  await assert.rejects(
    runtime.run(profiled, { started() {} }),
    /Requested model "gpt-unavailable" is not available for this account/,
  );
});

test("streamed Codex failures become failed attempt outcomes with retained thread identity", async () => {
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => new FailingCodexClient(),
  });

  assert.deepEqual(await runtime.run(request("activation-failure", "T-0003"), { started() {} }), {
    status: "failed",
    summary: "Codex could not complete the activation: model stream disconnected",
    threadId: "thread-failure",
  });
  assert.deepEqual(await runtime.read("thread-failure"), [
    { kind: "diagnostic", text: "model stream disconnected" },
  ]);
});

test("an exception after thread startup becomes an inspectable failed outcome", async () => {
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({ events: interruptedEvents() }),
      }),
    }),
  });
  let startedThreadId: string | undefined;

  assert.deepEqual(
    await runtime.run(request("activation-interrupted", "T-0004"), {
      started: (threadId) => {
        startedThreadId = threadId;
      },
    }),
    {
      status: "failed",
      summary: "Codex could not complete the activation: connection dropped",
      threadId: "thread-interrupted",
    },
  );
  assert.equal(startedThreadId, "thread-interrupted");
  assert.deepEqual(await runtime.read("thread-interrupted"), [
    { kind: "diagnostic", text: "connection dropped" },
  ]);
});

test("a stream that ends without turn.completed is a failed outcome", async () => {
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-truncated" },
            {
              type: "item.completed",
              item: { type: "agent_message", text: "This was not confirmed complete." },
            },
          ),
        }),
      }),
    }),
  });

  assert.deepEqual(
    await runtime.run(request("activation-truncated", "T-0005"), { started() {} }),
    {
      status: "failed",
      summary: "Codex could not complete the activation: the stream ended before turn.completed",
      threadId: "thread-truncated",
    },
  );
  assert.deepEqual(await runtime.read("thread-truncated"), [
    { kind: "message", role: "agent", text: "This was not confirmed complete." },
    { kind: "diagnostic", text: "The Codex stream ended before turn.completed." },
  ]);
});

test("a failed required coordination call makes the attempt fail with actionable evidence", async () => {
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-coordination-failure" },
            {
              type: "item.completed",
              item: {
                id: "tool-call-1",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "inspect_current_task",
                status: "failed",
                error: { message: "user cancelled MCP tool call" },
              },
            },
            {
              type: "item.completed",
              item: { type: "agent_message", text: "I could not inspect the task." },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });

  assert.deepEqual(
    await runtime.run(request("activation-coordination-failure", "T-0006"), { started() {} }),
    {
      status: "failed",
      summary:
        "Required coordination tool coordination.inspect_current_task failed: user cancelled MCP tool call; the coordination server was configured with approval mode \"approve\", but Codex supplied no deeper cancellation cause—inspect the retained session and host lifecycle evidence",
      threadId: "thread-coordination-failure",
    },
  );
  assert.deepEqual(await runtime.read("thread-coordination-failure"), [
    {
      kind: "tool",
      name: "mcp_tool_call",
      status: "failed",
      summary: "coordination.inspect_current_task",
      output: "user cancelled MCP tool call",
    },
    { kind: "message", role: "agent", text: "I could not inspect the task." },
    {
      kind: "diagnostic",
      text: "Required coordination tool coordination.inspect_current_task failed: user cancelled MCP tool call; the coordination server was configured with approval mode \"approve\", but Codex supplied no deeper cancellation cause—inspect the retained session and host lifecycle evidence",
    },
  ]);
});

test("transcript capture keeps useful tool activity and truncates large command output", async () => {
  const runtime = new CodexAgentRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-tools" },
            {
              type: "item.completed",
              item: {
                type: "command_execution",
                command: "pnpm test",
                status: "completed",
                exit_code: 0,
                aggregated_output: `useful start\n${"x".repeat(6_000)}`,
              },
            },
            {
              type: "item.completed",
              item: { type: "error", message: "Tool output could not be decoded." },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });

  await runtime.run(request("activation-tools", "T-0006"), { started() {} });
  const transcript = await runtime.read("thread-tools");
  assert.equal(transcript?.length, 2);
  assert.deepEqual(transcript?.[0], {
    kind: "tool",
    name: "command_execution",
    status: "completed",
    summary: "pnpm test (exit 0)",
    output: `useful start\n${"x".repeat(3_987)}\n… output truncated`,
  });
  assert.deepEqual(transcript?.[1], {
    kind: "diagnostic",
    text: "Tool output could not be decoded.",
  });
});

class FakeCodexClient implements CodexClientLike {
  threadOptions: CodexThreadOptionsLike = {};
  prompt = "";
  readonly options: CodexClientOptionsLike;
  readonly threadId: string;

  constructor(options: CodexClientOptionsLike, threadId: string) {
    this.options = options;
    this.threadId = threadId;
  }

  startThread(options: CodexThreadOptionsLike): CodexThreadLike {
    this.threadOptions = options;
    return {
      runStreamed: async (prompt) => {
        this.prompt = prompt;
        return {
          events: events(
            { type: "thread.started", thread_id: this.threadId },
            {
              type: "item.completed",
              item: { id: "message-1", type: "agent_message", text: "Handoff completed." },
            },
            { type: "turn.completed" },
          ),
        };
      },
    };
  }
}

class FailingCodexClient implements CodexClientLike {
  startThread(): CodexThreadLike {
    return {
      runStreamed: async () => ({
        events: events(
          { type: "thread.started", thread_id: "thread-failure" },
          { type: "turn.failed", error: { message: "model stream disconnected" } },
        ),
      }),
    };
  }
}

async function* events(...values: CodexEventLike[]): AsyncGenerator<CodexEventLike> {
  for (const value of values) yield value;
}

async function* interruptedEvents(): AsyncGenerator<CodexEventLike> {
  yield { type: "thread.started", thread_id: "thread-interrupted" };
  throw new Error("connection dropped");
}

function request(activationId: string, taskId: string): AgentRunRequest {
  return {
    activationId,
    agent: {
      id: "implementer",
      name: "Implementation Agent",
      role: "Implements changes",
      summary: "Builds requested changes.",
      instructions: "Implement the requested task in full.",
    },
    process: {
      name: "Delivery process",
      guidance: "Keep handoffs explicit.",
      definitionVersion: "process-version-1",
    },
    board: {
      id: "delivery",
      name: "Delivery",
      guidance: "Move finished work to review.",
      columns: [
        {
          id: "implementation",
          name: "Implementation",
          watchingAgentId: "implementer",
          frameworkOwned: false,
        },
      ],
    },
    collaborators: [
      {
        id: "reviewer",
        name: "Code Reviewer",
        role: "Reviews changes",
        summary: "Checks implementation quality.",
      },
    ],
    reason: { type: "column-entry", sourceEventId: "source-event-1" },
    sourceEvent: {
      id: "source-event-1",
      type: "task.moved",
      actor: { kind: "user", id: "paul" },
      occurredAt: "2026-08-02T12:00:00.000Z",
      details: { fromColumnId: "backlog", toColumnId: "implementation" },
    },
    task: {
      id: taskId,
      title: "Complete the minimal handoff",
      description: `A complete task description. ${"context ".repeat(2_000)}FULL-DESCRIPTION-END`,
      boardId: "delivery",
      columnId: "implementation",
      revision: 3,
      comments: [
        {
          id: "comment-1",
          body: "Earlier authored comment.",
          actor: { kind: "user", id: "paul" },
          occurredAt: "2026-08-02T11:00:00.000Z",
        },
      ],
      relationships: [
        {
          id: "relationship-1",
          type: "dependency",
          sourceTaskId: taskId,
          targetTaskId: "T-0000",
        },
      ],
      activity: [],
      activations: [],
    },
    workspace: {
      path: "C:\\tasks\\worktree",
      startingRef: "main",
      commit: "abc123",
    },
    attempt: {
      number: 1,
      precedingOutcome: null,
      thread: "fresh",
      continuationMessage: null,
    },
  };
}

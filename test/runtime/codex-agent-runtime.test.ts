import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRequest } from "../../src/application/coordination-application.ts";
import {
  CodexAgentRuntime,
  type CodexAgentRuntimeOptions,
  type CodexClientLike,
  type CodexClientOptionsLike,
  type CodexEventLike,
  type CodexThreadLike,
  type CodexThreadOptionsLike,
} from "../../src/runtime/codex-agent-runtime.ts";

test("each activation receives exact process-local Git trust without overriding Codex permissions", async () => {
  const clients: FakeCodexClient[] = [];
  const runtime = createRuntime({
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
  const secondRequest = request("activation-2", "T-0002");
  secondRequest.workspace.path = "C:\\tasks\\worktree two [review]";
  const second = await runtime.run(secondRequest, { started() {} });

  assert.deepEqual(first, {
    status: "completed",
    summary: "Handoff completed.",
    threadId: "thread-1",
  });
  assert.deepEqual(await runtime.read("attempt-activation-1"), [
    { id: "message-1", kind: "message", role: "agent", text: "Handoff completed." },
  ]);
  assert.equal(second.threadId, "thread-2");
  assert.equal(clients.length, 2);
  assert.deepEqual(clients[0]?.threadOptions, {
    workingDirectory: "C:\\tasks\\worktree",
  });
  assert.deepEqual(clients[1]?.threadOptions, {
    workingDirectory: "C:\\tasks\\worktree two [review]",
  });
  for (const client of clients) {
    assert.equal("sandboxMode" in client.threadOptions, false);
    assert.equal("approvalPolicy" in client.threadOptions, false);
  }
  assert.deepEqual(clients[0]?.options.config, {
    shell_environment_policy: {
      set: {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: "C:/tasks/worktree",
      },
    },
    mcp_servers: {
      coordination: {
        command: "node",
        args: ["coordination-mcp.ts", "--task", "T-0001"],
        env: { CURRENT_TASK: "T-0001" },
        required: true,
        default_tools_approval_mode: "approve",
      },
    },
  });
  for (const key of ["approval_policy", "default_permissions", "permissions"]) {
    assert.equal(key in (clients[0]?.options.config ?? {}), false);
  }
  assert.deepEqual(
    Object.keys(clients[0]?.options.env ?? {}).filter((key) => /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(key)),
    [],
  );
  assert.deepEqual(
    clients[1]?.options.config?.shell_environment_policy,
    {
      set: {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: "C:/tasks/worktree two [review]",
      },
    },
  );
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
  assert.match(prompt, /mention exactly\s+`@user`/);
  assert.doesNotMatch(prompt, /local-user/);
  assert.equal(prompt.match(/"id": "user"/g)?.length, 2);
});

test("an unusable interrupted thread falls back to a fresh thread with honest context", async () => {
  let prompt = "";
  let freshStarts = 0;
  const runtime = createRuntime({
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
  const runtime = createRuntime({
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
  const runtime = createRuntime({
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
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => new FailingCodexClient(),
  });

  assert.deepEqual(await runtime.run(request("activation-failure", "T-0003"), { started() {} }), {
    status: "failed",
    summary: "Codex could not complete the activation: model stream disconnected",
    threadId: "thread-failure",
  });
  assert.deepEqual(await runtime.read("attempt-activation-failure"), [
    { kind: "diagnostic", text: "model stream disconnected" },
  ]);
});

test("an explicit coordination permission report becomes a permission-blocked outcome", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-permission" },
            {
              type: "item.completed",
              item: {
                type: "mcp_tool_call",
                server: "coordination",
                tool: "report_permission_block",
                status: "completed",
                arguments: {
                  summary: "Writing the protected file requires user approval.",
                },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });

  assert.deepEqual(
    await runtime.run(request("activation-permission", "T-0004"), { started() {} }),
    {
      status: "permission-blocked",
      summary: "Writing the protected file requires user approval.",
      threadId: "thread-permission",
    },
  );
});

test("an exception after thread startup becomes an inspectable failed outcome", async () => {
  const runtime = createRuntime({
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
  assert.deepEqual(await runtime.read("attempt-activation-interrupted"), [
    { kind: "diagnostic", text: "connection dropped" },
  ]);
});

test("a stream that ends without turn.completed is a failed outcome", async () => {
  const runtime = createRuntime({
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
  assert.deepEqual(await runtime.read("attempt-activation-truncated"), [
    { kind: "message", role: "agent", text: "This was not confirmed complete." },
    { kind: "diagnostic", text: "The Codex stream ended before turn.completed." },
  ]);
});

test("a failed required coordination call makes the attempt fail with actionable evidence", async () => {
  const runtime = createRuntime({
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
  assert.deepEqual(await runtime.read("attempt-activation-coordination-failure"), [
    {
      id: "tool-call-1",
      kind: "tool",
      name: "mcp_tool_call",
      status: "failed",
      summary: "T-0006: current task inspection failed",
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
  const runtime = createRuntime({
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
  const transcript = await runtime.read("attempt-activation-tools");
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

test("a running attempt exposes stable tool progression before the Codex turn finishes", async () => {
  let releaseTool!: () => void;
  const toolMayFinish = new Promise<void>((resolve) => {
    releaseTool = resolve;
  });
  let toolStarted!: () => void;
  const toolIsRunning = new Promise<void>((resolve) => {
    toolStarted = resolve;
  });
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: liveToolEvents(toolStarted, toolMayFinish),
        }),
      }),
    }),
  });
  const liveRequest = request("activation-live", "T-0007");

  const outcome = runtime.run(liveRequest, { started() {} });
  await toolIsRunning;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [
    {
      id: "tool-live",
      kind: "tool",
      name: "mcp_tool_call",
      status: "running",
      summary: "delivery: tasks in implementation (requested)",
    },
  ]);

  releaseTool();
  await outcome;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [
    {
      id: "tool-live",
      kind: "tool",
      name: "mcp_tool_call",
      status: "completed",
      summary: "delivery: tasks in implementation (succeeded)",
    },
  ]);
});

test("a completed coordination move summarizes the authoritative task transition", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-domain-summary" },
            {
              type: "item.completed",
              item: {
                id: "move-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "move_current_task",
                status: "completed",
                arguments: { destinationColumnId: "review", expectedRevision: 4 },
                result: {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      accepted: true,
                      transition: {
                        taskId: "T-0008",
                        fromColumnId: "implementation",
                        toColumnId: "review",
                      },
                    }),
                  }],
                },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const moveRequest = request("activation-domain-summary", "T-0008");

  await runtime.run(moveRequest, { started() {} });

  assert.deepEqual(await runtime.read(moveRequest.attemptId), [{
    id: "move-tool",
    kind: "tool",
    name: "mcp_tool_call",
    status: "completed",
    summary: "T-0008: implementation → review (confirmed)",
  }]);
});

test("coordination summaries distinguish successful reads from rejected commands", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-outcome-labels" },
            {
              type: "item.completed",
              item: {
                id: "inspect-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "inspect_task",
                status: "completed",
                arguments: { taskId: "T-0042" },
                result: { content: [{ type: "text", text: JSON.stringify({ id: "T-0042" }) }] },
              },
            },
            {
              type: "item.completed",
              item: {
                id: "dependency-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "add_dependency",
                status: "completed",
                arguments: { targetTaskId: "T-0041" },
                result: {
                  content: [{
                    type: "text",
                    text: JSON.stringify({ accepted: false, reason: "duplicate-relationship" }),
                  }],
                },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const outcomeRequest = request("activation-outcome-labels", "T-0040");

  await runtime.run(outcomeRequest, { started() {} });

  const transcript = await runtime.read(outcomeRequest.attemptId);
  assert.equal(transcript?.[0]?.kind === "tool" ? transcript[0].summary : undefined, "T-0042: inspect task (succeeded)");
  assert.equal(
    transcript?.[1]?.kind === "tool" ? transcript[1].summary : undefined,
    "T-0040: dependency on T-0041 (rejected: duplicate-relationship)",
  );
});

test("a completed agent message is inspectable before the Codex turn finishes", async () => {
  let releaseTurn!: () => void;
  const turnMayFinish = new Promise<void>((resolve) => {
    releaseTurn = resolve;
  });
  let messageCompleted!: () => void;
  const messageIsReady = new Promise<void>((resolve) => {
    messageCompleted = resolve;
  });
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: liveMessageEvents(messageCompleted, turnMayFinish),
        }),
      }),
    }),
  });
  const liveRequest = request("activation-live-message", "T-0009");

  const outcome = runtime.run(liveRequest, { started() {} });
  await messageIsReady;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [{
    id: "message-live",
    kind: "message",
    role: "agent",
    text: "The requested change is complete.",
  }]);
  releaseTurn();
  await outcome;
});

test("continued attempts sharing one Codex thread retain isolated transcripts", async () => {
  let runNumber = 0;
  let resumedThreadOptions: CodexThreadOptionsLike | undefined;
  let resumedClientOptions: CodexClientOptionsLike | undefined;
  const sharedThread = (): CodexThreadLike => ({
    runStreamed: async () => {
      runNumber += 1;
      return {
        events: events(
          { type: "thread.started", thread_id: "shared-thread" },
          {
            type: "item.completed",
            item: {
              id: `message-${runNumber}`,
              type: "agent_message",
              text: `Attempt ${runNumber} evidence.`,
            },
          },
          { type: "turn.completed" },
        ),
      };
    },
  });
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: (options) => {
      resumedClientOptions = options;
      return {
        startThread: sharedThread,
        resumeThread: (_threadId, options) => {
          resumedThreadOptions = options;
          return sharedThread();
        },
      };
    },
  });
  const first = request("activation-shared", "T-0010");
  const continued = request("activation-shared", "T-0010");
  continued.attemptId = "attempt-activation-shared-2";
  continued.resumeThreadId = "shared-thread";
  continued.workspace.path = "C:\\tasks\\resumed workspace (2)";

  await runtime.run(first, { started() {} });
  await runtime.run(continued, { started() {} });

  assert.deepEqual(await runtime.read(first.attemptId), [{
    id: "message-1",
    kind: "message",
    role: "agent",
    text: "Attempt 1 evidence.",
  }]);
  assert.deepEqual(await runtime.read(continued.attemptId), [{
    id: "message-2",
    kind: "message",
    role: "agent",
    text: "Attempt 2 evidence.",
  }]);
  assert.deepEqual(resumedThreadOptions, {
    workingDirectory: "C:\\tasks\\resumed workspace (2)",
  });
  assert.deepEqual(resumedClientOptions?.config?.shell_environment_policy, {
    set: {
      GIT_CONFIG_COUNT: "1",
      GIT_CONFIG_KEY_0: "safe.directory",
      GIT_CONFIG_VALUE_0: "C:/tasks/resumed workspace (2)",
    },
  });
});

function createRuntime(options: CodexAgentRuntimeOptions): CodexAgentRuntime {
  return new CodexAgentRuntime(options);
}

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

async function* liveToolEvents(
  toolStarted: () => void,
  toolMayFinish: Promise<void>,
): AsyncGenerator<CodexEventLike> {
  yield { type: "thread.started", thread_id: "thread-live" };
  yield {
    type: "item.started",
    item: {
      id: "tool-live",
      type: "mcp_tool_call",
      server: "coordination",
      tool: "list_tasks",
      arguments: { boardId: "delivery", columnIds: ["implementation"] },
      status: "in_progress",
    },
  };
  toolStarted();
  await toolMayFinish;
  yield {
    type: "item.completed",
    item: {
      id: "tool-live",
      type: "mcp_tool_call",
      server: "coordination",
      tool: "list_tasks",
      arguments: { boardId: "delivery", columnIds: ["implementation"] },
      status: "completed",
      result: { content: [{ type: "text", text: JSON.stringify({ tasks: [] }) }] },
    },
  };
  yield { type: "turn.completed" };
}

async function* liveMessageEvents(
  messageCompleted: () => void,
  turnMayFinish: Promise<void>,
): AsyncGenerator<CodexEventLike> {
  yield { type: "thread.started", thread_id: "thread-live-message" };
  yield {
    type: "item.completed",
    item: {
      id: "message-live",
      type: "agent_message",
      text: "The requested change is complete.",
    },
  };
  messageCompleted();
  await turnMayFinish;
  yield { type: "turn.completed" };
}

function request(activationId: string, taskId: string): AgentRunRequest {
  return {
    activationId,
    attemptId: `attempt-${activationId}`,
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
          taskCreationAllowed: true,
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
      actor: { kind: "user", id: "local-user" },
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
          actor: { kind: "user", id: "local-user" },
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

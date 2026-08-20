import assert from "node:assert/strict";
import test from "node:test";

import type { AgentRunRequest } from "../../src/application/runtime-contract.ts";
import {
  CodexAgentRuntime,
  composeActivationPrompt,
  type CodexAgentRuntimeOptions,
  type CodexClientLike,
  type CodexClientOptionsLike,
  type CodexEventLike,
  type CodexThreadLike,
  type CodexThreadOptionsLike,
} from "../../src/runtime/codex-agent-runtime.ts";
import {
  createRuntime,
  events,
  liveMessageEvents,
  liveToolEvents,
  request,
} from "../support/codex-runtime-fixture.ts";

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
  const acquiredScopes: Array<{ taskId: string; agentId: string; attemptId: string }> = [];
  const releasedScopes: Array<{ taskId: string; agentId: string; attemptId: string }> = [];
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
    mcpServer: {
      command: "node",
      args: (request) => {
        acquiredScopes.push({
          taskId: request.task.id,
          agentId: request.agent.id,
          attemptId: request.attemptId,
        });
        return ["coordination-mcp.ts", "--attempt", request.attemptId];
      },
      release: (request) => releasedScopes.push({
        taskId: request.task.id,
        agentId: request.agent.id,
        attemptId: request.attemptId,
      }),
    },
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
  continued.reason = { type: "user-follow-up", sourceEventId: "follow-up-message" };
  continued.sourceEvent = {
    id: "follow-up-message",
    conversationId: "conversation-shared",
    body: "Continue the existing discussion.",
    actor: { kind: "user", id: "local-user" },
    occurredAt: "2026-08-11T16:00:00.000Z",
  };

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
  assert.equal(resumedClientOptions?.config?.approval_policy, "on-request");
  assert.equal(resumedClientOptions?.config?.approvals_reviewer, "auto_review");
  const expectedScopes = [first, continued].map((run) => ({
    taskId: run.task.id,
    agentId: run.agent.id,
    attemptId: run.attemptId,
  }));
  assert.deepEqual(acquiredScopes, expectedScopes);
  assert.deepEqual(releasedScopes, expectedScopes);
  for (const key of ["default_permissions", "permissions", "sandbox_mode", "web_search"]) {
    assert.equal(key in (resumedClientOptions?.config ?? {}), false);
  }
});


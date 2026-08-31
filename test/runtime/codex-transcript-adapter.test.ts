import assert from "node:assert/strict";
import test from "node:test";

import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AttemptTranscriptItem,
} from "../../src/application/runtime-contract.ts";
import {
  type CodexAgentRuntimeOptions,
  type CodexClientOptionsLike,
  type CodexThreadLike,
  type CodexThreadOptionsLike,
} from "../../src/runtime/codex-agent-runtime.ts";
import { projectCodexTurn } from "../../src/runtime/codex-turn-projector.ts";
import {
  createRuntime as createCodexRuntime,
  type CodexEventLike,
  events,
  liveMessageEvents,
  liveToolEvents,
  request,
} from "../support/codex-runtime-fixture.ts";

function createRuntime(options: CodexAgentRuntimeOptions) {
  const transcripts = new Map<string, AttemptTranscriptItem[]>();
  return {
    async run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
      assert.ok(options.createClient);
      const client = options.createClient({});
      const thread = request.resumeThreadId === undefined
        ? client.startThread({})
        : client.resumeThread?.(request.resumeThreadId, {}) ?? client.startThread({});
      const streamed = await thread.runStreamed("");
      const projected = await projectCodexTurn(streamed.events, {
        attemptId: request.attemptId,
        taskId: request.task.id,
      }, {
        started: (threadId) => lifecycle.started(threadId),
        publish: (transcript) => transcripts.set(request.attemptId, [...structuredClone(transcript)]),
      });
      transcripts.set(request.attemptId, [...structuredClone(projected.transcript)]);
      return {
        status: projected.terminal.kind,
        summary: projected.terminal.summary,
        ...(projected.threadId === undefined ? {} : { threadId: projected.threadId }),
      };
    },
    async read(attemptId: string): Promise<AttemptTranscriptItem[] | null> {
      return structuredClone(transcripts.get(attemptId) ?? null);
    },
  };
}

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
      kind: "coordination",
      tool: "inspect_current_task",
      status: "failed",
      summary: "T-0006: current task inspection",
      presentation: { kind: "coordination-inspection", scope: "current-task" },
      diagnostic: { kind: "failure", message: "user cancelled MCP tool call" },
      evidence: { rawStatus: "failed", error: { message: "user cancelled MCP tool call" } },
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
                id: "command-tools",
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
    id: "command-tools",
    kind: "command",
    command: "pnpm test",
    status: "completed",
    output: `useful start\n${"x".repeat(3_987)}\n… output truncated`,
  });
  assert.deepEqual(transcript?.[1], {
    kind: "diagnostic",
    text: "Tool output could not be decoded.",
  });
});

test("transcript capture retains exact generic MCP call evidence", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-generic-mcp" },
            {
              type: "item.completed",
              item: {
                id: "mcp-generic-1",
                type: "mcp_tool_call",
                server: "source_control_server",
                tool: "create_pull_request",
                status: "completed",
                arguments: { title: "Retain **literal** evidence", labels: ["display", "mcp"] },
                result: { content: [{ type: "text", text: "{\"number\":42}" }] },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const genericRequest = request("activation-generic-mcp", "T-0006");

  await runtime.run(genericRequest, { started() {} });

  assert.deepEqual(await runtime.read(genericRequest.attemptId), [{
    id: "mcp-generic-1",
    kind: "mcp",
    server: "source_control_server",
    tool: "create_pull_request",
    status: "succeeded",
    rawStatus: "completed",
    arguments: { title: "Retain **literal** evidence", labels: ["display", "mcp"] },
    result: { content: [{ type: "text", text: "{\"number\":42}" }] },
  }]);
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
      kind: "coordination",
      tool: "list_tasks",
      status: "running",
      summary: "delivery: tasks in implementation",
      presentation: {
        kind: "coordination-inspection",
        scope: "tasks",
        board: { id: "delivery" },
        columns: [{ id: "implementation" }],
      },
      evidence: {
        rawStatus: "in_progress",
        arguments: { boardId: "delivery", columnIds: ["implementation"] },
      },
    },
  ]);

  releaseTool();
  await outcome;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [
    {
      id: "tool-live",
      kind: "coordination",
      tool: "list_tasks",
      status: "succeeded",
      summary: "delivery: tasks in implementation",
      presentation: {
        kind: "coordination-inspection",
        scope: "tasks",
        board: { id: "delivery" },
        columns: [{ id: "implementation" }],
      },
      evidence: {
        rawStatus: "completed",
        arguments: { boardId: "delivery", columnIds: ["implementation"] },
        result: { content: [{ type: "text", text: JSON.stringify({ tasks: [] }) }] },
      },
    },
  ]);
});

test("a live MCP failure replaces its running row with final diagnostic evidence", async () => {
  let releaseTool!: () => void;
  const toolMayFail = new Promise<void>((resolve) => {
    releaseTool = resolve;
  });
  let toolStarted!: () => void;
  const toolIsRunning = new Promise<void>((resolve) => {
    toolStarted = resolve;
  });
  async function* failedToolEvents(): AsyncGenerator<CodexEventLike> {
    yield { type: "thread.started", thread_id: "thread-live-failed-mcp" };
    yield {
      type: "item.started",
      item: {
        id: "mcp-live-failure",
        type: "mcp_tool_call",
        server: "filesystem",
        tool: "read_file",
        status: "in_progress",
        arguments: { path: "C:/protected/evidence.txt" },
      },
    };
    toolStarted();
    await toolMayFail;
    yield {
      type: "item.completed",
      item: {
        id: "mcp-live-failure",
        type: "mcp_tool_call",
        server: "filesystem",
        tool: "read_file",
        status: "failed",
        arguments: { path: "C:/protected/evidence.txt" },
        error: { message: "Access denied", code: "EACCES" },
      },
    };
    yield { type: "turn.completed" };
  }
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({ runStreamed: async () => ({ events: failedToolEvents() }) }),
    }),
  });
  const liveRequest = request("activation-live-failed-mcp", "T-0007");

  const outcome = runtime.run(liveRequest, { started() {} });
  await toolIsRunning;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [{
    id: "mcp-live-failure",
    kind: "mcp",
    server: "filesystem",
    tool: "read_file",
    status: "running",
    rawStatus: "in_progress",
    arguments: { path: "C:/protected/evidence.txt" },
  }]);

  releaseTool();
  await outcome;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [{
    id: "mcp-live-failure",
    kind: "mcp",
    server: "filesystem",
    tool: "read_file",
    status: "failed",
    rawStatus: "failed",
    arguments: { path: "C:/protected/evidence.txt" },
    error: { message: "Access denied", code: "EACCES" },
  }]);
});

test("a running command keeps one stable row as updated evidence becomes failed output", async () => {
  let releaseCommand!: () => void;
  const commandMayFinish = new Promise<void>((resolve) => {
    releaseCommand = resolve;
  });
  let commandUpdated!: () => void;
  const commandIsUpdated = new Promise<void>((resolve) => {
    commandUpdated = resolve;
  });
  async function* commandEvents(): AsyncGenerator<CodexEventLike> {
    yield { type: "thread.started", thread_id: "thread-live-command" };
    yield {
      type: "item.started",
      item: { id: "command-live", type: "command_execution", command: "pnpm test", status: "in_progress" },
    };
    yield {
      type: "item.updated",
      item: {
        id: "command-live",
        type: "command_execution",
        command: "pnpm test",
        status: "in_progress",
        aggregated_output: "Focused tests are running.",
      },
    };
    commandUpdated();
    await commandMayFinish;
    yield {
      type: "item.completed",
      item: {
        id: "command-live",
        type: "command_execution",
        command: "pnpm test",
        status: "failed",
        aggregated_output: "Focused tests failed.",
      },
    };
    yield { type: "turn.completed" };
  }
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({ startThread: () => ({ runStreamed: async () => ({ events: commandEvents() }) }) }),
  });
  const liveRequest = request("activation-live-command", "T-0007");

  const outcome = runtime.run(liveRequest, { started() {} });
  await commandIsUpdated;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [{
    id: "command-live",
    kind: "command",
    command: "pnpm test",
    status: "running",
    output: "Focused tests are running.",
  }]);

  releaseCommand();
  await outcome;
  assert.deepEqual(await runtime.read(liveRequest.attemptId), [{
    id: "command-live",
    kind: "command",
    command: "pnpm test",
    status: "failed",
    output: "Focused tests failed.",
  }]);
});

test("a completed coordination move retains evidence and adds semantic presentation data", async () => {
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
    kind: "coordination",
    tool: "move_current_task",
    status: "succeeded",
    summary: "T-0008: implementation → review",
    presentation: {
      kind: "coordination-task-move",
      fromColumnId: "implementation",
      toColumnId: "review",
    },
    evidence: {
      rawStatus: "completed",
      arguments: { destinationColumnId: "review", expectedRevision: 4 },
      result: {
        content: [{
          type: "text",
          text: JSON.stringify({
            accepted: true,
            transition: { taskId: "T-0008", fromColumnId: "implementation", toColumnId: "review" },
          }),
        }],
      },
    },
  }]);
});

test("a running coordination move updates one row from requested arguments to authoritative result facts", async () => {
  let releaseMove!: () => void;
  const moveMayFinish = new Promise<void>((resolve) => { releaseMove = resolve; });
  let moveStarted!: () => void;
  const moveIsRunning = new Promise<void>((resolve) => { moveStarted = resolve; });
  async function* moveEvents(): AsyncGenerator<CodexEventLike> {
    yield { type: "thread.started", thread_id: "thread-live-coordination-move" };
    yield {
      type: "item.started",
      item: {
        id: "move-live",
        type: "mcp_tool_call",
        server: "coordination",
        tool: "move_current_task",
        status: "in_progress",
        arguments: { destinationColumnId: "requested-review" },
      },
    };
    moveStarted();
    await moveMayFinish;
    yield {
      type: "item.completed",
      item: {
        id: "move-live",
        type: "mcp_tool_call",
        server: "coordination",
        tool: "move_current_task",
        status: "completed",
        arguments: { destinationColumnId: "requested-review" },
        result: { content: [{ type: "text", text: JSON.stringify({
          accepted: true,
          transition: { taskId: "T-0008", fromColumnId: "implementation", toColumnId: "code-review" },
        }) }] },
      },
    };
    yield { type: "turn.completed" };
  }
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({ startThread: () => ({ runStreamed: async () => ({ events: moveEvents() }) }) }),
  });
  const moveRequest = request("activation-live-coordination-move", "T-0008");

  const outcome = runtime.run(moveRequest, { started() {} });
  await moveIsRunning;
  const running = await runtime.read(moveRequest.attemptId);
  assert.deepEqual(running?.[0]?.kind === "coordination" ? running[0].presentation : undefined, {
    kind: "coordination-task-move",
    toColumnId: "requested-review",
  });

  releaseMove();
  await outcome;
  const completed = await runtime.read(moveRequest.attemptId);
  assert.equal(completed?.length, 1);
  assert.deepEqual(completed?.[0]?.kind === "coordination" ? completed[0].presentation : undefined, {
    kind: "coordination-task-move",
    fromColumnId: "implementation",
    toColumnId: "code-review",
  });
});

test("a coordination comment exposes its authored Markdown as a semantic presentation", async () => {
  const body = "First line with **context**.\n\nSecond paragraph.\n\n- one\n- two\n- three";
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-comment-presentation" },
            {
              type: "item.completed",
              item: {
                id: "comment-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "add_comment",
                status: "completed",
                arguments: { body, expectedRevision: 5 },
                result: { content: [{ type: "text", text: JSON.stringify({ accepted: true, commentId: "comment-7" }) }] },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const commentRequest = request("activation-comment-presentation", "T-0008");

  await runtime.run(commentRequest, { started() {} });

  const transcript = await runtime.read(commentRequest.attemptId);
  assert.ok(transcript);
  const [comment] = transcript;
  assert.equal(comment?.kind, "coordination");
  assert.deepEqual(comment?.kind === "coordination" ? comment.presentation : undefined, {
    kind: "coordination-comment",
    body,
    commentId: "comment-7",
  });
});

test("permission-block reporting retains the authored reason as semantic presentation", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-permission-block-presentation" },
            {
              type: "item.completed",
              item: {
                id: "permission-block-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "report_permission_block",
                status: "completed",
                arguments: { summary: "Writing the release file requires user approval." },
                result: { content: [{ type: "text", text: JSON.stringify({ accepted: true, taskId: "T-0008" }) }] },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const permissionRequest = request("activation-permission-presentation", "T-0008");

  await runtime.run(permissionRequest, { started() {} });

  const transcript = await runtime.read(permissionRequest.attemptId);
  assert.deepEqual(transcript?.[0]?.kind === "coordination" ? transcript[0].presentation : undefined, {
    kind: "coordination-permission-block",
    reason: "Writing the release file requires user approval.",
  });
});

test("a technical coordination action failure keeps its semantic request facts and diagnostic", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-failed-coordination-action" },
            {
              type: "item.completed",
              item: {
                id: "failed-child-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "create_child_task",
                status: "failed",
                arguments: { title: "Review API", columnId: "code-review" },
                error: { message: "Connection closed" },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const failedRequest = request("activation-failed-coordination-action", "T-0008");

  await runtime.run(failedRequest, { started() {} });

  const transcript = await runtime.read(failedRequest.attemptId);
  assert.deepEqual(transcript?.[0], {
    id: "failed-child-tool",
    kind: "coordination",
    tool: "create_child_task",
    status: "failed",
    summary: "T-0008: child Review API in code-review",
    presentation: {
      kind: "coordination-child-task",
      task: { title: "Review API" },
      columnId: "code-review",
    },
    diagnostic: { kind: "failure", message: "Connection closed" },
    evidence: {
      rawStatus: "failed",
      arguments: { title: "Review API", columnId: "code-review" },
      error: { message: "Connection closed" },
    },
  });
});

test("child-task and dependency actions retain linked task identities as semantic presentations", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-linked-task-actions" },
            {
              type: "item.completed",
              item: {
                id: "child-task-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "create_child_task",
                status: "completed",
                arguments: { title: "Review API", columnId: "code-review" },
                result: { content: [{ type: "text", text: JSON.stringify({
                  accepted: true,
                  task: { id: "T-0099", title: "Review API", columnId: "code-review" },
                }) }] },
              },
            },
            {
              type: "item.completed",
              item: {
                id: "dependency-tool-linked",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "add_dependency",
                status: "completed",
                arguments: { targetTaskId: "T-requested" },
                result: { content: [{ type: "text", text: JSON.stringify({
                  accepted: true,
                  relationship: {
                    id: "R-0001",
                    type: "dependency",
                    sourceTaskId: "T-0008",
                    targetTaskId: "T-0088",
                  },
                }) }] },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const linkedActionRequest = request("activation-linked-task-actions", "T-0008");

  await runtime.run(linkedActionRequest, { started() {} });

  const transcript = await runtime.read(linkedActionRequest.attemptId);
  assert.ok(transcript);
  assert.deepEqual(transcript.flatMap((item) => item.kind === "coordination" ? [item.presentation] : []), [
    {
      kind: "coordination-child-task",
      task: { id: "T-0099", title: "Review API" },
      columnId: "code-review",
    },
    {
      kind: "coordination-dependency",
      sourceTask: { id: "T-0008" },
      targetTask: { id: "T-0088" },
    },
  ]);
});

test("operating-context inspection retains the authoritative run scope as semantic presentation", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-operating-context" },
            {
              type: "item.completed",
              item: {
                id: "operating-context-tool",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "inspect_operating_context",
                status: "completed",
                result: {
                  content: [{
                    type: "text",
                    text: JSON.stringify({
                      attemptId: "attempt-authoritative",
                      taskId: "T-0042",
                      process: { name: "Release train", definitionVersion: "version-2" },
                      board: { id: "delivery", name: "Delivery" },
                      owningAgent: { id: "reviewer", name: "Code Reviewer" },
                    }),
                  }],
                },
              },
            },
            {
              type: "item.started",
              item: {
                id: "operating-context-running",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "inspect_operating_context",
                status: "in_progress",
              },
            },
            {
              type: "item.completed",
              item: {
                id: "operating-context-failed",
                type: "mcp_tool_call",
                server: "coordination",
                tool: "inspect_operating_context",
                status: "failed",
                error: { message: "Context unavailable" },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const contextRequest = request("activation-operating-context", "T-0008");

  await runtime.run(contextRequest, { started() {} });

  const transcript = await runtime.read(contextRequest.attemptId);
  assert.ok(transcript);
  const [inspection] = transcript;
  assert.equal(inspection?.kind, "coordination");
  assert.deepEqual(inspection?.kind === "coordination" ? inspection.presentation : undefined, {
    kind: "coordination-inspection",
    scope: "operating-context",
    attemptId: "attempt-authoritative",
    taskId: "T-0042",
    processName: "Release train",
    boardId: "delivery",
    boardName: "Delivery",
    owningAgentName: "Code Reviewer",
  });
  for (const item of transcript.slice(1).filter((candidate) => candidate.kind === "coordination")) {
    assert.deepEqual(item.presentation, {
      kind: "coordination-inspection",
      scope: "operating-context",
      attemptId: contextRequest.attemptId,
      taskId: "T-0008",
    });
  }
});

test("every read-only coordination contract retains its semantic inspection scope", async () => {
  const items: Array<{ id: string; tool: string; arguments?: unknown; status: string; result?: unknown; error?: unknown }> = [
    {
      id: "board-summaries",
      tool: "summarize_boards",
      status: "completed",
      result: { content: [{ type: "text", text: JSON.stringify({
        available: true,
        boards: [{ id: "delivery", name: "Delivery" }, { id: "maintenance", name: "Maintenance" }],
      }) }] },
    },
    {
      id: "task-list",
      tool: "list_tasks",
      status: "completed",
      arguments: { boardId: "requested-board", columnIds: ["requested-column"] },
      result: { content: [{ type: "text", text: JSON.stringify({ available: true, tasks: [], nextCursor: null }) }] },
    },
    {
      id: "archived-tasks",
      tool: "list_archived_tasks",
      status: "completed",
      result: { content: [{ type: "text", text: JSON.stringify({ available: true, tasks: [{ id: "T-0003" }] }) }] },
    },
    {
      id: "task-inspection",
      tool: "inspect_task",
      status: "completed",
      arguments: { taskId: "T-requested" },
      result: { content: [{ type: "text", text: JSON.stringify({
        available: true,
        task: { id: "T-0042", title: "Authoritative task" },
      }) }] },
    },
    {
      id: "task-activity",
      tool: "list_task_activity",
      status: "failed",
      arguments: { taskId: "T-0043" },
      error: { message: "Activity unavailable" },
    },
    {
      id: "task-attachments",
      tool: "list_task_attachments",
      status: "in_progress",
      arguments: { taskId: "T-0044" },
    },
    {
      id: "collaborators",
      tool: "list_collaborators",
      status: "completed",
      result: { content: [{ type: "text", text: JSON.stringify({ available: true, collaborators: [
        { id: "implementer", name: "Implementation Agent" },
        { id: "reviewer", name: "Code Reviewer" },
      ] }) }] },
    },
    {
      id: "current-task",
      tool: "inspect_current_task",
      status: "completed",
      result: { content: [{ type: "text", text: JSON.stringify({
        id: "T-0008",
        title: "Current delivery task",
        boardId: "delivery",
        column: { id: "implementation", name: "Implementation" },
      }) }] },
    },
  ];
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-read-contracts" },
            ...items.map((item) => ({
              type: item.status === "in_progress" ? "item.started" as const : "item.completed" as const,
              item: { type: "mcp_tool_call", server: "coordination", ...item },
            })),
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const inspectionRequest = request("activation-read-contracts", "T-0008");

  await runtime.run(inspectionRequest, { started() {} });

  const transcript = await runtime.read(inspectionRequest.attemptId);
  assert.ok(transcript);
  const presentations = Object.fromEntries(transcript.flatMap((item) =>
    item.kind === "coordination" && item.id !== undefined ? [[item.id, item.presentation]] : []));
  assert.deepEqual(presentations, {
    "board-summaries": {
      kind: "coordination-inspection",
      scope: "board-summaries",
      boards: [{ id: "delivery", name: "Delivery" }, { id: "maintenance", name: "Maintenance" }],
    },
    "task-list": {
      kind: "coordination-inspection",
      scope: "tasks",
      board: { id: "requested-board" },
      columns: [{ id: "requested-column" }],
    },
    "archived-tasks": { kind: "coordination-inspection", scope: "archived-tasks", taskCount: 1 },
    "task-inspection": {
      kind: "coordination-inspection",
      scope: "task",
      taskId: "T-0042",
      taskTitle: "Authoritative task",
    },
    "task-activity": { kind: "coordination-inspection", scope: "task-activity", taskId: "T-0043" },
    "task-attachments": { kind: "coordination-inspection", scope: "task-attachments", taskId: "T-0044" },
    collaborators: { kind: "coordination-inspection", scope: "collaborators", collaboratorCount: 2 },
    "current-task": {
      kind: "coordination-inspection",
      scope: "current-task",
      taskTitle: "Current delivery task",
      boardId: "delivery",
      columnId: "implementation",
      columnName: "Implementation",
    },
  });
});

test("coordination MCP capture preserves domain rejection without rewriting raw evidence", async () => {
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

  assert.deepEqual(await runtime.read(outcomeRequest.attemptId), [
    {
      id: "inspect-tool",
      kind: "coordination",
      tool: "inspect_task",
      status: "succeeded",
      summary: "T-0042: inspect task",
      presentation: { kind: "coordination-inspection", scope: "task", taskId: "T-0042" },
      evidence: {
        rawStatus: "completed",
        arguments: { taskId: "T-0042" },
        result: { content: [{ type: "text", text: JSON.stringify({ id: "T-0042" }) }] },
      },
    },
    {
      id: "dependency-tool",
      kind: "coordination",
      tool: "add_dependency",
      status: "rejected",
      summary: "T-0040: dependency on T-0041 · Rejected: duplicate-relationship",
      presentation: {
        kind: "coordination-dependency",
        sourceTask: { id: "T-0040" },
        targetTask: { id: "T-0041" },
      },
      diagnostic: { kind: "rejection", message: "Duplicate relationship" },
      evidence: {
        rawStatus: "completed",
        arguments: { targetTaskId: "T-0041" },
        result: {
          content: [{ type: "text", text: JSON.stringify({ accepted: false, reason: "duplicate-relationship" }) }],
        },
      },
    },
  ]);
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
  const runtime = createCodexRuntime({
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

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import {
  CoordinationApplication,
} from "../../src/application/coordination-application.ts";
import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRuntime,
} from "../../src/application/runtime-contract.ts";
import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import {
  CodexAgentRuntime,
  type CodexClientOptionsLike,
  type CodexEventLike,
} from "../../src/runtime/codex-agent-runtime.ts";
import { startWebServer } from "../../src/web/web-server.ts";

const execFileAsync = promisify(execFile);

test("the project MCP exposes bounded discovery while mutations stay current-task scoped", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-mcp-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement and hand off.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: MCP process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Use the task-scoped tools.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements changes
    summary: Builds the current task.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep movement explicit.
    columns:
      - id: implementation
        name: Implementation
      - id: review
        name: Review
`,
  );
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Use scoped tools",
    description: "The MCP must never accept another task identity.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-mcp-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  for (const [index, title] of ["Backlog one", "Backlog two", "Backlog three"].entries()) {
    const backlogTask = application.createTask({
      boardId: "delivery",
      columnId: "implementation",
      title,
      description: `Complete context for backlog task ${index + 1}.`,
      actor: { kind: "user", id: "paul" },
      idempotencyKey: `create-backlog-${index + 1}`,
    });
    assert.equal(backlogTask.accepted, true);
  }

  const scopes = new AgentToolScopeRegistry();
  const token = scopes.issue({ taskId: created.task.id, agentId: "implementer" });
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    agentToolScopes: scopes,
  });
  t.after(() => server.close());
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--experimental-strip-types",
      join(process.cwd(), "src/mcp/stdio-server.ts"),
      "--base-url",
      server.baseUrl,
      "--token",
      token,
    ],
    stderr: "pipe",
  });
  const client = new Client({ name: "coordination-test", version: "1.0.0" });
  await client.connect(transport);
  t.after(() => client.close());

  const listed = await client.listTools();
  assert.deepEqual(
    listed.tools.map((tool) => tool.name),
    [
      "summarize_boards",
      "list_tasks",
      "list_archived_tasks",
      "inspect_task",
      "list_task_activity",
      "list_task_attachments",
      "list_collaborators",
      "inspect_current_task",
      "inspect_operating_context",
      "add_comment",
      "move_current_task",
      "create_child_task",
      "add_dependency",
      "report_permission_block",
    ],
  );
  const reference = await readFile(
    join(process.cwd(), "docs/agent-mcp-reference.md"),
    "utf8",
  );
  assert.deepEqual(
    [...reference.matchAll(/^\| `([^`]+)` \|/gmu)].map((match) => match[1]),
    listed.tools.map((tool) => tool.name),
  );
  const toolByName = new Map(listed.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(
    Object.fromEntries(
      [
        "summarize_boards",
        "list_archived_tasks",
        "inspect_task",
        "list_task_activity",
        "list_task_attachments",
        "list_collaborators",
        "inspect_current_task",
        "inspect_operating_context",
      ].map((name) => [
        name,
        Object.keys(toolByName.get(name)?.inputSchema.properties ?? {}),
      ]),
    ),
    {
      summarize_boards: [],
      list_archived_tasks: [],
      inspect_task: ["taskId"],
      list_task_activity: ["taskId"],
      list_task_attachments: ["taskId"],
      list_collaborators: [],
      inspect_current_task: [],
      inspect_operating_context: [],
    },
  );
  assert.deepEqual(
    Object.keys(toolByName.get("list_tasks")?.inputSchema.properties ?? {}),
    ["boardId", "columnIds", "pageSize", "cursor"],
  );
  assert.deepEqual(toolByName.get("list_tasks")?.inputSchema.required, [
    "boardId",
    "columnIds",
  ]);
  const listTaskProperties = toolByName.get("list_tasks")?.inputSchema.properties as
    | Record<string, { minItems?: number; maximum?: number }>
    | undefined;
  assert.equal(listTaskProperties?.columnIds?.minItems, 1);
  assert.equal(listTaskProperties?.pageSize?.maximum, 50);
  assert.deepEqual(Object.keys(toolByName.get("add_comment")?.inputSchema.properties ?? {}), [
    "body",
    "idempotencyKey",
  ]);
  assert.deepEqual(Object.keys(toolByName.get("move_current_task")?.inputSchema.properties ?? {}), [
    "destinationColumnId",
    "expectedRevision",
    "idempotencyKey",
  ]);
  assert.deepEqual(Object.keys(toolByName.get("create_child_task")?.inputSchema.properties ?? {}), [
    "boardId",
    "columnId",
    "title",
    "description",
    "startingRef",
    "idempotencyKey",
  ]);
  assert.deepEqual(Object.keys(toolByName.get("add_dependency")?.inputSchema.properties ?? {}), [
    "targetTaskId",
    "idempotencyKey",
  ]);
  assert.deepEqual(
    Object.keys(toolByName.get("report_permission_block")?.inputSchema.properties ?? {}),
    ["summary"],
  );
  assert.equal(
    ["add_comment", "move_current_task", "create_child_task", "add_dependency", "report_permission_block"].some(
      (name) => "taskId" in (toolByName.get(name)?.inputSchema.properties ?? {}),
    ),
    false,
  );
  const unavailableOperatingContext = await client.callTool({
    name: "inspect_operating_context",
    arguments: {},
  });
  assert.equal(unavailableOperatingContext.isError, true);
  assert.deepEqual(JSON.parse(textContent(unavailableOperatingContext.content)), {
    available: false,
    reason: "invalid-attempt-scope",
  });
  const permissionReport = await client.callTool({
    name: "report_permission_block",
    arguments: { summary: "A required protected action needs user approval." },
  });
  assert.deepEqual(JSON.parse(textContent(permissionReport.content)), {
    accepted: true,
    taskId: created.task.id,
  });

  const summary = await client.callTool({ name: "summarize_boards", arguments: {} });
  const summaryValue = JSON.parse(textContent(summary.content)) as {
    boards: Array<{ columns: Array<{ id: string; taskCount: number }> }>;
  };
  assert.deepEqual(
    summaryValue.boards[0]?.columns.map((column) => ({
      id: column.id,
      taskCount: column.taskCount,
    })),
    [
      { id: "implementation", taskCount: 4 },
      { id: "review", taskCount: 0 },
      { id: "completion", taskCount: 0 },
    ],
  );
  assert.doesNotMatch(textContent(summary.content), /Complete context|current task identity/);

  const firstPage = await client.callTool({
    name: "list_tasks",
    arguments: { boardId: "delivery", columnIds: ["implementation"], pageSize: 2 },
  });
  const firstPageValue = JSON.parse(textContent(firstPage.content)) as {
    tasks: Array<{ id: string; title: string }>;
    nextCursor: string | null;
  };
  assert.deepEqual(firstPageValue.tasks.map((task) => task.id), ["T-0001", "T-0002"]);
  assert.ok(firstPageValue.nextCursor);
  assert.doesNotMatch(textContent(firstPage.content), /Complete context/);

  const secondPage = await client.callTool({
    name: "list_tasks",
    arguments: {
      boardId: "delivery",
      columnIds: ["implementation"],
      pageSize: 2,
      cursor: firstPageValue.nextCursor,
    },
  });
  const secondPageValue = JSON.parse(textContent(secondPage.content)) as {
    tasks: Array<{ id: string }>;
    nextCursor: string | null;
  };
  assert.deepEqual(secondPageValue.tasks.map((task) => task.id), ["T-0003", "T-0004"]);
  assert.equal(secondPageValue.nextCursor, null);

  const invalidListing = await client.callTool({
    name: "list_tasks",
    arguments: { boardId: "delivery", columnIds: ["missing"] },
  });
  assert.equal(invalidListing.isError, true);
  assert.deepEqual(JSON.parse(textContent(invalidListing.content)), {
    available: false,
    reason: "column-not-found",
    columnId: "missing",
  });
  const invalidCursor = await client.callTool({
    name: "list_tasks",
    arguments: {
      boardId: "delivery",
      columnIds: ["implementation"],
      cursor: "not-a-valid-cursor",
    },
  });
  assert.equal(invalidCursor.isError, true);
  assert.deepEqual(JSON.parse(textContent(invalidCursor.content)), {
    available: false,
    reason: "invalid-cursor",
  });

  const missingTask = await client.callTool({
    name: "inspect_task",
    arguments: { taskId: "T-9999" },
  });
  assert.equal(missingTask.isError, true);
  assert.deepEqual(JSON.parse(textContent(missingTask.content)), {
    available: false,
    reason: "not-found",
  });

  const inspectedOtherTask = await client.callTool({
    name: "inspect_task",
    arguments: { taskId: "T-0002" },
  });
  const inspectedOtherTaskValue = JSON.parse(textContent(inspectedOtherTask.content)) as {
    task: Record<string, unknown>;
  };
  assert.equal(
    inspectedOtherTaskValue.task.description,
    "Complete context for backlog task 1.",
  );
  assert.equal("activity" in inspectedOtherTaskValue.task, false);

  const activity = await client.callTool({
    name: "list_task_activity",
    arguments: { taskId: "T-0002" },
  });
  const attachments = await client.callTool({
    name: "list_task_attachments",
    arguments: { taskId: "T-0002" },
  });
  assert.match(textContent(activity.content), /task.created/);
  assert.deepEqual(JSON.parse(textContent(attachments.content)), {
    available: true,
    attachments: [],
  });

  const collaborators = await client.callTool({ name: "list_collaborators", arguments: {} });
  assert.match(textContent(collaborators.content), /Implementation Agent/);
  assert.doesNotMatch(textContent(collaborators.content), /Implement and hand off/);

  const inspected = await client.callTool({ name: "inspect_current_task", arguments: {} });
  const inspectedTask = JSON.parse(textContent(inspected.content)) as { id: string; revision: number };
  assert.equal(inspectedTask.id, created.task.id);

  const dependencyArguments = { targetTaskId: "T-0002", idempotencyKey: "agent-dependency" };
  const dependencyResult = await client.callTool({ name: "add_dependency", arguments: dependencyArguments });
  const repeatedDependencyResult = await client.callTool({ name: "add_dependency", arguments: dependencyArguments });
  const dependencyPayload = JSON.parse(textContent(dependencyResult.content)) as {
    accepted: true;
    relationship: { id: string; type: string; sourceTaskId: string; targetTaskId: string };
  };
  assert.deepEqual(dependencyPayload, {
    accepted: true,
    relationship: {
      id: dependencyPayload.relationship.id,
      type: "dependency",
      sourceTaskId: created.task.id,
      targetTaskId: "T-0002",
    },
  });
  assert.deepEqual(
    JSON.parse(textContent(repeatedDependencyResult.content)),
    dependencyPayload,
  );
  const childResult = await client.callTool({
    name: "create_child_task",
    arguments: {
      boardId: "delivery",
      columnId: "implementation",
      title: "Scoped child",
      description: "Created by the current-task-scoped agent tool.",
      startingRef: "main",
      idempotencyKey: "agent-child",
    },
  });
  assert.deepEqual(JSON.parse(textContent(childResult.content)), {
    accepted: true,
    task: {
      id: "T-0005",
      boardId: "delivery",
      columnId: "implementation",
      revision: 1,
    },
  });
  const rejectedCompletedChild = await client.callTool({
    name: "create_child_task",
    arguments: {
      boardId: "delivery",
      columnId: "completion",
      title: "Completed at creation",
      description: "The agent adapter must expose the shared creation invariant.",
      idempotencyKey: "agent-completed-child",
    },
  });
  assert.equal(rejectedCompletedChild.isError, true);
  assert.deepEqual(JSON.parse(textContent(rejectedCompletedChild.content)), {
    accepted: false,
    reason: "completion-is-not-starting-column",
  });

  const commentArguments = {
    body: "Implementation complete; handing off for review.",
    idempotencyKey: "agent-comment",
  };
  const beforeInertMove = application.queryTask(created.task.id);
  assert.equal(beforeInertMove.available, true);
  if (!beforeInertMove.available) return;
  const inertMoveResult = await client.callTool({
    name: "move_current_task",
    arguments: {
      destinationColumnId: "implementation",
      expectedRevision: inspectedTask.revision,
      idempotencyKey: "agent-inert-move",
    },
  });
  assert.notEqual(inertMoveResult.isError, true);
  assert.deepEqual(JSON.parse(textContent(inertMoveResult.content)), {
    accepted: true,
    outcome: "already-in-column",
    revision: inspectedTask.revision,
    transition: {
      taskId: created.task.id,
      fromColumnId: "implementation",
      toColumnId: "implementation",
    },
  });
  const afterInertMove = application.queryTask(created.task.id);
  assert.equal(afterInertMove.available, true);
  if (!afterInertMove.available) return;
  assert.equal(afterInertMove.task.revision, beforeInertMove.task.revision);
  assert.deepEqual(afterInertMove.task.activity, beforeInertMove.task.activity);
  assert.deepEqual(afterInertMove.task.activations, beforeInertMove.task.activations);

  const commentResult = await client.callTool({ name: "add_comment", arguments: commentArguments });
  const repeatedCommentResult = await client.callTool({ name: "add_comment", arguments: commentArguments });
  const commentPayload = JSON.parse(textContent(commentResult.content)) as {
    accepted: true;
    taskId: string;
    revision: number;
    commentId: string;
  };
  assert.deepEqual(commentPayload, {
    accepted: true,
    taskId: created.task.id,
    revision: inspectedTask.revision,
    commentId: commentPayload.commentId,
  });
  assert.deepEqual(JSON.parse(textContent(repeatedCommentResult.content)), commentPayload);
  const moveResult = await client.callTool({
    name: "move_current_task",
    arguments: {
      destinationColumnId: "review",
      expectedRevision: inspectedTask.revision,
      idempotencyKey: "agent-move",
    },
  });
  assert.deepEqual(JSON.parse(textContent(moveResult.content)), {
    accepted: true,
    revision: inspectedTask.revision + 1,
    transition: {
      taskId: created.task.id,
      fromColumnId: "implementation",
      toColumnId: "review",
    },
  });

  const updated = application.queryTask(created.task.id);
  assert.equal(updated.available, true);
  if (!updated.available) return;
  assert.equal(updated.task.columnId, "review");
  assert.deepEqual(updated.task.relationships.map((relationship) => relationship.type), [
    "dependency",
    "parent-child",
  ]);
  assert.deepEqual(
    updated.task.comments.map((comment) => ({ body: comment.body, actor: comment.actor })),
    [
      {
        body: "Implementation complete; handing off for review.",
        actor: { kind: "agent", id: "implementer" },
      },
    ],
  );
  const repeatedInertMoveResult = await client.callTool({
    name: "move_current_task",
    arguments: {
      destinationColumnId: "implementation",
      expectedRevision: inspectedTask.revision,
      idempotencyKey: "agent-inert-move",
    },
  });
  assert.notEqual(repeatedInertMoveResult.isError, true);
  assert.deepEqual(
    JSON.parse(textContent(repeatedInertMoveResult.content)),
    JSON.parse(textContent(inertMoveResult.content)),
  );
  const afterInertReplay = application.queryTask(created.task.id);
  assert.equal(afterInertReplay.available, true);
  if (!afterInertReplay.available) return;
  assert.equal(afterInertReplay.task.columnId, "review");
  assert.equal(afterInertReplay.task.revision, updated.task.revision);
  assert.deepEqual(afterInertReplay.task.activity, updated.task.activity);
  assert.deepEqual(afterInertReplay.task.activations, updated.task.activations);

  const runtimeTask = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Drive the assembled runtime and MCP boundary",
    description: "The controlled Codex adapter must inspect, comment, and move through stdio.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-assembled-runtime-task",
  });
  assert.equal(runtimeTask.accepted, true);
  if (!runtimeTask.accepted) return;
  const runtime = new CodexAgentRuntime({
    mcpServer: {
      command: process.execPath,
      args: (request) => [
        "--experimental-strip-types",
        join(process.cwd(), "src/mcp/stdio-server.ts"),
        "--base-url",
        server.baseUrl,
        "--token",
        scopes.issue({ taskId: request.task.id, agentId: request.agent.id }),
      ],
    },
    createClient: (options) => controlledMcpClient(options),
  });
  const runtimeOutcome = await runtime.run(
    assembledRequest(runtimeTask.task, directory),
    { started() {} },
  );
  assert.deepEqual(runtimeOutcome, {
    status: "completed",
    summary: "Controlled assembled handoff complete.",
    threadId: "controlled-assembled-thread",
  });
  const moveTranscriptItem = (await runtime.read("controlled-assembled-attempt"))
    ?.find((item) => item.kind === "coordination" && item.tool === "move_current_task");
  assert.equal(moveTranscriptItem?.kind, "coordination");
  assert.equal(moveTranscriptItem?.status, "succeeded");
  assert.equal(moveTranscriptItem?.evidence.rawStatus, "completed");
  assert.equal(moveTranscriptItem?.evidence.arguments, undefined);
  assert.ok(moveTranscriptItem?.evidence.result !== undefined);
  const runtimeUpdated = application.queryTask(runtimeTask.task.id);
  assert.equal(runtimeUpdated.available, true);
  if (!runtimeUpdated.available) return;
  assert.equal(runtimeUpdated.task.columnId, "review");
  assert.deepEqual(runtimeUpdated.task.comments.map((comment) => comment.body), [
    "Controlled assembled MCP handoff complete.",
  ]);
});

test("move_current_task reports a mentioned agent's responsibility claim without a redundant activation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-mcp-mention-claim-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# MCP mention claim test\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C", repositoryPath,
    "-c", "user.name=Coordination Test",
    "-c", "user.email=coordination@example.invalid",
    "commit", "-m", "Initial commit",
  ]);
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement mentioned work.\n");
  await writeFile(definitionPath, `schemaVersion: 1
name: MCP mention claim process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Let mentioned specialists claim responsibility explicitly.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements changes
    summary: Builds the current task.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep movement explicit.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`);
  const runtime = new ControlledMentionRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: repositoryPath,
      taskWorkspaceRoot: join(directory, "workspaces"),
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Claim responsibility through MCP",
    description: "The tool result must describe one continuing expectation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-mcp-mention-claim",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: "@implementer please take responsibility for this work.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "mention-mcp-claiming-agent",
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) return;
  await application.resumeAutomation();
  const request = await runtime.waitForRequest();

  const scopes = new AgentToolScopeRegistry();
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    agentToolScopes: scopes,
  });
  t.after(() => server.close());
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--experimental-strip-types",
      join(process.cwd(), "src/mcp/stdio-server.ts"),
      "--base-url",
      server.baseUrl,
      "--token",
      scopes.issue({
        taskId: request.task.id,
        agentId: request.agent.id,
        attemptId: request.attemptId,
      }),
    ],
    stderr: "pipe",
  });
  const client = new Client({ name: "mention-claim-test", version: "1.0.0" });
  await client.connect(transport);
  t.after(() => client.close());

  const operatingContext = await client.callTool({
    name: "inspect_operating_context",
    arguments: {},
  });
  assert.notEqual(operatingContext.isError, true);
  const operatingPayload = JSON.parse(textContent(operatingContext.content)) as {
    attemptId: string;
    taskId: string;
    frameworkInstructions: string;
    process: { guidance: string };
    board: { id: string; guidance: string };
    owningAgent: { id: string; instructions: string };
    participants: Array<{ id: string }>;
  };
  assert.equal(operatingPayload.attemptId, request.attemptId);
  assert.equal(operatingPayload.taskId, request.task.id);
  assert.match(operatingPayload.frameworkInstructions, /durable record/);
  assert.equal(
    operatingPayload.process.guidance,
    "Let mentioned specialists claim responsibility explicitly.",
  );
  assert.equal(operatingPayload.board.id, "delivery");
  assert.equal(operatingPayload.board.guidance, "Keep movement explicit.");
  assert.deepEqual(operatingPayload.owningAgent, {
    id: "implementer",
    name: "Implementation Agent",
    role: "Implements changes",
    summary: "Builds the current task.",
    instructions: "Implement mentioned work.\n",
  });
  assert.deepEqual(operatingPayload.participants.map(({ id }) => id), ["implementer"]);

  const result = await client.callTool({
    name: "move_current_task",
    arguments: {
      destinationColumnId: "implementation",
      expectedRevision: mentioned.task.revision,
      idempotencyKey: "claim-through-mcp",
    },
  });

  assert.notEqual(result.isError, true);
  const payload = JSON.parse(textContent(result.content)) as {
    accepted: true;
    revision: number;
    transition: { taskId: string; fromColumnId: string; toColumnId: string };
  };
  assert.deepEqual(payload, {
    accepted: true,
    revision: mentioned.task.revision + 1,
    transition: {
      taskId: created.task.id,
      fromColumnId: "backlog",
      toColumnId: "implementation",
    },
  });
  const claimed = application.queryTask(created.task.id);
  assert.equal(claimed.available, true);
  if (!claimed.available) return;
  assert.deepEqual(claimed.task.activations.map((activation) => ({
    id: activation.id,
    status: activation.status,
    reasonType: activation.reason.type,
  })), [{ id: request.activationId, status: "running", reasonType: "agent-mention" }]);

  runtime.complete({ status: "completed", summary: "Claimed responsibility through MCP." });
  await application.waitForAutomationIdle();
});

function controlledMcpClient(options: CodexClientOptionsLike) {
  return {
    startThread: () => ({
      runStreamed: async () => {
        const server = coordinationServerConfig(options);
        if (server.default_tools_approval_mode !== "approve") {
          return {
            events: codexEvents(
              { type: "thread.started", thread_id: "controlled-assembled-thread" },
              {
                type: "item.completed",
                item: {
                  type: "mcp_tool_call",
                  server: "coordination",
                  tool: "inspect_current_task",
                  status: "failed",
                  error: { message: "user cancelled MCP tool call" },
                },
              },
              { type: "turn.completed" },
            ),
          };
        }
        const transport = new StdioClientTransport({
          command: server.command,
          args: server.args,
          stderr: "pipe",
        });
        const client = new Client({ name: "controlled-codex-adapter", version: "1.0.0" });
        await client.connect(transport);
        try {
          const inspected = await client.callTool({ name: "inspect_current_task", arguments: {} });
          const current = JSON.parse(textContent(inspected.content)) as { revision: number };
          const commented = await client.callTool({
            name: "add_comment",
            arguments: {
              body: "Controlled assembled MCP handoff complete.",
              idempotencyKey: "controlled-assembled-comment",
            },
          });
          const moved = await client.callTool({
            name: "move_current_task",
            arguments: {
              destinationColumnId: "review",
              expectedRevision: current.revision,
              idempotencyKey: "controlled-assembled-move",
            },
          });
          return {
            events: codexEvents(
              { type: "thread.started", thread_id: "controlled-assembled-thread" },
              completedMcpItem("inspect_current_task", inspected.content),
              completedMcpItem("add_comment", commented.content),
              completedMcpItem("move_current_task", moved.content),
              {
                type: "item.completed",
                item: { type: "agent_message", text: "Controlled assembled handoff complete." },
              },
              { type: "turn.completed" },
            ),
          };
        } finally {
          await client.close();
        }
      },
    }),
  };
}

function coordinationServerConfig(options: CodexClientOptionsLike): {
  command: string;
  args: string[];
  default_tools_approval_mode?: string;
} {
  const config = options.config as unknown as {
    mcp_servers?: {
      coordination?: {
        command?: unknown;
        args?: unknown;
        default_tools_approval_mode?: unknown;
      };
    };
  };
  const server = config.mcp_servers?.coordination;
  const command = server?.command;
  const args = server?.args;
  if (typeof command !== "string" || !Array.isArray(args) || !args.every((value) => typeof value === "string")) {
    throw new Error("Codex runtime did not configure a valid coordination stdio server");
  }
  return {
    command,
    args,
    ...(typeof server?.default_tools_approval_mode === "string"
      ? { default_tools_approval_mode: server.default_tools_approval_mode }
      : {}),
  };
}

function completedMcpItem(tool: string, result: unknown): CodexEventLike {
  return {
    type: "item.completed",
    item: { type: "mcp_tool_call", server: "coordination", tool, status: "completed", result },
  };
}

async function* codexEvents(...events: CodexEventLike[]): AsyncGenerator<CodexEventLike> {
  for (const event of events) yield event;
}

function assembledRequest(
  task: Extract<ReturnType<CoordinationApplication["createTask"]>, { accepted: true }>['task'],
  directory: string,
): AgentRunRequest {
  const sourceEvent = task.activity[0];
  assert.ok(sourceEvent);
  return {
    activationId: "controlled-assembled-activation",
    attemptId: "controlled-assembled-attempt",
    agent: {
      id: "implementer",
      name: "Implementation Agent",
      role: "Implements changes",
      summary: "Builds the current task.",
      instructions: "Inspect, comment, and move the task.",
    },
    process: {
      name: "MCP process",
      guidance: "Use the task-scoped tools.",
      definitionVersion: "controlled-version",
    },
    board: {
      id: "delivery",
      name: "Delivery",
      guidance: "Keep movement explicit.",
      columns: [
        { id: "implementation", name: "Implementation", watchingAgentId: null, frameworkOwned: false, taskCreationAllowed: true },
        { id: "review", name: "Review", watchingAgentId: null, frameworkOwned: false, taskCreationAllowed: true },
        { id: "completion", name: "Completion", watchingAgentId: null, frameworkOwned: true, taskCreationAllowed: false },
      ],
    },
    collaborators: [],
    reason: { type: "column-entry", sourceEventId: sourceEvent.id },
    sourceEvent,
    task,
    workspace: { path: directory, startingRef: "main", commit: "controlled" },
    activationContext: {
      kind: "initial",
      description: task.description,
      comments: task.comments,
      activity: task.activity,
      sourceDelivery: "current-context",
    },
    attempt: { number: 1, precedingOutcome: null, thread: "fresh", continuationMessage: null },
  };
}

function textContent(content: unknown): string {
  assert.ok(Array.isArray(content));
  const first = content[0] as { type?: string; text?: string } | undefined;
  assert.equal(first?.type, "text");
  assert.ok(typeof first?.text === "string");
  return first.text;
}

class ControlledMentionRuntime implements AgentRuntime {
  #request: AgentRunRequest | undefined;
  #requestReady: ((request: AgentRunRequest) => void) | undefined;
  #complete: ((outcome: AgentRunOutcome) => void) | undefined;

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.#request = request;
    lifecycle.started("mcp-mention-claim-thread");
    this.#requestReady?.(request);
    return new Promise((resolve) => {
      this.#complete = resolve;
    });
  }

  waitForRequest(): Promise<AgentRunRequest> {
    if (this.#request !== undefined) return Promise.resolve(this.#request);
    return new Promise((resolve) => {
      this.#requestReady = resolve;
    });
  }

  complete(outcome: AgentRunOutcome): void {
    assert.ok(this.#complete);
    this.#complete(outcome);
  }
}

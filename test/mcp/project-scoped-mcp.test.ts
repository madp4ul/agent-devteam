import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import { startWebServer } from "../../src/web/web-server.ts";

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
      "inspect_task",
      "list_task_activity",
      "list_task_attachments",
      "list_collaborators",
      "inspect_current_task",
      "add_comment",
      "move_current_task",
    ],
  );
  const toolByName = new Map(listed.tools.map((tool) => [tool.name, tool]));
  assert.deepEqual(
    Object.fromEntries(
      [
        "summarize_boards",
        "inspect_task",
        "list_task_activity",
        "list_task_attachments",
        "list_collaborators",
        "inspect_current_task",
      ].map((name) => [
        name,
        Object.keys(toolByName.get(name)?.inputSchema.properties ?? {}),
      ]),
    ),
    {
      summarize_boards: [],
      inspect_task: ["taskId"],
      list_task_activity: ["taskId"],
      list_task_attachments: ["taskId"],
      list_collaborators: [],
      inspect_current_task: [],
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
  assert.equal(
    ["add_comment", "move_current_task"].some(
      (name) => "taskId" in (toolByName.get(name)?.inputSchema.properties ?? {}),
    ),
    false,
  );

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

  const commentArguments = {
    body: "Implementation complete; handing off for review.",
    idempotencyKey: "agent-comment",
  };
  await client.callTool({ name: "add_comment", arguments: commentArguments });
  await client.callTool({ name: "add_comment", arguments: commentArguments });
  await client.callTool({
    name: "move_current_task",
    arguments: {
      destinationColumnId: "review",
      expectedRevision: inspectedTask.revision,
      idempotencyKey: "agent-move",
    },
  });

  const updated = application.queryTask(created.task.id);
  assert.equal(updated.available, true);
  if (!updated.available) return;
  assert.equal(updated.task.columnId, "review");
  assert.deepEqual(
    updated.task.comments.map((comment) => ({ body: comment.body, actor: comment.actor })),
    [
      {
        body: "Implementation complete; handing off for review.",
        actor: { kind: "agent", id: "implementer" },
      },
    ],
  );
});

function textContent(content: unknown): string {
  assert.ok(Array.isArray(content));
  const first = content[0] as { type?: string; text?: string } | undefined;
  assert.equal(first?.type, "text");
  assert.ok(typeof first?.text === "string");
  return first.text;
}

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

test("the project MCP exposes only current-task inspection, comment, and movement", async (t) => {
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
    ["inspect_current_task", "add_comment", "move_current_task"],
  );
  assert.deepEqual(Object.keys(listed.tools[0]?.inputSchema.properties ?? {}), []);
  assert.deepEqual(Object.keys(listed.tools[1]?.inputSchema.properties ?? {}), [
    "body",
    "idempotencyKey",
  ]);
  assert.deepEqual(Object.keys(listed.tools[2]?.inputSchema.properties ?? {}), [
    "destinationColumnId",
    "expectedRevision",
    "idempotencyKey",
  ]);
  assert.equal(
    listed.tools.some((tool) => "taskId" in (tool.inputSchema.properties ?? {})),
    false,
  );

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

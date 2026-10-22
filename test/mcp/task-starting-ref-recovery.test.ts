import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { createActivationFixture } from "../support/activation-fixture.ts";

test("scoped MCP corrects another task base ref without rewriting content or bypassing revision and provenance", async (t) => {
  const fixture = await createActivationFixture("mcp-starting-ref");
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => application.close());
  const origin = application.createTask({ boardId: "delivery", columnId: "backlog", title: "Integrator",
    description: "Coordinate child work", actor: { kind: "user", id: "paul" }, idempotencyKey: "origin" });
  assert.ok(origin.accepted);
  const child = application.createChildTask({ parentTaskId: origin.task.id, boardId: "delivery", columnId: "implementation",
    title: "Child", description: "Keep this description", startingRef: "mistyped-ref", resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "child" });
  assert.ok(child.accepted);
  const scopes = new AgentToolScopeRegistry();
  const token = scopes.issue({ taskId: origin.task.id, agentId: "implementer" });
  const server = await startWebServer(application, { host: "127.0.0.1", port: 0, agentToolScopes: scopes });
  t.after(() => server.close());
  const client = new Client({ name: "starting-ref-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath,
    args: ["--experimental-strip-types", join(process.cwd(), "src/mcp/stdio-server.ts"), "--base-url", server.baseUrl, "--token", token], stderr: "pipe" }));
  t.after(() => client.close());
  const call = async (name: string, arguments_: Record<string, unknown>) => {
    const result = await client.callTool({ name, arguments: arguments_ });
    const text = (result.content as Array<{ type: string; text?: string }>).find((item) => item.type === "text")?.text;
    assert.ok(text);
    return { result, body: JSON.parse(text) };
  };
  const before = await call("task.inspect", { taskId: child.task.id });
  assert.deepEqual(before.body.task.workspaceStatus, { state: "unprovisioned", startingRef: "mistyped-ref", startingRefEditable: true });
  const correction = { taskId: child.task.id, startingRef: " main ", expectedRevision: 1, idempotencyKey: "correct" };
  const edited = await call("task.edit", correction);
  assert.equal(edited.result.isError, undefined);
  assert.equal(edited.body.task.revision, 2);
  const after = await call("task.inspect", { taskId: child.task.id });
  assert.equal(after.body.task.workspaceStatus.startingRef, "main");
  assert.equal(after.body.task.description, "Keep this description");
  assert.deepEqual(await call("task.edit", correction), edited);
  assert.equal((await call("task.edit", { ...correction, startingRef: "other" })).body.reason, "idempotency-conflict");
  assert.equal((await call("task.edit", { ...correction, expectedRevision: 1, idempotencyKey: "stale" })).body.reason, "revision-conflict");
  assert.equal((await call("task.edit", { ...correction, startingRef: "  ", expectedRevision: 2, idempotencyKey: "blank" })).body.reason, "invalid-starting-ref");
  assert.equal((await call("task.edit", { taskId: child.task.id, description: "Content only", expectedRevision: 2, idempotencyKey: "content" })).body.accepted, true);
  const task = application.queryTask(child.task.id);
  assert.ok(task.available);
  const event = task.task.activity.find((entry) => entry.type === "task.edited");
  assert.deepEqual(event?.actor, { kind: "agent", id: "implementer" });
  assert.deepEqual(event?.details, { originTaskId: origin.task.id, originTaskTitle: "Integrator", changedFields: "startingRef", previousStartingRef: "mistyped-ref", startingRef: "main" });
  assert.equal(task.task.activations.length, 1);
  const current = await call("task.inspect", { taskId: "current" });
  assert.equal(current.body.task.workspaceStatus.startingRef, "main");
  assert.equal(current.body.task.revision, 1);
});

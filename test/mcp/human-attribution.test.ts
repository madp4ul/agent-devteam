import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { join } from "node:path";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";
import { ConversationContextDeliveryModule } from "../../src/application/internal/conversation-context-delivery-module.ts";
import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";

for (const storedData of ["fresh", "legacy"] as const) {
test(`${storedData}: browser human comments retain unique IDs and canonical attribution through actual MCP and activation context`, async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const options = {
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  };
  let application = await CoordinationApplication.start(options);
  t.after(() => application.close());
  const scopes = new AgentToolScopeRegistry();
  let server = await startWebServer(application, { host: "127.0.0.1", port: 0, agentToolScopes: scopes });
  t.after(() => server.close());
  const post = async (path: string, body: object) => {
    const response = await fetch(`${server.baseUrl}/api/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    assert.ok(response.ok, await response.clone().text());
    return response.json();
  };
  const created = await post("tasks", { boardId: "delivery", columnId: "implementation", title: "Human attribution", description: "Inspect attribution", idempotencyKey: "create" });
  const taskId = created.task.id;
  const commented = await post(`tasks/${taskId}/comments`, { body: "@user @implementer Please reply to me.", idempotencyKey: "comment" });
  const comment = commented.task.comments[0];
  assert.deepEqual(comment.actor, { kind: "user", id: "user" });
  assert.notEqual(comment.id, "user");
  assert.deepEqual(commented.task.activations.map((activation: { targetAgentId: string; reason: { type: string } }) =>
    [activation.targetAgentId, activation.reason.type]), [["implementer", "column-entry"], ["implementer", "agent-mention"]]);
  const inspected = application.queryTaskInspectionForUser(taskId);
  assert.ok(inspected.available);
  assert.equal(inspected.task.unresolvedAttention.length, 0, "human self mentions do not request attention");
  if (storedData === "legacy") {
    const task = application.queryTask(taskId);
    assert.ok(task.available);
    await server.close();
    await application.close();
    const owner = await CoordinationDatabase.open(fixture.databasePath);
    const context = new ConversationContextDeliveryModule(owner).composeAndRecordActivationContext(task.task.activations[0]!.id, task.task);
    owner.close();
    // Model a retained released database, including a context captured before restart.
    const database = new DatabaseSync(fixture.databasePath);
    for (const table of ["task_comments", "activity_ledger"]) {
      database.exec(`UPDATE ${table} SET actor_id = 'local-user' WHERE actor_kind = 'user'`);
    }
    const toLegacy = (json: string) => JSON.stringify(JSON.parse(json, (_key, value) => {
      if (value?.kind === "user" && value.id === "user") value.id = "local-user";
      return value;
    }));
    database.prepare("UPDATE activation_contexts SET context_json = ?").run(toLegacy(JSON.stringify(context)));
    const rows = database.prepare("SELECT * FROM command_responses").all() as Array<{ command_type: string; idempotency_key: string; response_json: string }>;
    for (const row of rows) {
      const identity = JSON.parse(row.command_type);
      if (identity[1]?.[0] === "user") identity[1][1] = "local-user";
      database.prepare("UPDATE command_responses SET command_type = ?, response_json = ? WHERE command_type = ? AND idempotency_key = ?")
        .run(JSON.stringify(identity), toLegacy(row.response_json), row.command_type, row.idempotency_key);
    }
    database.exec("DELETE FROM coordination_migrations WHERE migration_id = '0013_canonical_human_identity'");
    database.close();
    application = await CoordinationApplication.start(options);
    server = await startWebServer(application, { host: "127.0.0.1", port: 0, agentToolScopes: scopes });
    const replay = await post(`tasks/${taskId}/comments`, { body: "@user @implementer Please reply to me.", idempotencyKey: "comment" });
    assert.equal(replay.task.comments[0].id, comment.id, "upgrade preserves retry identity");
    assert.deepEqual(replay.task.comments[0].actor, { kind: "user", id: "user" });
  }
  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  const token = scopes.issue({ taskId, agentId: "implementer", attemptId: request.attemptId });
  const client = new Client({ name: "human-attribution-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [
    "--experimental-strip-types", join(process.cwd(), "src/mcp/stdio-server.ts"), "--base-url", server.baseUrl, "--token", token,
  ], stderr: "pipe" }));
  t.after(() => client.close());
  const history = await client.callTool({ name: "task.history.list", arguments: { taskId: "current" } });
  const text = (history.content as Array<{ text: string }>).map((item) => item.text).join("\n");
  const record = JSON.parse(text).history.records.find((entry: { id: string }) => entry.id === comment.id);
  assert.deepEqual(record.author, { kind: "user", id: "user" });
  assert.doesNotMatch(text, /local-user/);
  const inspection = await client.callTool({ name: "task.inspect", arguments: { taskId: "current" } });
  assert.doesNotMatch(JSON.stringify(inspection.content), /local-user/);
  assert.deepEqual(request.sourceEvent.actor, { kind: "user", id: "user" });
  assert.doesNotMatch(JSON.stringify(request.activationContext), /local-user/);
  assert.match(JSON.stringify(request.activationContext), /"id":"user"/);
  const reply = await client.callTool({ name: "task.comment.add", arguments: { taskId: "current", body: "@user Replying to your comment.", idempotencyKey: "reply" } });
  assert.equal(reply.isError, undefined);
  const attention = application.queryTaskInspectionForUser(taskId);
  assert.ok(attention.available);
  assert.equal(attention.task.unresolvedAttention.length, 1);
  assert.equal(attention.task.unresolvedAttention[0]?.type, "user-mention");
  await application.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Checked attribution", threadId: "human-attribution-thread" });
  await application.waitForAutomationIdle();
  await application.resumeAutomation();
  const mentioned = await runtime.waitForRequest(2);
  assert.equal(mentioned.sourceEvent.id, comment.id);
  assert.deepEqual(mentioned.sourceEvent.actor, { kind: "user", id: "user" });
  await application.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Replied to human comment", threadId: "human-attribution-thread" });
  await application.waitForAutomationIdle();
});

}

import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";
import { ControlledRetryClock } from "../support/activation-fixture.ts";

test("HTTP task and conversation expose durable waiting and existing dismissal stops retries", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime("http-thread");
  const clock = new ControlledRetryClock("2027-01-01T12:00:00Z");
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime }, automationClock: clock });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Waiting via HTTP", description: "Outage", actor: { kind: "user", id: "paul" }, idempotencyKey: "http-outage" });
  assert.ok(created.accepted);
  await app.resumeAutomation(); await runtime.waitForRequest(1);
  runtime.complete({ status: "failed", summary: "Usage limit reached", failure: { code: "usage_limit_reached", retryAt: "2027-01-01T13:00:00Z" }, threadId: "http-thread" });
  app.pauseAutomation(); await app.waitForAutomationIdle();
  const assets = await mkdtemp(join(tmpdir(), "runtime-assets-")); await writeFile(join(assets, "index.html"), "<div></div>");
  const server = await startWebServer(app, { host: "127.0.0.1", port: 0, assetDirectory: assets }); t.after(() => server.close());
  const task = await (await fetch(`${server.baseUrl}/api/tasks/${created.task.id}`)).json();
  const activation = task.task.activations[0]; assert.equal(activation.recovery.state, "waiting");
  assert.equal(activation.recovery.dueAt, "2027-01-01T13:00:00.000Z"); assert.equal(task.inspection.unresolvedAttention.length, 0);
  const conversation = await (await fetch(`${server.baseUrl}/api/tasks/${created.task.id}/conversations/${activation.conversationId}`)).json();
  assert.equal(conversation.conversation.runtimeRecovery.episodeId, activation.recovery.episodeId);
  const stopped = await fetch(`${server.baseUrl}/api/activations/${activation.id}/dismiss`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: "http-stop" }) });
  assert.equal(stopped.status, 200);
  const after = await (await fetch(`${server.baseUrl}/api/tasks/${created.task.id}`)).json();
  assert.equal(after.task.activations[0].status, "dismissed"); assert.equal(after.task.activations[0].recovery, null);
});

import assert from "node:assert/strict";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import type { ArchivalOperation } from "../../src/application/archival-operation-contract.ts";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { GitTaskWorkspaceManager } from "../../src/application/internal/git-task-workspace.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";

test("HTTP queues distinct Completion columns during Git inspection and reconciles durable operation results", async (t) => {
  const fixture = await createHandoffFixture();
  await appendFile(fixture.definitionPath, `  - id: second
    name: Second board
    guidance: Complete independent work.
    columns:
      - id: backlog
        name: Backlog
`);
  const runtime = new ControlledAgentRuntime();
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } };
  const app = await CoordinationApplication.start(options);
  const actor = { kind: "user" as const, id: "user" };
  const create = (boardId: string, columnId: string, title: string) => {
    const result = app.createTask({ boardId, columnId, title, description: "Disposable test task", actor, idempotencyKey: title });
    assert.ok(result.accepted, JSON.stringify(result));
    return result.task;
  };
  const complete = (taskId: string) => {
    const detail = app.queryTaskInspectionForUser(taskId);
    assert.ok(detail.available);
    const result = app.moveTask({ taskId, destinationColumnId: "completion", expectedRevision: detail.task.revision, actor, idempotencyKey: `complete-${taskId}` });
    assert.ok(result.accepted, JSON.stringify(result));
  };
  const blocked = create("delivery", "implementation", "Dirty workspace");
  await app.resumeAutomation();
  const run = await runtime.waitForRequest(1);
  app.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Finished" });
  await app.waitForAutomationIdle();
  await writeFile(join(run.workspace.path, "untracked.txt"), "Retain this");
  complete(blocked.id);
  const clean = create("delivery", "review", "Archivable delivery task");
  // Review creates an activation, so use a second completed task without a workspace.
  const inspection = app.queryTask(clean.id);
  assert.ok(inspection.available);
  const queued = inspection.task.activations.find((activation) => activation.status === "queued");
  assert.ok(queued);
  assert.ok(app.dismissActivation({ activationId: queued.id, actor, idempotencyKey: "dismiss-review" }).accepted);
  complete(clean.id);
  const other = create("second", "backlog", "Second completed task");
  complete(other.id);

  const assets = join(fixture.repositoryPath, "..", "assets");
  await mkdir(assets);
  await writeFile(join(assets, "index.html"), "<div></div>");
  const server = await startWebServer(app, { host: "127.0.0.1", port: 0, assetDirectory: assets });
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const original = GitTaskWorkspaceManager.prototype.removeForArchival;
  t.mock.method(GitTaskWorkspaceManager.prototype, "removeForArchival", async function (this: GitTaskWorkspaceManager, ...args: Parameters<typeof original>) {
    if (args[0] === blocked.id) { entered.resolve(); await release.promise; }
    return original.apply(this, args);
  });
  const post = async (boardId: string, idempotencyKey: string): Promise<ArchivalOperation> => {
    const started = performance.now();
    const response = await fetch(`${server.baseUrl}/api/archive/completed`, { method: "POST", signal: AbortSignal.timeout(5000),
      headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId, idempotencyKey, background: true }) });
    const body = await response.json();
    assert.equal(response.status, 202, JSON.stringify(body));
    t.diagnostic(`${boardId} archival acknowledged in ${Math.round(performance.now() - started)} ms.`);
    return body.operation;
  };
  const read = async (id: string): Promise<ArchivalOperation> => {
    const response = await fetch(`${server.baseUrl}/api/archive/operations/${id}`);
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const first = await post("delivery", "delivery-archive");
    await entered.promise;
    const second = await post("second", "second-archive");
    assert.equal(second.state, "queued");
    assert.equal((await post("delivery", "duplicate-archive")).id, first.id);
    assert.equal((await read("duplicate-archive")).id, first.id);
    assert.equal((await post("delivery", first.id)).id, first.id);
    assert.equal((await read(first.id)).tasks[0]?.state, "running");
    assert.equal((await read(second.id)).state, "queued");
    const originalScope = await fetch(`${server.baseUrl}/api/tasks/${blocked.id}/archive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "reviewed-scope", background: true, archivalPreviewToken: "reviewed-token" }),
    });
    assert.equal(originalScope.status, 202);
    const differentScope = await fetch(`${server.baseUrl}/api/tasks/${blocked.id}/archive`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "ordinary-scope", background: true }),
    });
    assert.equal(differentScope.status, 409);
    assert.equal((await differentScope.json()).reason, "archive-in-progress");
    const dismiss = await fetch(`${server.baseUrl}/api/archive/operations/${second.id}/dismiss`, { method: "POST" });
    assert.equal(dismiss.status, 200);
    const visible = await (await fetch(`${server.baseUrl}/api/archive/operations`)).json() as ArchivalOperation[];
    assert.deepEqual(new Set(visible.filter((operation) => !operation.feedbackDismissed).map(({ id }) => id)), new Set([first.id, second.id, "reviewed-scope"]));
    assert.equal(visible.find(({ id }) => id === second.id)?.state, "queued");
    const listUrl = `${server.baseUrl}/api/archive/operations`;
    const listResponse = await fetch(listUrl);
    const version = listResponse.headers.get("etag");
    assert.ok(version);
    await listResponse.text();
    assert.equal((await fetch(listUrl, { headers: { "if-none-match": version } })).status, 304);
    assert.equal((await fetch(`${server.baseUrl}/api/board`, { signal: AbortSignal.timeout(2000) })).status, 200);
    const cleanupStarted = performance.now();
    release.resolve();
    let result = await read(second.id);
    for (let attempt = 0; attempt < 100 && result.state !== "completed"; attempt++) {
      await delay(30);
      result = await read(second.id);
    }
    assert.deepEqual(result.tasks.map(({ taskId, state }) => [taskId, state]), [[other.id, "archived"]]);
    const firstResult = await read(first.id);
    assert.equal((await post("delivery", "duplicate-archive")).id, first.id);
    assert.equal(firstResult.state, "completed");
    assert.deepEqual(firstResult.tasks.map(({ taskId, state, failure }) => [taskId, state, failure?.reason]),
      [[blocked.id, "failed", "workspace-dirty"], [clean.id, "archived", undefined]]);
    t.diagnostic(`Real Git check and both batches settled in ${Math.round(performance.now() - cleanupStarted)} ms after releasing the held task.`);
  } finally {
    release.resolve();
    await app.prepareShutdown();
    await server.close();
    app.close();
  }
  const restarted = await CoordinationApplication.start(options);
  try {
    assert.equal(restarted.queryArchivalOperation("delivery-archive")?.tasks[0]?.failure?.reason, "workspace-dirty");
    assert.equal(restarted.queryArchivalOperation("second-archive")?.tasks[0]?.state, "archived");
  } finally { restarted.close(); }
});

test("restart interrupts unfinished archival operations without replaying deletion", async () => {
  const fixture = await createHandoffFixture();
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath };
  const app = await CoordinationApplication.start(options);
  const actor = { kind: "user" as const, id: "user" };
  const task = app.createTask({ boardId: "delivery", columnId: "review", title: "Keep after restart", description: "Do not replay deletion",
    actor, idempotencyKey: "create-restart-archive" });
  assert.ok(task.accepted);
  app.close();

  const database = new DatabaseSync(fixture.databasePath);
  const operation: ArchivalOperation = { id: "crashed-archive", target: { kind: "task", taskId: task.task.id }, label: task.task.title,
    state: "running", updatedAt: new Date().toISOString(), tasks: [{ taskId: task.task.id, title: task.task.title, state: "running" }] };
  database.prepare("INSERT INTO archival_operations(id, request_hash, target_key, target_json, label, state, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(operation.id, "fixture-hash", `task:${task.task.id}`, JSON.stringify(operation.target), operation.label, operation.state, operation.updatedAt);
  database.prepare("INSERT INTO archival_operation_tasks (operation_id, position, task_id, title, state, failure_json, updated_at) VALUES (?, ?, ?, ?, ?, NULL, ?)")
    .run(operation.id, 0, task.task.id, task.task.title, "running", operation.updatedAt);
  database.close();

  const restarted = await CoordinationApplication.start(options);
  try {
    const recovered = restarted.queryArchivalOperation(operation.id);
    assert.equal(recovered?.state, "interrupted");
    assert.equal(recovered.tasks[0]?.failure?.reason, "interrupted");
    assert.equal(restarted.queryArchivalMenu().entries[0]?.state, "interrupted");
    const detail = restarted.queryTaskInspectionForUser(task.task.id);
    assert.ok(detail.available);
    assert.notEqual(detail.task.archived, true);
  } finally { restarted.close(); }
});

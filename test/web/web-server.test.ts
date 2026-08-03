import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";

test("the browser adapter serves the React application and authoritative board projection", async (t) => {
  const fixture = await createFixture("browser-state");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Inspect this task",
    description: "The browser reads the authoritative projection.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "fixture-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());

  for (const path of ["/", `/tasks/${created.task.id}`]) {
    const response = await fetch(`${server.baseUrl}${path}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }
  const asset = await fetch(`${server.baseUrl}/assets/app.js`);
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("content-type"), "text/javascript; charset=utf-8");

  const response = await fetch(`${server.baseUrl}/api/board`);
  assert.equal(response.status, 200);
  const projection = (await response.json()) as {
    startup: { mode: string };
    automation: { state: string };
    boards: Array<{
      columns: Array<{
        id: string;
        watchingAgent: { name: string } | null;
        tasks: Array<{ id: string; unresolvedAttention: unknown[] }>;
      }>;
    }>;
  };
  assert.equal(projection.startup.mode, "paused");
  assert.equal(projection.automation.state, "paused");
  assert.deepEqual(
    projection.boards[0]?.columns.map((column) => ({
      id: column.id,
      watcher: column.watchingAgent?.name ?? null,
      tasks: column.tasks.map((task) => task.id),
    })),
    [
      { id: "backlog", watcher: null, tasks: [created.task.id] },
      { id: "implementation", watcher: "Implementation Agent", tasks: [] },
      { id: "completion", watcher: null, tasks: [] },
    ],
  );
  assert.deepEqual(projection.boards[0]?.columns[0]?.tasks[0]?.unresolvedAttention, []);

  const taskResponse = await fetch(`${server.baseUrl}/api/tasks/${created.task.id}`);
  assert.equal(taskResponse.status, 200);
  const detail = (await taskResponse.json()) as { task: { id: string }; board: { id: string } };
  assert.equal(detail.task.id, created.task.id);
  assert.equal(detail.board.id, "delivery");
});

test("browser commands preserve creation idempotency and revision conflicts", async (t) => {
  const fixture = await createFixture("browser-commands");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());

  const createBody = {
    boardId: "delivery",
    columnId: "backlog",
    title: "Create from the board",
    description: "A complete task authored through the browser adapter.",
    idempotencyKey: "browser-create",
  };
  const firstCreate = await postJson(`${server.baseUrl}/api/tasks`, createBody);
  const retriedCreate = await postJson(`${server.baseUrl}/api/tasks`, createBody);
  assert.equal(firstCreate.response.status, 201);
  assert.deepEqual(retriedCreate.body, firstCreate.body);
  const created = firstCreate.body as { accepted: true; task: { id: string; revision: number } };

  const edit = await fetch(`${server.baseUrl}/api/tasks/${created.task.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      title: "Inspect and control a task",
      description: "The details remain editable beside their current values.",
      expectedRevision: 1,
      idempotencyKey: "browser-edit",
    }),
  });
  assert.equal(edit.status, 200);

  const move = await postJson(`${server.baseUrl}/api/tasks/${created.task.id}/move`, {
    destinationColumnId: "implementation",
    expectedRevision: 2,
    idempotencyKey: "browser-move",
  });
  assert.equal(move.response.status, 200);

  const conflict = await postJson(`${server.baseUrl}/api/tasks/${created.task.id}/move`, {
    destinationColumnId: "completion",
    expectedRevision: 2,
    idempotencyKey: "browser-stale-move",
  });
  assert.equal(conflict.response.status, 409);
  assert.equal((conflict.body as { reason: string }).reason, "revision-conflict");

  const invalid = await postJson(`${server.baseUrl}/api/tasks`, {
    ...createBody,
    title: "",
    idempotencyKey: "invalid-create",
  });
  assert.equal(invalid.response.status, 400);
  assert.equal((invalid.body as { reason: string }).reason, "empty-title");
});

test("browser state reports configuration errors and resume rejection as JSON", async (t) => {
  const fixture = await createFixture("browser-errors", 7);
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());

  const state = await fetch(`${server.baseUrl}/api/board`);
  assert.equal(state.status, 409);
  const stateBody = (await state.json()) as { startup: { mode: string; diagnostics: unknown[] } };
  assert.equal(stateBody.startup.mode, "configuration-error");
  assert.equal(stateBody.startup.diagnostics.length, 1);

  const resume = await postJson(`${server.baseUrl}/api/automation/resume`, {});
  assert.equal(resume.response.status, 409);
  assert.equal((resume.body as { accepted: boolean }).accepted, false);
});

async function createFixture(name: string, schemaVersion = 1): Promise<{
  definitionPath: string;
  databasePath: string;
  assetDirectory: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `coordination-web-${name}-`));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "agent.md"), "Implement the current task.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: ${schemaVersion}
name: Web process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep movement explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements tasks
    summary: Builds changes.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );
  const assetDirectory = join(directory, "web");
  await mkdir(join(assetDirectory, "assets"), { recursive: true });
  await writeFile(
    join(assetDirectory, "index.html"),
    '<!doctype html><html><body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
  );
  await writeFile(join(assetDirectory, "assets", "app.js"), "console.log('app');\n");
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    assetDirectory,
  };
}

async function postJson(url: string, body: unknown): Promise<{ response: Response; body: unknown }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { startWebServer } from "../../src/web/web-server.ts";

const execFileAsync = promisify(execFile);

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
  assert.deepEqual(
    await taskResponse.json(),
    JSON.parse(JSON.stringify(application.queryUserTaskDetail(created.task.id))),
  );

  const missingTaskResponse = await fetch(`${server.baseUrl}/api/tasks/missing-task`);
  assert.equal(missingTaskResponse.status, 404);
  assert.deepEqual(await missingTaskResponse.json(), {
    available: false,
    reason: "not-found",
  });
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

test("browser conversation continuation accepts and replays one authored follow-up", async (t) => {
  const fixture = await createFixture("browser-conversation-follow-up");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Continue through the browser adapter",
    description: "Resume the existing conversation through HTTP.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "browser-follow-up-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const activation = created.task.activations[0];
  assert.ok(activation?.conversationId);
  const database = new DatabaseSync(fixture.databasePath);
  database.prepare("UPDATE activations SET status = 'completed' WHERE id = ?").run(activation.id);
  database.prepare("UPDATE agent_conversations SET current_thread_id = ? WHERE id = ?")
    .run("browser-existing-thread", activation.conversationId);
  database.close();
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());
  const body = { body: "Please check the browser boundary.", idempotencyKey: "browser-follow-up" };

  const accepted = await postJson(
    `${server.baseUrl}/api/tasks/${created.task.id}/conversations/${activation.conversationId}`,
    body,
  );
  const replayed = await postJson(
    `${server.baseUrl}/api/tasks/${created.task.id}/conversations/${activation.conversationId}`,
    body,
  );

  assert.equal(accepted.response.status, 200);
  assert.deepEqual(replayed.body, accepted.body);
  const conversationResponse = await fetch(
    `${server.baseUrl}/api/tasks/${created.task.id}/conversations/${activation.conversationId}`,
  );
  assert.equal(conversationResponse.status, 200);
  const conversation = await conversationResponse.json() as {
    conversation: { history: Array<{ kind: string; message?: { body: string } }> };
  };
  assert.deepEqual(
    conversation.conversation.history.flatMap((entry) => entry.kind === "message" && entry.message !== undefined
      ? [entry.message.body]
      : []),
    [body.body],
  );
});

test("browser conversation retirement validates, accepts, and replays the user reason", async (t) => {
  const fixture = await createFixture("browser-conversation-retirement");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retire through the browser adapter",
    description: "Keep retirement atomic at the HTTP boundary.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "browser-retirement-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const activation = created.task.activations[0];
  assert.ok(activation?.conversationId);
  const database = new DatabaseSync(fixture.databasePath);
  database.prepare("UPDATE activations SET status = 'completed' WHERE id = ?").run(activation.id);
  database.close();
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());
  const url = `${server.baseUrl}/api/tasks/${created.task.id}/conversations/${activation.conversationId}/retire`;

  const invalid = await postJson(url, { reason: "", idempotencyKey: "empty-browser-retirement" });
  assert.equal(invalid.response.status, 400);
  const body = {
    reason: "The conversation assumes an obsolete browser contract.",
    idempotencyKey: "browser-retirement",
  };
  const accepted = await postJson(url, body);
  const replayed = await postJson(url, body);
  assert.equal(accepted.response.status, 200);
  assert.deepEqual(replayed.body, accepted.body);
  const detail = await fetch(
    `${server.baseUrl}/api/tasks/${created.task.id}/conversations/${activation.conversationId}`,
  );
  assert.equal(detail.status, 200);
  assert.equal(((await detail.json()) as { conversation: { retirement: { reason: string } } })
    .conversation.retirement.reason, body.reason);
});

test("browser attention projection is grouped and user mentions resolve through their explicit action", async (t) => {
  const fixture = await createFixture("browser-attention");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Approve the delivery policy",
    description: "The board must retain the request.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "attention-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  application.addTaskComment({
    taskId: created.task.id,
    body: "@user please approve this policy.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "attention-comment",
  });
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());

  const board = await fetch(`${server.baseUrl}/api/board`);
  const projection = (await board.json()) as {
    attention: Array<{ task: { id: string }; reasons: Array<{ id: string; type: string }> }>;
  };
  assert.equal(projection.attention[0]?.task.id, created.task.id);
  assert.equal(projection.attention[0]?.reasons[0]?.type, "user-mention");
  const reasonId = projection.attention[0]?.reasons[0]?.id;
  assert.ok(reasonId);

  const ordinaryComment = await postJson(
    `${server.baseUrl}/api/tasks/${created.task.id}/comments`,
    { body: "I am investigating without addressing the request.", idempotencyKey: "browser-comment" },
  );
  assert.equal(ordinaryComment.response.status, 201);
  const stillPresent = (await (await fetch(`${server.baseUrl}/api/board`)).json()) as {
    attention: Array<{ reasons: Array<{ id: string }> }>;
  };
  assert.equal(stillPresent.attention[0]?.reasons[0]?.id, reasonId);

  const addressed = await postJson(
    `${server.baseUrl}/api/attention/${reasonId}/mark-addressed`,
    { idempotencyKey: "browser-addressed" },
  );
  assert.equal(addressed.response.status, 200);
  const refreshed = (await (await fetch(`${server.baseUrl}/api/board`)).json()) as {
    attention: unknown[];
  };
  assert.deepEqual(refreshed.attention, []);
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

  const task = await fetch(`${server.baseUrl}/api/tasks/any-task`);
  assert.equal(task.status, 409);
  assert.deepEqual(
    await task.json(),
    JSON.parse(JSON.stringify(application.queryUserTaskDetail("any-task"))),
  );

  const resume = await postJson(`${server.baseUrl}/api/automation/resume`, {});
  assert.equal(resume.response.status, 409);
  assert.equal((resume.body as { accepted: boolean }).accepted, false);
});

test("open workspace uses only the authoritative provisioned path and reports host availability", async (t) => {
  const fixture = await createFixture("open-workspace");
  const repositoryPath = join(fixture.directory, "project repository");
  const workspaceRoot = join(fixture.directory, "task workspaces");
  await mkdir(repositoryPath);
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await execFileAsync("git", ["-C", repositoryPath, "config", "user.email", "test@example.com"]);
  await execFileAsync("git", ["-C", repositoryPath, "config", "user.name", "Test User"]);
  await writeFile(join(repositoryPath, "README.md"), "# Test project\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", ["-C", repositoryPath, "commit", "-m", "Initial commit"]);
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: repositoryPath,
      taskWorkspaceRoot: workspaceRoot,
      agentRuntime: {
        run: async (_request, lifecycle) => {
          lifecycle.started("thread-open-workspace");
          return { status: "completed", summary: "Workspace provisioned." };
        },
      },
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Open this workspace",
    description: "Use the persisted task worktree path.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "open-workspace-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await application.waitForAutomationIdle();

  let openedPath: string | undefined;
  let openedInVisualStudioCodePath: string | undefined;
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
    openWorkspace: async (_taskId, workspace) => { openedPath = workspace.path; },
    openWorkspaceInVisualStudioCode: async (_taskId, workspace) => {
      openedInVisualStudioCodePath = workspace.path;
    },
  });
  t.after(() => server.close());
  const opened = await postJson(
    `${server.baseUrl}/api/tasks/${created.task.id}/workspace/open`,
    {},
  );
  assert.equal(opened.response.status, 200);
  assert.equal(openedPath, join(workspaceRoot, created.task.id));

  const gitStateResponse = await fetch(
    `${server.baseUrl}/api/tasks/${created.task.id}/workspace/git-state`,
  );
  const expectedShortHash = (await execFileAsync("git", [
    "-C", join(workspaceRoot, created.task.id), "rev-parse", "--short=7", "HEAD",
  ])).stdout.trim();
  assert.equal(gitStateResponse.status, 200);
  assert.deepEqual(await gitStateResponse.json(), {
    available: true,
    state: {
      head: { kind: "detached", shortHash: expectedShortHash },
      history: { kind: "progress", commitsSinceTaskStart: 0 },
      changes: {
        additions: 0,
        deletions: 0,
        stagedFiles: 0,
        unstagedFiles: 0,
        untrackedFiles: 0,
      },
    },
  });

  const openedInVisualStudioCode = await postJson(
    `${server.baseUrl}/api/tasks/${created.task.id}/workspace/open-vscode`,
    {},
  );
  assert.equal(openedInVisualStudioCode.response.status, 200);
  assert.equal(openedInVisualStudioCodePath, join(workspaceRoot, created.task.id));

  const unavailableServer = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => unavailableServer.close());
  const unavailable = await postJson(
    `${unavailableServer.baseUrl}/api/tasks/${created.task.id}/workspace/open`,
    {},
  );
  assert.equal(unavailable.response.status, 503);
  assert.deepEqual(unavailable.body, {
    reason: "host-integration-unavailable",
    diagnostic: "Opening task workspaces is unavailable on this host.",
  });
});

test("browser archive endpoints remove tasks from the board and support history and unarchive", async (t) => {
  const fixture = await createFixture("browser-archive");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Archive through the browser",
    description: "The browser uses the same archival command seam.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-browser-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const server = await startWebServer(application, {
    host: "127.0.0.1",
    port: 0,
    assetDirectory: fixture.assetDirectory,
  });
  t.after(() => server.close());

  const archived = await fetch(`${server.baseUrl}/api/tasks/${created.task.id}/archive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "archive-from-browser" }),
  });
  assert.equal(archived.status, 200);
  const board = await (await fetch(`${server.baseUrl}/api/board`)).json() as {
    boards: Array<{ columns: Array<{ tasks: Array<{ id: string }> }> }>;
  };
  assert.deepEqual(board.boards[0]?.columns.flatMap((column) => column.tasks), []);
  const history = await (await fetch(`${server.baseUrl}/api/archive`)).json() as {
    tasks: Array<{ id: string }>;
  };
  assert.deepEqual(history.tasks.map(({ id }) => id), [created.task.id]);

  const unarchived = await fetch(`${server.baseUrl}/api/tasks/${created.task.id}/unarchive`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ idempotencyKey: "unarchive-from-browser" }),
  });
  assert.equal(unarchived.status, 200);
  const restored = await application.queryTaskInspectionForUser(created.task.id);
  assert.equal(restored.available, true);
  if (restored.available) assert.notEqual(restored.task.archived, true);
});

async function createFixture(name: string, schemaVersion = 1): Promise<{
  directory: string;
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
    directory,
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

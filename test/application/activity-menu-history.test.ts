import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";
import { ActivityMenuStore } from "../../src/application/internal/activity-menu-store.ts";
import { ArchivalOperationStore } from "../../src/application/internal/archival-operation-store.ts";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { createActivationFixture } from "../support/activation-fixture.ts";
import { startWebServer } from "../../src/web/web-server.ts";

test("preparation outcomes and dismissal survive reopen while active entries cannot be dismissed", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "activity-menu-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "state.sqlite3");
  let db = await CoordinationDatabase.open(path);
  const store = new ActivityMenuStore(db);
  for (const id of ["prepared", "failed", "in-flight"]) store.startPreparation({ id, taskId: "T-0001", taskTitle: "Demo", agentId: "builder", startedAt: "2026-11-14T12:00:00Z" });
  store.finishPreparation("prepared", "prepared", "Ready", "2026-11-14T12:01:00Z");
  store.finishPreparation("failed", "failed", "Git failed", "2026-11-14T12:01:00Z");
  store.dismiss(["prepared", "in-flight"]);
  assert.deepEqual(store.read().preparations.map((entry) => entry.id), ["in-flight", "failed"]);
  db.close();
  db = await CoordinationDatabase.open(path);
  try {
    const reopened = new ActivityMenuStore(db);
    reopened.recoverPreparations("2026-11-14T12:02:00Z");
    assert.deepEqual(reopened.read().preparations.map((entry) => [entry.id, entry.status]), [["in-flight", "interrupted"], ["failed", "failed"]]);
    // A result arriving after a dismissal snapshot remains available.
    reopened.dismiss(["failed"]);
    assert.deepEqual(reopened.read().preparations.map((entry) => entry.id), ["in-flight"]);
  } finally { db.close(); }
});

test("the latest thirty run results remain bounded and dismissed history does not backfill", async () => {
  const db = await CoordinationDatabase.open(":memory:");
  try {
    const store = new ActivityMenuStore(db);
    const insert = db.connection.prepare(`INSERT INTO activity_menu_history
      (id, kind, task_id, task_title, agent_id, started_at, finished_at, status, summary)
      VALUES (?, 'run', 'T-0001', 'Demo', 'builder', 'start', 'finish', 'completed', 'Done')`);
    for (let i = 0; i < 45; i++) {
      db.transaction(() => { insert.run(`run-${i}`); store.recordRunWithinTransaction("not-an-attempt"); });
    }
    assert.equal(store.read().runs.length, 30);
    assert.equal(store.read().runs.at(-1)?.id, "run-15");
    store.dismiss(store.read().runs.map((entry) => entry.id));
    assert.deepEqual(store.read().runs, []);
    db.transaction(() => { insert.run("new-run"); store.recordRunWithinTransaction("not-an-attempt"); });
    assert.deepEqual(store.read().runs.map((entry) => entry.id), ["new-run"]);
  } finally { db.close(); }
});

test("archival dismissal only removes finished operations, and retained successes are not silently capped", async () => {
  const db = await CoordinationDatabase.open(":memory:");
  try {
    const store = new ArchivalOperationStore(db);
    for (let i = 0; i < 20; i++) store.create({ id: `archive-${i}`, label: "Demo", target: { kind: "task", taskId: `T-${i}` }, state: i === 0 ? "queued" : "completed", updatedAt: "2026-11-14T12:00:00Z", tasks: [] }, `hash-${i}`);
    store.dismiss("archive-0");
    assert.equal(store.list().length, 20);
    assert.equal(store.read("archive-0")?.operation.feedbackDismissed, undefined);
    store.dismiss("archive-1");
    assert.equal(store.list().length, 19);
  } finally { db.close(); }
});

test("real run outcomes commit menu history, survive source archival and restart, and dismiss through HTTP", async (t) => {
  const fixture = await createActivationFixture("activity-menu-lifecycle");
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: { async run(_request: unknown, lifecycle: { started(): void }) {
        lifecycle.started(); application.pauseAutomation();
        return { status: "completed" as const, summary: "Menu lifecycle proof" };
      } } } };
  const actor = { kind: "user", id: "user" } as const;
  let application = await CoordinationApplication.start(options);
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Archived source", description: "Menu history", actor, idempotencyKey: "menu-source" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.pauseAutomation();
  assert.equal(application.queryActivityMenuHistory().runs[0]?.summary, "Menu lifecycle proof");
  assert.equal(application.queryActivityMenuHistory().preparations[0]?.status, "prepared");
  const archived = await application.archiveTask({ taskId: created.task.id, actor, idempotencyKey: "archive-source" });
  assert.ok(archived.accepted, JSON.stringify(archived));
  assert.equal(application.queryActivityMenuHistory().runs[0]?.taskTitle, "Archived source");
  application.close();
  application = await CoordinationApplication.start(options);
  const server = await startWebServer(application, { host: "127.0.0.1", port: 0 });
  try {
    const history = await (await fetch(`${server.baseUrl}/api/activity-menu/history`)).json();
    assert.equal(history.runs.length, 1);
    assert.equal(history.preparations.length, 1);
    const response = await fetch(`${server.baseUrl}/api/activity-menu/history/dismiss`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [history.runs[0].id] }),
    });
    assert.equal(response.status, 200);
  } finally { await server.close(); application.close(); }
  application = await CoordinationApplication.start(options);
  try { assert.deepEqual(application.queryActivityMenuHistory().runs, []); }
  finally { application.close(); }
});

test("preparation history pages remain bounded, retain older results and always include active work", async () => {
  const db = await CoordinationDatabase.open(":memory:");
  try {
    const store = new ActivityMenuStore(db);
    store.startPreparation({ id: "old-active", taskId: "T-0001", taskTitle: "Still preparing", agentId: "builder", startedAt: "start" });
    for (let index = 0; index < 105; index++) {
      const id = `prepared-${index}`;
      store.startPreparation({ id, taskId: "T-0002", taskTitle: "Prepared", agentId: "builder", startedAt: "start" });
      store.finishPreparation(id, "prepared", "Ready", "finish");
    }
    assert.deepEqual({ active: store.summary().active, history: store.summary().history }, { active: 1, history: 105 });
    const first = store.read();
    assert.equal(first.preparations.length, 51);
    assert.equal(first.preparations[0]?.id, "old-active");
    const second = store.read(first.preparationCursor!);
    const last = store.read(second.preparationCursor!);
    assert.equal(last.preparationCursor, null);
    assert.equal(new Set([...first.preparations, ...second.preparations, ...last.preparations].map((entry) => entry.id)).size, 106);
    store.finishPreparation("old-active", "prepared", "Finished last", "later");
    assert.equal(store.read().preparations[0]?.id, "old-active");
    store.startPreparation({ id: "new-active", taskId: "T-0003", taskTitle: "Still preparing", agentId: "builder", startedAt: "later" });
    store.clearFinished("preparation");
    assert.deepEqual(store.read().preparations.map((entry) => entry.id), ["new-active"]);
  } finally { db.close(); }
});

test("archival menu pages retain all history while clearing only finished work", async () => {
  const db = await CoordinationDatabase.open(":memory:");
  try {
    const store = new ArchivalOperationStore(db);
    for (let index = 0; index < 27; index++) store.create({ id: `archive-${index}`, label: "Batch", target: { kind: "task", taskId: `T-${index}` },
      state: index === 0 ? "queued" : "completed", updatedAt: "2026-11-14T12:00:00Z", tasks: [{ taskId: `T-${index}`, title: "Task", state: index === 0 ? "queued" : "archived" }] }, `hash-${index}`);
    assert.deepEqual(store.summary(), { active: 1, history: 26 });
    const first = store.menu();
    assert.equal(first.entries.length, 21);
    assert.equal(first.entries[0]?.operationId, "archive-0");
    const next = store.menu(first.cursor!);
    assert.equal(next.cursor, null);
    assert.equal(new Set([...first.entries, ...next.entries].map((operation) => operation.id)).size, 27);
    store.clearFinished();
    assert.deepEqual(store.menu().entries.map((entry) => entry.operationId), ["archive-0"]);
  } finally { db.close(); }
});

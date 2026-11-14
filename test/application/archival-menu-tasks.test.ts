import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";
import { ArchivalOperationStore } from "../../src/application/internal/archival-operation-store.ts";
import { coordinationMigrations } from "../../src/application/internal/migrations/registry.ts";
import type { ArchivalOperation } from "../../src/application/archival-operation-contract.ts";

test("archival menu moves each finished task into history while its batch continues", async () => {
  const db = await CoordinationDatabase.open(":memory:");
  try {
    const store = new ArchivalOperationStore(db);
    const operation: ArchivalOperation = { id: "batch", target: { kind: "completion", boardId: "delivery" }, label: "Delivery", state: "queued", updatedAt: "2026-11-14T12:00:00Z",
      tasks: [1, 2, 3].map((index) => ({ taskId: `T-${index}`, title: `Task ${index}`, state: "queued" })) };
    store.create(operation, "request");
    operation.state = "running";
    operation.tasks[0]!.state = "archived";
    operation.tasks[1]!.state = "running";
    store.update(operation, operation.tasks.slice(0, 2));
    assert.deepEqual(store.summary(), { active: 2, history: 1 });
    const first = store.menu();
    assert.equal(first.entries.length, 3);
    const completedAt = first.entries.find((entry) => entry.taskId === "T-1")!.updatedAt;
    store.clearFinished();
    assert.deepEqual(store.menu().entries.map((entry) => entry.taskId), ["T-2", "T-3"]);
    assert.deepEqual(store.summary(), { active: 2, history: 0 });
    operation.tasks[1]!.state = "failed";
    operation.tasks[1]!.failure = { reason: "workspace-dirty" };
    store.update(operation, [operation.tasks[1]!]);
    assert.deepEqual(store.summary(), { active: 1, history: 1 });
    assert.equal(store.menu().entries.find((entry) => entry.taskId === "T-2")?.failure?.reason, "workspace-dirty");
    // Reconciliation must not resurrect an earlier dismissed result or rewrite its time.
    store.update(operation, operation.tasks);
    assert.equal(store.menu().entries.some((entry) => entry.taskId === "T-1"), false);
    assert.equal(db.connection.prepare("SELECT updated_at FROM archival_operation_tasks WHERE operation_id = 'batch' AND task_id = 'T-1'").get()?.updated_at, completedAt);
  } finally { db.close(); }
});

test("one large batch pages by task results rather than by operation", async () => {
  const db = await CoordinationDatabase.open(":memory:");
  try {
    const store = new ArchivalOperationStore(db);
    store.create({ id: "large-batch", target: { kind: "completion", boardId: "delivery" }, label: "Delivery", state: "completed", updatedAt: "2026-11-14T12:00:00Z",
      tasks: Array.from({ length: 37 }, (_, index) => ({ taskId: `T-${index}`, title: `Task ${index}`, state: "archived" })) }, "request");
    assert.deepEqual(store.summary(), { active: 0, history: 37 });
    const first = store.menu();
    assert.equal(first.entries.length, 20);
    const second = store.menu(first.cursor!);
    assert.equal(second.entries.length, 17);
    assert.equal(second.cursor, null);
    assert.equal(new Set([...first.entries, ...second.entries].map((entry) => entry.id)).size, 37);
  } finally { db.close(); }
});

test("upgrading operation-level history preserves dismissal and exposes settled tasks from an unfinished batch", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "archival-task-menu-upgrade-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  const old = new DatabaseSync(path);
  try {
    for (const [index, migration] of coordinationMigrations.slice(0, -1).entries()) {
      migration.apply(old);
      old.prepare("INSERT INTO coordination_migrations VALUES (?, ?)").run(index + 1, migration.id);
    }
    const operation = old.prepare(`INSERT INTO archival_operations (id, request_hash, target_key, target_json, label, state, dismissed, updated_at)
      VALUES (?, 'original-request', ?, '{"kind":"completion","boardId":"delivery"}', 'Delivery', ?, ?, '2026-11-14T12:00:00Z')`);
    operation.run("dismissed-batch", "completed", "completed", 1);
    operation.run("active-batch", "active", "running", 0);
    const task = old.prepare("INSERT INTO archival_operation_tasks VALUES (?, ?, ?, ?, ?, ?)");
    task.run("dismissed-batch", 0, "T-1", "Previously dismissed", "archived", null);
    task.run("active-batch", 0, "T-2", "Already finished", "failed", '{"reason":"workspace-dirty"}');
    task.run("active-batch", 1, "T-3", "Still queued", "queued", null);
  } finally { old.close(); }
  let db = await CoordinationDatabase.open(path);
  let store = new ArchivalOperationStore(db);
  const migrated = store.menu();
  assert.deepEqual(store.summary(), { active: 1, history: 1 });
  assert.deepEqual(migrated.entries.map((entry) => entry.taskId), ["T-3", "T-2"]);
  assert.equal(migrated.entries[1]?.failure?.reason, "workspace-dirty");
  assert.equal(migrated.entries[1]?.updatedAt, "2026-11-14T12:00:00Z");
  assert.equal(store.read("active-batch")?.requestHash, "original-request");
  store.clearFinished();
  db.close();
  db = await CoordinationDatabase.open(path);
  try {
    store = new ArchivalOperationStore(db);
    assert.deepEqual(store.menu().entries.map((entry) => entry.taskId), ["T-3"]);
    assert.equal(store.read("active-batch")?.operation.state, "running");
  } finally { db.close(); }
});

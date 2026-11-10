import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

test("resource catalog preserves sequential IDs, revisions and archived inspection across restart", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "resources-"));
  const options = { processDefinitionPath: resolve("examples/software-delivery/process.yaml"), databasePath: join(directory, "state.sqlite") };
  let app = await CoordinationApplication.start(options);
  t.after(() => app.close());
  const command = { title: " Game window ", description: " Exclusive native game ", actor: { kind: "user" as const, id: "user" }, idempotencyKey: "create" };
  const created = app.createResource(command);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.equal(created.resource.id, "R-0001");
  assert.equal(created.resource.title, "Game window");
  assert.deepEqual(app.createResource(command), created);
  assert.deepEqual(app.createResource({ ...command, title: "Different" }), { accepted: false, reason: "idempotency-conflict" });
  const edited = app.editResource({ ...command, resourceId: created.resource.id, expectedRevision: 1, title: "Game", idempotencyKey: "edit" });
  assert.equal(edited.accepted, true);
  assert.equal(app.archiveResource({ resourceId: created.resource.id, expectedRevision: 2, actor: command.actor, idempotencyKey: "archive" }).accepted, true);
  assert.deepEqual(app.queryResources(), { available: true, resources: [] });
  await app.close();
  app = await CoordinationApplication.start(options);
  const inspection = app.queryResource("R-0001");
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.equal(inspection.resource.title, "Game");
    assert.equal(inspection.resource.archived, true);
  }
  const next = app.createResource({ ...command, idempotencyKey: "next" });
  assert.equal(next.accepted && next.resource.id, "R-0002");
});

test("resource validation and stale edits leave definitions unchanged; resource retries survive origin archival", async t => {
  const directory = await mkdtemp(join(tmpdir(), "resource-validation-"));
  const app = await CoordinationApplication.start({ processDefinitionPath: resolve("examples/software-delivery/process.yaml"), databasePath: join(directory, "state.sqlite") });
  t.after(() => app.close());
  const actor = { kind: "user" as const, id: "user" };
  assert.deepEqual(app.createResource({ title: "  ", actor, idempotencyKey: "invalid" }), { accepted: false, reason: "empty-title" });
  const task = app.createTask({ boardId: "delivery", columnId: "backlog", title: "Resource setup", description: "Set up a resource", actor, idempotencyKey: "task" });
  assert.ok(task.accepted);
  const command = { title: "Window", actor: { kind: "agent" as const, id: "implementation-agent" }, originTaskId: task.task.id, idempotencyKey: "resource" };
  const created = app.createResource(command);
  assert.ok(created.accepted);
  assert.equal(created.resource.description, "");
  const edit = { resourceId: created.resource.id, expectedRevision: 1, title: "Renamed", actor, idempotencyKey: "edit" };
  assert.ok(app.editResource(edit).accepted);
  const conflict = app.editResource({ ...edit, title: "Stale", idempotencyKey: "stale" });
  assert.equal(!conflict.accepted && conflict.reason, "revision-conflict");
  assert.ok(app.moveTask({ taskId: task.task.id, destinationColumnId: "completion", expectedRevision: 1, actor, idempotencyKey: "complete" }).accepted);
  assert.ok((await app.archiveTask({ taskId: task.task.id, actor, idempotencyKey: "archive-task" })).accepted);
  assert.deepEqual(app.createResource(command), created);
  const query = app.queryResources();
  assert.ok(query.available);
  assert.equal(query.resources.length, 1);
  assert.equal(query.resources[0]!.title, "Renamed");
  assert.ok(app.archiveResource({ resourceId: created.resource.id, expectedRevision: 2, actor, idempotencyKey: "archive" }).accepted);
  assert.equal(app.editResource({ ...edit, expectedRevision: 3, idempotencyKey: "edit-archived" }).accepted, false);
});

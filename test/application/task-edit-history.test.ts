import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { createActivationFixture } from "../support/activation-fixture.ts";

test("edit history records actual changed fields and compact before/after values", async (t) => {
  const fixture = await createActivationFixture("edit-history");
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => app.close());
  for (let mask = 1; mask < 8; mask += 1) {
    const created = app.createTask({ boardId: "delivery", columnId: "backlog", title: "Old title",
      description: "Old long description", actor: { kind: "user", id: "user" }, idempotencyKey: `create-${mask}` });
    assert.ok(created.accepted);
    const edited = app.editTask({ taskId: created.task.id, expectedRevision: 1,
      actor: { kind: "user", id: "user" }, idempotencyKey: `edit-${mask}`,
      ...(mask & 1 ? { title: "New title" } : {}),
      ...(mask & 2 ? { description: "New long description" } : {}),
      ...(mask & 4 ? { startingRef: "corrected-base" } : {}),
    });
    assert.ok(edited.accepted);
    const event = edited.task.activity.find((entry) => entry.type === "task.edited")!;
    assert.deepEqual(event.details, {
      changedFields: [mask & 1 ? "title" : "", mask & 2 ? "description" : "", mask & 4 ? "startingRef" : ""].filter(Boolean).join(","),
      ...(mask & 1 ? { previousTitle: "Old title", title: "New title" } : {}),
      ...(mask & 4 ? { previousStartingRef: "main", startingRef: "corrected-base" } : {}),
    });
    assert.doesNotMatch(JSON.stringify(event.details), /long description/);
  }
});

test("edit history excludes unchanged supplied fields and preserves retry identity", async (t) => {
  const fixture = await createActivationFixture("unchanged-edit-history");
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "backlog", title: "Same title", description: "Same description",
    actor: { kind: "user", id: "user" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  const command = { taskId: created.task.id, title: " Same title ", description: "Updated description", startingRef: "main",
    expectedRevision: 1, actor: { kind: "user" as const, id: "user" }, idempotencyKey: "edit" };
  const edited = app.editTask(command);
  assert.ok(edited.accepted);
  assert.equal(edited.task.activity.at(-1)?.details.changedFields, "description");
  assert.deepEqual(app.editTask(command), edited);
  const unchanged = app.editTask({ ...command, description: "Updated description", expectedRevision: 2, idempotencyKey: "unchanged" });
  assert.ok(unchanged.accepted);
  assert.equal(unchanged.task.activity.at(-1)?.details.changedFields, "");
});

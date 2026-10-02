import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { createHandoffFixture } from "../support/handoff-fixture.ts";

test("shared pins curate immutable comments without replaying mentions and survive restart", async (t) => {
  const fixture = await createHandoffFixture();
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath };
  let app = await CoordinationApplication.start(options);
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Pins", description: "Work",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "task" });
  assert.ok(created.accepted);
  const taskId = created.task.id;
  const plainCommand = { taskId, body: "Unpinned retry", actor: { kind: "user" as const, id: "paul" }, idempotencyKey: "plain" };
  const plain = app.addTaskComment(plainCommand);
  assert.ok(plain.accepted);
  assert.deepEqual(app.addTaskComment({ ...plainCommand, pinned: false }), plain);
  const command = { taskId, body: "@reviewer Important guidance", pinned: true,
    actor: { kind: "agent" as const, id: "implementer" }, callerTaskId: taskId, idempotencyKey: "comment" };
  const comment = app.addTaskComment(command);
  assert.ok(comment.accepted);
  assert.deepEqual(app.addTaskComment(command), comment);
  assert.deepEqual(app.addTaskComment({ ...command, pinned: false }), { accepted: false, reason: "idempotency-conflict" });
  const pin = { taskId, commentId: comment.comment.id, actor: { kind: "user" as const, id: "paul" }, idempotencyKey: "unpin" };
  const unpinned = app.setTaskCommentPin({ ...pin, pinned: false });
  assert.ok(unpinned.accepted);
  assert.deepEqual(app.setTaskCommentPin({ ...pin, pinned: false }), unpinned);
  assert.deepEqual(app.setTaskCommentPin({ ...pin, commentId: "different", pinned: false }), { accepted: false, reason: "idempotency-conflict" });
  assert.ok(app.setTaskCommentPin({ ...pin, pinned: false, idempotencyKey: "inert" }).accepted);
  assert.ok(app.setTaskCommentPin({ ...pin, pinned: true, idempotencyKey: "repin" }).accepted);
  const before = app.queryTask(taskId);
  assert.ok(before.available);
  assert.equal(before.task.comments.find(({ id }) => id === comment.comment.id)?.body, command.body);
  assert.equal(before.task.activations.length, 2);
  assert.equal(before.task.activity.filter((entry) => entry.type === "comment.pinned" || entry.type === "comment.unpinned").length, 3);
  await app.close();
  app = await CoordinationApplication.start(options);
  assert.deepEqual(app.addTaskComment({ ...plainCommand, pinned: false }), plain);
  const inspected = app.queryTaskInspection(taskId);
  assert.ok(inspected.available);
  assert.deepEqual(inspected.task.pinnedComments.map((entry) => entry.id), [comment.comment.id]);
});

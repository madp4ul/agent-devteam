import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { createResponsibilityActivationFixture } from "../support/activation-fixture.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("command retries retain compact historical facts across task history and restart", async () => {
  const directory = await mkdtemp(join(tmpdir(), "compact-command-"));
  const processDefinitionPath = join(directory, "process.yaml");
  await writeFile(processDefinitionPath, `schemaVersion: 1
name: Compact receipts
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Coordinate clearly.
agents: []
boards:
  - id: work
    name: Work
    guidance: Finish tasks.
    columns:
      - id: todo
        name: Todo
`);
  const options = { processDefinitionPath, databasePath: join(directory, "state.sqlite3") };
  let app = await CoordinationApplication.start(options);
  try {
    const actor = { kind: "user" as const, id: "user" };
    const created = app.createTask({ boardId: "work", columnId: "todo", title: "Original", description: "Original body", actor, idempotencyKey: "create" });
    assert.equal(created.accepted, true);
    if (!created.accepted) return;
    assert.deepEqual(created.task, { id: "T-0001", title: "Original", boardId: "work", columnId: "todo", revision: 1 });
    const command = { taskId: created.task.id, body: "First", actor, idempotencyKey: "comment" };
    const first = app.addTaskComment(command);
    for (let index = 0; index < 20; index++) app.addTaskComment({ ...command, body: "Unrelated history ".repeat(100), idempotencyKey: `later-${index}` });
    const late = app.addTaskComment({ ...command, idempotencyKey: "late-fixed-size" });
    assert.equal(JSON.stringify(late).length, JSON.stringify(first).length, "fixed-size receipt must ignore unrelated task history");
    app.editTask({ taskId: created.task.id, title: "Changed", expectedRevision: 1, actor, idempotencyKey: "edit" });
    assert.deepEqual(app.addTaskComment(command), first);
    app.close();
    app = await CoordinationApplication.start(options);
    assert.deepEqual(app.createTask({ boardId: "work", columnId: "todo", title: "Original", description: "Original body", actor, idempotencyKey: "create" }), created);
    assert.deepEqual(app.addTaskComment(command), first);
    const query = app.queryTask(created.task.id);
    assert.equal(query.available, true);
    if (query.available) assert.equal(query.task.comments.length, 22);
    assert.ok(JSON.stringify(first).length < 600);
  } finally { app.close(); }
});

test("malformed historical relationship types and comment actor kinds block replay without repeating effects", async () => {
  const fixture = await createResponsibilityActivationFixture("malformed-compact-replay");
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath };
  let app = await CoordinationApplication.start(options);
  const actor = { kind: "user" as const, id: "user" };
  const create = (title: string) => {
    const result = app.createTask({ boardId: "delivery", columnId: "backlog", title, description: title, actor, idempotencyKey: title });
    assert.ok(result.accepted); return result.task;
  };
  const source = create("Source"), target = create("Target");
  const relationshipCommand = { type: "dependency" as const, sourceTaskId: source.id, targetTaskId: target.id,
    resumeAgentId: "implementer", actor, idempotencyKey: "malformed-relationship" };
  const commentCommand = { taskId: source.id, body: "Authored once", actor, idempotencyKey: "malformed-comment" };
  const relationship = app.createTaskRelationship(relationshipCommand);
  const comment = app.addTaskComment(commentCommand);
  assert.ok(relationship.accepted && comment.accepted);
  app.close();
  const malformedRelationship = JSON.stringify({ ...relationship, relationship: { ...relationship.relationship, type: ["dependency"] } });
  const malformedComment = JSON.stringify({ ...comment, comment: { ...comment.comment, actor: { kind: "framework", id: "coordination" } } });
  const database = new DatabaseSync(fixture.databasePath);
  try {
    database.prepare("UPDATE command_responses SET response_json = ? WHERE idempotency_key = ?").run(malformedRelationship, "malformed-relationship");
    database.prepare("UPDATE command_responses SET response_json = ? WHERE idempotency_key = ?").run(malformedComment, "malformed-comment");
  } finally { database.close(); }
  app = await CoordinationApplication.start(options);
  try {
    const before = app.queryTask(source.id);
    assert.throws(() => app.createTaskRelationship(relationshipCommand), /Unsupported or incomplete historical.*retry protection is intact/);
    assert.throws(() => app.addTaskComment(commentCommand), /Unsupported or incomplete historical.*retry protection is intact/);
    assert.deepEqual(app.queryTask(source.id), before);
  } finally { app.close(); }
  const retained = new DatabaseSync(fixture.databasePath);
  try {
    assert.equal(retained.prepare("SELECT response_json FROM command_responses WHERE idempotency_key = ?").get("malformed-relationship")!.response_json, malformedRelationship);
    assert.equal(retained.prepare("SELECT response_json FROM command_responses WHERE idempotency_key = ?").get("malformed-comment")!.response_json, malformedComment);
  } finally { retained.close(); }
});

test("legacy movement and relationship retries preserve original facts after later edits, deletion, pins, role changes and restart", async () => {
  const fixture = await createResponsibilityActivationFixture("historical-compact-retries");
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath };
  let app = await CoordinationApplication.start(options);
  const actor = { kind: "user" as const, id: "user" };
  const create = (title: string) => {
    const result = app.createTask({ boardId: "delivery", columnId: "backlog", title, description: `${title} body`, actor, idempotencyKey: title });
    assert.ok(result.accepted); return result.task;
  };
  const task = (id: string) => {
    const result = app.queryTask(id); assert.ok(result.available); return result.task;
  };
  try {
    const source = create("Original source"), target = create("Original target");
    const commentCommand = { taskId: source.id, body: "@reviewer original pinned guidance", pinned: true, actor, idempotencyKey: "original-comment" };
    const comment = app.addTaskComment(commentCommand);
    assert.ok(comment.accepted);
    const legacyComment = { ...comment, task: task(source.id) };
    const independentCommentCommand = { ...commentCommand, actor: { kind: "agent" as const, id: "implementer" }, callerTaskId: source.id };
    const independentComment = app.addTaskComment(independentCommentCommand);
    assert.ok(independentComment.accepted);
    assert.notEqual(independentComment.comment.id, comment.comment.id, "authorized caller scopes retain independent same-key commands");
    const moveCommand = { taskId: source.id, destinationColumnId: "implementation", expectedRevision: 1, actor, idempotencyKey: "original-move" };
    const moved = app.moveTask(moveCommand);
    assert.ok(moved.accepted);
    const legacyMove = { ...moved, task: task(source.id) };
    const relationshipCommand = { type: "dependency" as const, sourceTaskId: source.id, targetTaskId: target.id,
      resumeAgentId: "reviewer", actor, idempotencyKey: "original-relationship" };
    const relationship = app.createTaskRelationship(relationshipCommand);
    assert.ok(relationship.accepted);
    const legacyRelationship = { ...relationship, sourceTask: task(source.id), targetTask: task(target.id) };
    const ownerCommand = { taskId: source.id, relationshipId: relationship.relationship.id, resumeAgentId: "implementer", actor, idempotencyKey: "original-owner-edit" };
    const owner = app.editTaskRelationshipResumeAgent(ownerCommand);
    assert.ok(owner.accepted);
    const legacyOwner = { ...owner, sourceTask: task(source.id), targetTask: task(target.id) };
    const removalCommand = { taskId: source.id, relationshipId: relationship.relationship.id, actor, idempotencyKey: "original-removal" };
    const removed = app.removeTaskRelationship(removalCommand);
    assert.ok(removed.accepted);
    const legacyRemoval = { ...removed, sourceTask: task(source.id), targetTask: task(target.id) };
    assert.ok(app.setTaskCommentPin({ taskId: source.id, commentId: comment.comment.id, pinned: false, actor, idempotencyKey: "later-unpin" }).accepted);
    assert.ok(app.editTask({ taskId: source.id, title: "Current source", expectedRevision: 2, actor, idempotencyKey: "later-source-title" }).accepted);
    assert.ok(app.editTask({ taskId: target.id, title: "Current target", expectedRevision: 1, actor, idempotencyKey: "later-target-title" }).accepted);
    assert.ok(app.moveTask({ ...moveCommand, destinationColumnId: "completion", expectedRevision: 3, idempotencyKey: "later-move" }).accepted);
    app.close();
    // Released historical snapshots are fixture input, not current hydration.
    // Replaying them must use their original fields after all the later changes.
    const database = new DatabaseSync(fixture.databasePath);
    try {
      const update = database.prepare("UPDATE command_responses SET response_json = ? WHERE idempotency_key = ? AND command_type LIKE ?");
      for (const [key, value] of [
        ["original-comment", legacyComment], ["original-move", legacyMove], ["original-relationship", legacyRelationship],
        ["original-owner-edit", legacyOwner], ["original-removal", legacyRemoval],
      ] as const) {
        assert.equal(update.run(JSON.stringify(value), key, '%["user","user"%').changes, 1);
      }
    } finally { database.close(); }
    const definition = await readFile(fixture.definitionPath, "utf8");
    await writeFile(fixture.definitionPath, definition.replace("Implementation Agent", "Renamed Implementation Agent").replace("Reviews scoped tasks", "Reviews changed scope"));
    app = await CoordinationApplication.start(options);
    const before = [app.queryTask(source.id), app.queryTask(target.id)];
    assert.deepEqual(app.moveTask(moveCommand), moved);
    assert.deepEqual(app.createTaskRelationship(relationshipCommand), relationship);
    assert.deepEqual(app.editTaskRelationshipResumeAgent(ownerCommand), owner);
    assert.deepEqual(app.removeTaskRelationship(removalCommand), removed);
    assert.deepEqual(app.addTaskComment(commentCommand), comment);
    assert.deepEqual(app.addTaskComment(independentCommentCommand), independentComment);
    assert.deepEqual(app.moveTask({ ...moveCommand, destinationColumnId: "review" }), { accepted: false, reason: "idempotency-conflict" });
    assert.deepEqual(app.createTaskRelationship({ ...relationshipCommand, resumeAgentId: "implementer" }), { accepted: false, reason: "idempotency-conflict" });
    assert.deepEqual(app.addTaskComment({ ...commentCommand, body: "Changed request" }), { accepted: false, reason: "idempotency-conflict" });
    assert.deepEqual([app.queryTask(source.id), app.queryTask(target.id)], before, "historical retries must add no comments, relationships, movement or activations");
    assert.equal(task(source.id).title, "Current source");
    assert.equal(task(source.id).columnId, "completion");
    assert.deepEqual(task(source.id).relationships, []);
    assert.equal(task(source.id).comments.find((entry) => entry.id === comment.comment.id)?.pinned, undefined);
    assert.equal(task(source.id).comments.length, 2);
    assert.equal(moved.task.title, "Original source");
    assert.deepEqual(moved.transition, { taskId: source.id, fromColumnId: "backlog", toColumnId: "implementation" });
    assert.equal(relationship.relationship.resumeAgentId, "reviewer");
    assert.equal(owner.relationship.resumeAgentId, "implementer");
    assert.equal(comment.comment.pinned, true);
  } finally { app.close(); }
});

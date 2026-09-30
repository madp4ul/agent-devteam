import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";
import { readFile, writeFile } from "node:fs/promises";

test("every generalized task mutation rejects archived, unmapped and unknown subjects", async (t) => {
  const fixture = await createHandoffFixture();
  let definition = (await readFile(fixture.definitionPath, "utf8"))
    .replace("    columns:\n", "    columns:\n      - id: backlog\n        name: Backlog\n");
  await writeFile(fixture.definitionPath, definition);
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath };
  let application = await CoordinationApplication.start(options);
  t.after(() => application.close());
  const create = (title: string, columnId = "backlog") => {
    const result = application.createTask({ boardId: "delivery", columnId, title, description: title,
      actor: { kind: "user", id: "paul" }, idempotencyKey: title });
    assert.ok(result.accepted); return result.task;
  };
  const origin = create("Origin");
  const archived = create("Archive");
  assert.ok(application.moveTask({ taskId: archived.id, destinationColumnId: "completion", expectedRevision: 1,
    actor: { kind: "user", id: "paul" }, idempotencyKey: "complete" }).accepted);
  assert.ok((await application.archiveTask({ taskId: archived.id, actor: { kind: "user", id: "paul" }, idempotencyKey: "archive" })).accepted);
  const unmapped = create("Unmapped", "review");
  await application.close();
  definition = definition.replace("      - id: review\n        name: Review\n        watchingAgent: reviewer\n", "");
  await writeFile(fixture.definitionPath, definition);
  application = await CoordinationApplication.start(options);
  const caller = { actor: { kind: "agent" as const, id: "implementer" }, callerTaskId: origin.id };
  for (const [taskId, reason] of [[archived.id, "archived-task"], [unmapped.id, "not-found"], ["T-foreign", "not-found"]] as const) {
    const subject = { ...caller, taskId, idempotencyKey: taskId };
    assert.equal(application.editTask({ ...subject, title: "No", expectedRevision: 1 }).accepted, false);
    const results = [
      application.editTask({ ...subject, title: "No", expectedRevision: 1 }),
      application.moveTask({ ...subject, destinationColumnId: "backlog", expectedRevision: 1 }),
      application.createChildTask({ ...caller, parentTaskId: taskId, boardId: "delivery", columnId: "backlog",
        title: "No child", description: "No child", resumeAgentId: "implementer", idempotencyKey: taskId }),
      application.createTaskRelationship({ ...caller, type: "dependency", sourceTaskId: origin.id, targetTaskId: taskId,
        resumeAgentId: "implementer", idempotencyKey: taskId }),
      application.removeTaskRelationship({ ...subject, relationshipId: "unknown" }),
      application.editTaskRelationshipResumeAgent({ ...subject, relationshipId: "unknown", resumeAgentId: "implementer" }),
    ];
    for (const result of results) assert.deepEqual(result, { accepted: false, reason });
  }
});

test("a running mentioned participant can mutate another board without claiming its watcher activation", async (t) => {
  const fixture = await createHandoffFixture();
  await writeFile(fixture.definitionPath, (await readFile(fixture.definitionPath, "utf8"))
    .replace("    columns:\n", "    columns:\n      - id: backlog\n        name: Backlog\n") +
    "  - id: planning\n    name: Planning\n    guidance: Clarify work.\n    columns:\n      - id: backlog\n        name: Backlog\n      - id: implementation\n        name: Implementation\n        watchingAgent: implementer\n");
  const runtime = new ControlledAgentRuntime();
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } };
  let application = await CoordinationApplication.start(options);
  t.after(() => application.close());
  const create = (boardId: string) => {
    const result = application.createTask({ boardId, columnId: "backlog", title: boardId,
      description: "Work", actor: { kind: "user", id: "paul" }, idempotencyKey: boardId });
    assert.ok(result.accepted); return result.task;
  };
  const origin = create("delivery");
  const target = create("planning");
  application.addTaskComment({ taskId: origin.id, body: "@implementer Consult planning",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "mention" });
  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  await application.pauseAutomation();
  const caller = { actor: { kind: "agent" as const, id: "implementer" },
    callerTaskId: origin.id, attemptId: request.attemptId };
  const edit = { ...caller, taskId: target.id, title: "Planned", expectedRevision: 1, idempotencyKey: "edit" };
  assert.ok(application.editTask(edit).accepted);
  for (const invalid of [{ ...caller, callerTaskId: target.id }, { ...caller, actor: { kind: "agent" as const, id: "reviewer" } }]) {
    assert.throws(() => application.editTask({ ...edit, ...invalid }), /provenance/);
    assert.throws(() => application.createTask({ ...invalid, boardId: "planning", columnId: "backlog", title: "Spoof", description: "Spoof", idempotencyKey: "spoof" }), /provenance/);
    assert.throws(() => application.moveTask({ ...invalid, taskId: target.id, destinationColumnId: "implementation", expectedRevision: 2, idempotencyKey: "spoof-move" }), /provenance/);
    assert.throws(() => application.createTaskRelationship({ ...invalid, type: "dependency", sourceTaskId: target.id, targetTaskId: origin.id, resumeAgentId: "reviewer", idempotencyKey: "spoof-link" }), /provenance/);
  }
  const moved = application.moveTask({ ...caller, taskId: target.id, destinationColumnId: "implementation",
    expectedRevision: 2, idempotencyKey: "cross-watcher" });
  assert.ok(moved.accepted);
  assert.equal(moved.task.activations.at(-1)?.reason.type, "column-entry");
  assert.equal(moved.task.activations.at(-1)?.targetAgentId, "implementer");
  const event = moved.task.activity.find((entry) => entry.type === "task.moved");
  assert.equal(event?.details.originTaskId, origin.id);
  assert.equal(event?.details.attemptId, request.attemptId);
  runtime.complete({ status: "completed", summary: "Consulted", threadId: "mutations-thread" });
  await application.waitForAutomationIdle();
  assert.throws(() => application.editTask(edit), /provenance/);
  await application.close();
  application = await CoordinationApplication.start(options);
  const retained = application.queryTask(target.id);
  assert.ok(retained.available);
  assert.equal(retained.task.activity.find((entry) => entry.type === "task.moved")?.details.originTaskId, origin.id);
});

test("cross-task relationship changes require the outgoing source and retain exact intent", async (t) => {
  const fixture = await createHandoffFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const create = (title: string) => {
    const result = application.createTask({ boardId: "delivery", columnId: "implementation",
      title, description: title, actor: { kind: "user", id: "paul" }, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task;
  };
  const origin = create("Origin");
  const source = create("Source");
  const target = create("Target");
  const caller = { actor: { kind: "agent" as const, id: "reviewer" }, callerTaskId: origin.id };
  const command = { ...caller, type: "dependency" as const, sourceTaskId: source.id,
    targetTaskId: target.id, resumeAgentId: "reviewer", idempotencyKey: "link" };
  const created = application.createTaskRelationship(command);
  assert.ok(created.accepted);
  assert.deepEqual(application.createTaskRelationship(command), created);
  assert.deepEqual(application.createTaskRelationship({ ...command, resumeAgentId: "implementer" }), {
    accepted: false, reason: "idempotency-conflict",
  });
  const edit = { ...caller, taskId: source.id, relationshipId: created.relationship.id,
    resumeAgentId: "implementer", idempotencyKey: "owner" };
  const edited = application.editTaskRelationshipResumeAgent(edit);
  assert.ok(edited.accepted);
  assert.deepEqual(application.editTaskRelationshipResumeAgent(edit), edited);
  assert.deepEqual(application.editTaskRelationshipResumeAgent({ ...edit, resumeAgentId: "reviewer" }), {
    accepted: false, reason: "idempotency-conflict",
  });
  const remove = { ...caller, taskId: source.id, relationshipId: created.relationship.id,
    idempotencyKey: "remove" };
  assert.deepEqual(application.removeTaskRelationship({ ...remove, taskId: target.id }), {
    accepted: false, reason: "relationship-conflict",
  });
  const removed = application.removeTaskRelationship(remove);
  assert.ok(removed.accepted);
  assert.deepEqual(application.removeTaskRelationship(remove), removed);
  assert.equal(removed.sourceTask.activations.length, source.activations.length);
  assert.deepEqual(application.removeTaskRelationship({ ...remove, relationshipId: "other" }), {
    accepted: false, reason: "idempotency-conflict",
  });
});

test("a participant partially edits another task and retries its original intent", async (t) => {
  const fixture = await createHandoffFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const create = (title: string) => {
    const result = application.createTask({ boardId: "delivery", columnId: "implementation",
      title, description: "Keep this description", actor: { kind: "user", id: "paul" },
      idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task;
  };
  const origin = create("Origin");
  const destination = create("Destination");
  const command = { taskId: destination.id, title: " Revised ", expectedRevision: 1,
    actor: { kind: "agent" as const, id: "reviewer" }, callerTaskId: origin.id,
    idempotencyKey: "revise" };
  const result = application.editTask(command);
  assert.ok(result.accepted);
  assert.equal(result.task.title, "Revised");
  assert.equal(result.task.description, "Keep this description");
  assert.equal(result.task.revision, 2);
  assert.deepEqual(application.editTask({ ...command, title: "Revised" }), result);
  assert.deepEqual(application.editTask({ ...command, title: "Different" }), {
    accepted: false, reason: "idempotency-conflict",
  });
  assert.deepEqual(application.editTask({ ...command, taskId: origin.id }), {
    accepted: false, reason: "idempotency-conflict",
  });
  const { title: _title, ...withoutTitle } = command;
  assert.deepEqual(application.editTask({ ...withoutTitle, expectedRevision: 2,
    idempotencyKey: "no-fields" }), { accepted: false, reason: "no-changes" });
});

test("cross-task moves and creation retain caller-scoped intent and ordinary watcher effects", async (t) => {
  const fixture = await createHandoffFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const create = (title: string) => {
    const result = application.createTask({ boardId: "delivery", columnId: "implementation",
      title, description: title, actor: { kind: "user", id: "paul" }, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task;
  };
  const origin = create("Origin");
  const destination = create("Destination");
  const caller = { actor: { kind: "agent" as const, id: "reviewer" }, callerTaskId: origin.id };
  const command = { ...caller, taskId: destination.id, destinationColumnId: "review",
    expectedRevision: 1, idempotencyKey: "move" };
  const moved = application.moveTask(command);
  assert.ok(moved.accepted);
  assert.equal(moved.task.activations.at(-1)?.targetAgentId, "reviewer");
  assert.deepEqual(application.moveTask(command), moved);
  assert.deepEqual(application.moveTask({ ...command, destinationColumnId: "completion" }), {
    accepted: false, reason: "idempotency-conflict",
  });
  const inert = application.resolveInertTaskMove({ ...command, expectedRevision: 2, idempotencyKey: "inert" });
  assert.ok(inert?.accepted && "outcome" in inert);
  assert.equal(inert.task.revision, 2);
  assert.equal(inert.task.activations.length, moved.task.activations.length);
  const creation = { ...caller, boardId: "delivery", columnId: "review", title: "Independent",
    description: "Independent work", idempotencyKey: "independent" };
  const created = application.createTask(creation);
  assert.ok(created.accepted);
  assert.deepEqual(application.createTask(creation), created);
  assert.deepEqual(application.createTask({ ...creation, title: "Changed" }), {
    accepted: false, reason: "idempotency-conflict",
  });
  const childCommand = { ...creation, parentTaskId: destination.id, title: "Child",
    resumeAgentId: "reviewer", idempotencyKey: "child" };
  const child = application.createChildTask(childCommand);
  assert.ok(child.accepted);
  assert.equal(child.task.relationships[0]?.sourceTaskId, destination.id);
  assert.deepEqual(application.createChildTask(childCommand), child);
  assert.deepEqual(application.createChildTask({ ...childCommand, parentTaskId: origin.id }), {
    accepted: false, reason: "idempotency-conflict",
  });
});

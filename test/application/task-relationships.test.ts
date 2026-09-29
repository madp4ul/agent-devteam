import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRuntime,
} from "../../src/application/runtime-contract.ts";

const execFileAsync = promisify(execFile);

test("waiting relationships do not suppress work and each completion queues its resume owner", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new RecordingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());

  const waiting = createTask(application, "implementation", "Waiting work", "waiting-work");
  const first = createTask(application, "backlog", "First prerequisite", "first-prerequisite");
  const second = createTask(application, "backlog", "Second prerequisite", "second-prerequisite");
  for (const [target, key] of [[first, "first"], [second, "second"]] as const) {
    const linked = application.createTaskRelationship({
      type: "dependency",
      sourceTaskId: waiting.id,
      targetTaskId: target.id,
      resumeAgentId: "implementer",
      actor: { kind: "user", id: "paul" },
      idempotencyKey: `link-${key}`,
    });
    assert.equal(linked.accepted, true);
    if (linked.accepted) assert.equal(linked.relationship.resumeAgentId, "implementer");
  }

  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type), ["column-entry"]);

  const completed = application.moveTask({
    taskId: first.id,
    destinationColumnId: "completion",
    expectedRevision: first.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-first-prerequisite",
  });
  assert.equal(completed.accepted, true);
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type), [
    "column-entry",
    "relationship-satisfied",
  ]);

  const inspection = application.queryTaskInspection(waiting.id);
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.deepEqual(inspection.task.waitingOn, { taskIds: [second.id] });
  }
});

test("an unresolved relationship resume owner can be reassigned with dual-task history", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const waiting = createTask(application, "backlog", "Waiting", "edit-owner-waiting");
  const prerequisite = createTask(application, "backlog", "Prerequisite", "edit-owner-target");
  const created = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: waiting.id,
    targetTaskId: prerequisite.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-editable-owner",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const edited = application.editTaskRelationshipResumeAgent({
    taskId: waiting.id,
    relationshipId: created.relationship.id,
    resumeAgentId: "reviewer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "edit-resume-owner",
  });
  assert.equal(edited.accepted, true);
  if (!edited.accepted) return;
  assert.equal(edited.relationship.resumeAgentId, "reviewer");
  for (const taskId of [waiting.id, prerequisite.id]) {
    const task = application.queryTask(taskId);
    assert.equal(task.available, true);
    if (task.available) {
      assert.equal(
        task.task.activity.at(-1)?.type,
        "relationship.resume-agent-changed",
      );
      assert.deepEqual(task.task.activity.at(-1)?.details, {
        relationshipId: created.relationship.id,
        relationshipType: "dependency",
        relationshipRole: taskId === waiting.id ? "source" : "target",
        relatedTaskId: taskId === waiting.id ? prerequisite.id : waiting.id,
        resumeAgentId: "reviewer",
        previousResumeAgentId: "implementer",
      });
    }
  }

  const completed = application.moveTask({
    taskId: prerequisite.id,
    destinationColumnId: "completion",
    expectedRevision: prerequisite.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-after-owner-edit",
  });
  assert.equal(completed.accepted, true);
  const task = application.queryTask(waiting.id);
  assert.equal(task.available, true);
  if (!task.available || !completed.accepted) return;
  assert.equal(task.task.activations.at(-1)?.targetAgentId, "reviewer");
  assert.deepEqual(application.editTaskRelationshipResumeAgent({
    taskId: waiting.id,
    relationshipId: created.relationship.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-edit-after-satisfaction",
  }), { accepted: false, reason: "relationship-satisfied" });
  const reopened = application.moveTask({
    taskId: prerequisite.id,
    destinationColumnId: "backlog",
    expectedRevision: completed.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reopen-for-owner-edit",
  });
  assert.equal(reopened.accepted, true);
  const editedAfterReopen = application.editTaskRelationshipResumeAgent({
    taskId: waiting.id,
    relationshipId: created.relationship.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "edit-after-reopen",
  });
  assert.equal(editedAfterReopen.accepted, true);
  if (editedAfterReopen.accepted) assert.equal(editedAfterReopen.relationship.resumeAgentId, "implementer");
  const afterReassignment = application.queryTask(waiting.id);
  assert.equal(afterReassignment.available, true);
  if (afterReassignment.available) {
    assert.equal(afterReassignment.task.activations.at(-1)?.targetAgentId, "reviewer");
  }
});

test("reopening and recompleting a target queues a fresh satisfaction activation", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const waiting = createTask(application, "backlog", "Waiting for a correction", "recomplete-waiting");
  const target = createTask(application, "backlog", "Premature outcome", "recomplete-target");
  const relationship = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: waiting.id,
    targetTaskId: target.id,
    resumeAgentId: "reviewer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "link-recompleted-target",
  });
  assert.equal(relationship.accepted, true);

  const firstCompletion = application.moveTask({
    taskId: target.id,
    destinationColumnId: "completion",
    expectedRevision: target.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "first-target-completion",
  });
  assert.equal(firstCompletion.accepted, true);
  if (!firstCompletion.accepted) return;
  const reopened = application.moveTask({
    taskId: target.id,
    destinationColumnId: "backlog",
    expectedRevision: firstCompletion.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reopen-target",
  });
  assert.equal(reopened.accepted, true);
  if (!reopened.accepted) return;
  const secondCompletion = application.moveTask({
    taskId: target.id,
    destinationColumnId: "completion",
    expectedRevision: reopened.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "second-target-completion",
  });
  assert.equal(secondCompletion.accepted, true);

  const result = application.queryTask(waiting.id);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.deepEqual(
    result.task.activations.map(({ targetAgentId, reason }) => ({ targetAgentId, reason: reason.type })),
    [
      { targetAgentId: "reviewer", reason: "relationship-satisfied" },
      { targetAgentId: "reviewer", reason: "relationship-satisfied" },
    ],
  );
  assert.equal(result.task.activity.filter(({ type }) => type === "relationship.satisfied").length, 2);
});

test("one completion queues several relationship activations in relationship creation order", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const waiting = createTask(application, "backlog", "Ordered relationship wakeups", "ordered-waiting");
  const target = createTask(application, "backlog", "Shared completion target", "ordered-target");
  const dependency = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: waiting.id,
    targetTaskId: target.id,
    resumeAgentId: "reviewer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "ordered-dependency",
  });
  const child = application.createTaskRelationship({
    type: "parent-child",
    sourceTaskId: waiting.id,
    targetTaskId: target.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "ordered-child",
  });
  assert.equal(dependency.accepted, true);
  assert.equal(child.accepted, true);
  if (!dependency.accepted || !child.accepted) return;

  const completed = application.moveTask({
    taskId: target.id,
    destinationColumnId: "completion",
    expectedRevision: target.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-shared-target",
  });
  assert.equal(completed.accepted, true);

  const result = application.queryTask(waiting.id);
  assert.equal(result.available, true);
  if (!result.available) return;
  assert.deepEqual(
    result.task.activations.map(({ targetAgentId }) => targetAgentId),
    ["reviewer", "implementer"],
  );
  const satisfactionByEvent = new Map(
    result.task.activity
      .filter(({ type }) => type === "relationship.satisfied")
      .map((event) => [event.id, event.details.relationshipId]),
  );
  assert.deepEqual(
    result.task.activations.map(({ reason }) => satisfactionByEvent.get(reason.sourceEventId)),
    [dependency.relationship.id, child.relationship.id],
  );
});

test("relating an already-completed target records ownership without synthesizing an activation", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const waiting = createTask(application, "backlog", "Trace completed work", "completed-link-source");
  const target = createTask(application, "backlog", "Already completed", "completed-link-target");
  const completed = application.moveTask({
    taskId: target.id,
    destinationColumnId: "completion",
    expectedRevision: target.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-before-linking",
  });
  assert.equal(completed.accepted, true);
  assert.deepEqual(application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: waiting.id,
    targetTaskId: target.id,
    resumeAgentId: "missing-agent",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-missing-resume-agent",
  }), { accepted: false, reason: "resume-agent-not-found" });
  const relationship = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: waiting.id,
    targetTaskId: target.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "link-completed-target",
  });
  assert.equal(relationship.accepted, true);
  if (!relationship.accepted) return;
  assert.equal(relationship.relationship.resumeAgentId, "implementer");
  assert.equal(relationship.sourceTask.activations.length, 0);
  const inspection = application.queryTaskInspection(waiting.id);
  assert.equal(inspection.available, true);
  if (inspection.available) assert.deepEqual(inspection.task.waitingOn, { taskIds: [] });
});

test("each completed dependency adds a distinct activation while other work remains", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  const blocked = createTask(application, "implementation", "Blocked work", "blocked");
  const first = createTask(application, "backlog", "First prerequisite", "first");
  const second = createTask(application, "backlog", "Second prerequisite", "second");

  const firstLink = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: blocked.id,
    targetTaskId: first.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "link-first",
  });
  const secondLink = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: blocked.id,
    targetTaskId: second.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "link-second",
  });
  assert.equal(firstLink.accepted, true);
  assert.equal(secondLink.accepted, true);
  if (!secondLink.accepted) return;
  const afterFirst = application.moveTask({
    taskId: first.id,
    destinationColumnId: "completion",
    expectedRevision: first.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-first",
  });
  assert.equal(afterFirst.accepted, true);
  const stillBlocked = application.queryTaskInspection(blocked.id);
  assert.equal(stillBlocked.available, true);
  if (!stillBlocked.available) return;
  assert.deepEqual(stillBlocked.task.waitingOn, { taskIds: [second.id] });
  assert.equal(stillBlocked.task.run.queuedActivationCount, 2);

  const afterSecond = application.moveTask({
    taskId: second.id,
    destinationColumnId: "completion",
    expectedRevision: second.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-second",
  });
  assert.equal(afterSecond.accepted, true);
  const unblocked = application.queryTask(blocked.id);
  assert.equal(unblocked.available, true);
  if (!unblocked.available) return;
  assert.deepEqual(
    unblocked.task.activations.map(({ reason }) => reason.type),
    ["column-entry", "relationship-satisfied", "relationship-satisfied"],
  );
  const finalClearingEvent = unblocked.task.activity.findLast(
    (event) => event.type === "relationship.satisfied",
  );
  assert.ok(finalClearingEvent);
  assert.equal(unblocked.task.activations.at(-1)?.reason.sourceEventId, finalClearingEvent.id);
  assert.deepEqual(
    unblocked.task.activity.filter((event) => event.type.startsWith("relationship.")).map((event) => event.type),
    ["relationship.created", "relationship.created", "relationship.satisfied", "relationship.satisfied"],
  );
});

test("child completion adds resume work after existing responsibility runs", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new RecordingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const parent = createTask(application, "backlog", "Moved parent", "moved-parent");
  const moved = application.moveTask({
    taskId: parent.id,
    destinationColumnId: "implementation",
    expectedRevision: parent.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-parent-to-implementation",
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  const queuedResponsibility = moved.task.activations[0];
  assert.ok(queuedResponsibility);
  const sourceMovement = moved.task.activity.findLast((event) => event.type === "task.moved");
  assert.equal(queuedResponsibility.reason.type, "column-entry");
  assert.equal(queuedResponsibility.reason.sourceEventId, sourceMovement?.id);
  const child = application.createChildTask({
    parentTaskId: parent.id,
    resumeAgentId: "implementer",
    boardId: "delivery",
    columnId: "backlog",
    title: "Required child",
    description: "Complete before the parent runs.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-required-child",
  });
  assert.equal(child.accepted, true);
  if (!child.accepted) return;

  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type), ["column-entry"]);
  const completedChild = application.moveTask({
    taskId: child.task.id,
    destinationColumnId: "completion",
    expectedRevision: child.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-required-child",
  });
  assert.equal(completedChild.accepted, true);
  await application.waitForAutomationIdle();

  assert.equal(runtime.requests.length, 2);
  assert.equal(runtime.requests[0]?.task.id, parent.id);
  assert.deepEqual(runtime.requests[0]?.reason, queuedResponsibility.reason);
  const completedParent = application.queryTask(parent.id);
  assert.equal(completedParent.available, true);
  if (!completedParent.available) return;
  assert.equal(completedParent.task.activations.length, 2);
  assert.equal(completedParent.task.activations[1]?.reason.type, "relationship-satisfied");
  assert.equal(
    completedParent.task.activity.filter((event) => event.type === "relationship.satisfied").length,
    1,
  );
});

test("a queued mention remains distinct from relationship satisfaction", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new RecordingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const dependent = createTask(application, "implementation", "Consulted dependent", "mention-dependent");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.pauseAutomation();
  const blocker = createTask(application, "backlog", "Mention blocker", "mention-blocker");
  application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "mention-link",
  });
  application.addTaskComment({
    taskId: dependent.id,
    body: "Please inspect this separately @implementer.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "mention-request",
  });

  application.moveTask({
    taskId: blocker.id,
    destinationColumnId: "completion",
    expectedRevision: blocker.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-mention-blocker",
  });

  const unblocked = application.queryTask(dependent.id);
  assert.equal(unblocked.available, true);
  if (!unblocked.available) return;
  assert.deepEqual(
    unblocked.task.activations.map((activation) => activation.reason.type),
    ["column-entry", "agent-mention", "relationship-satisfied"],
  );
  assert.equal(new Set(unblocked.task.activations.map(({ conversationId }) => conversationId)).size, 1);
});

test("a running column-entry activation does not replace relationship satisfaction", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new HoldingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const dependent = createTask(application, "implementation", "Running dependent", "running-dependent");
  await application.resumeAutomation();
  await runtime.waitForRequest();
  const blocker = createTask(application, "backlog", "Running blocker", "running-blocker");
  application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "running-link",
  });

  application.moveTask({
    taskId: blocker.id,
    destinationColumnId: "completion",
    expectedRevision: blocker.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-running-blocker",
  });

  const unblocked = application.queryTask(dependent.id);
  assert.equal(unblocked.available, true);
  if (!unblocked.available) return;
  assert.deepEqual(
    unblocked.task.activations.map((activation) => ({
      status: activation.status,
      reason: activation.reason.type,
    })),
    [
      { status: "running", reason: "column-entry" },
      { status: "queued", reason: "relationship-satisfied" },
    ],
  );
  runtime.complete();
  await application.waitForAutomationIdle();
});

test("repeated untouched column entries remain distinct from relationship satisfaction", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const dependent = createTask(application, "implementation", "Reentered dependent", "reentered-dependent");
  const toBacklog = application.moveTask({
    taskId: dependent.id,
    destinationColumnId: "backlog",
    expectedRevision: dependent.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reentered-to-backlog",
  });
  assert.equal(toBacklog.accepted, true);
  if (!toBacklog.accepted) return;
  const reentered = application.moveTask({
    taskId: dependent.id,
    destinationColumnId: "implementation",
    expectedRevision: toBacklog.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reentered-to-implementation",
  });
  assert.equal(reentered.accepted, true);
  const blocker = createTask(application, "backlog", "Reentry blocker", "reentry-blocker");
  application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reentry-link",
  });

  application.moveTask({
    taskId: blocker.id,
    destinationColumnId: "completion",
    expectedRevision: blocker.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-reentry-blocker",
  });

  const unblocked = application.queryTask(dependent.id);
  assert.equal(unblocked.available, true);
  if (!unblocked.available) return;
  assert.deepEqual(
    unblocked.task.activations.map((activation) => activation.reason.type),
    ["column-entry", "column-entry", "relationship-satisfied"],
  );
});

test("a child can start from committed Git state without sharing its parent's workspace", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new RecordingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const parent = createTask(application, "implementation", "Parent work", "git-parent");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const parentWorkspace = runtime.requests[0]?.workspace;
  assert.ok(parentWorkspace);
  await writeFile(join(parentWorkspace.path, "DIRTY.txt"), "uncommitted parent state\n");
  const child = application.createChildTask({
    parentTaskId: parent.id,
    resumeAgentId: "implementer",
    boardId: "delivery",
    columnId: "implementation",
    title: "Child work",
    description: "Use only the committed feature branch state.",
    startingRef: "feature-base",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-git-child",
  });
  assert.equal(child.accepted, true);
  if (!child.accepted) return;

  await application.waitForAutomationIdle();

  assert.equal(runtime.requests.length, 2);
  assert.equal(runtime.requests[1]?.task.id, child.task.id);
  assert.equal(runtime.requests[1]?.workspace.startingRef, "feature-base");
  await assert.rejects(readFile(join(runtime.requests[1]!.workspace.path, "DIRTY.txt"), "utf8"));
  assert.deepEqual(child.task.relationships, [
    {
      id: child.task.relationships[0]?.id,
      type: "parent-child",
      sourceTaskId: parent.id,
      targetTaskId: child.task.id,
      resumeAgentId: "implementer",
    },
  ]);

  assert.notEqual(runtime.requests[0]?.workspace.path, runtime.requests[1]?.workspace.path);

  const completedChild = application.moveTask({
    taskId: child.task.id,
    destinationColumnId: "completion",
    expectedRevision: child.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-child",
  });
  assert.equal(completedChild.accepted, true);
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests[2]?.task.id, parent.id);
  assert.equal(runtime.requests[2]?.reason.type, "relationship-satisfied");
  const parentInspection = application.queryTaskInspection(parent.id);
  assert.equal(parentInspection.available, true);
  if (parentInspection.available) {
    assert.deepEqual(parentInspection.task.waitingOn, { taskIds: [] });
  }
  const completedChildRelationship = application.queryTask(parent.id);
  assert.equal(completedChildRelationship.available, true);
  if (completedChildRelationship.available) {
    const satisfaction = completedChildRelationship.task.activity.findLast(
      (event) => event.type === "relationship.satisfied",
    );
    assert.deepEqual(satisfaction?.details, {
      relationshipId: child.task.relationships[0]?.id,
      relationshipType: "parent-child",
      relationshipRole: "source",
      relatedTaskId: child.task.id,
    });
  }
});

test("an agent-created relationship retains attempt provenance for timeline grouping", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new HoldingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const source = createTask(application, "implementation", "Agent-owned work", "agent-source");
  const prerequisite = createTask(application, "backlog", "Named prerequisite", "agent-target");

  await application.resumeAutomation();
  const request = await runtime.waitForRequest();
  const linked = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: source.id,
    targetTaskId: prerequisite.id,
    resumeAgentId: "implementer",
    actor: { kind: "agent", id: "implementer" },
    attemptId: request.attemptId,
    idempotencyKey: "agent-link",
  });

  assert.equal(linked.accepted, true);
  if (!linked.accepted) return;
  const activity = linked.sourceTask.activity.findLast((event) => event.type === "relationship.created");
  assert.equal(activity?.details.attemptId, request.attemptId);
  const child = application.createChildTask({
    parentTaskId: source.id,
    resumeAgentId: "implementer",
    boardId: "delivery",
    columnId: "backlog",
    title: "Agent-created child",
    description: "Keep this relationship in the originating agent group.",
    actor: { kind: "agent", id: "implementer" },
    attemptId: request.attemptId,
    idempotencyKey: "agent-child",
  });
  assert.equal(child.accepted, true);
  const parentAfterChild = application.queryTask(source.id);
  assert.equal(parentAfterChild.available, true);
  if (!parentAfterChild.available) return;
  const childActivity = parentAfterChild.task.activity.findLast(
    (event) => event.type === "relationship.created" && event.details.relationshipType === "parent-child",
  );
  assert.equal(childActivity?.details.attemptId, request.attemptId);
  runtime.complete();
  await application.waitForAutomationIdle();
});

test("child creation rejects Completion atomically and retains deliberate workflow placement", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  const parent = createTask(application, "backlog", "Parent work", "completion-parent");
  const rejected = application.createChildTask({
    parentTaskId: parent.id,
    resumeAgentId: "implementer",
    boardId: "delivery",
    columnId: "completion",
    title: "Already completed child",
    description: "A child must begin in a workflow column.",
    startingRef: "feature-base",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-completed-child",
  });
  assert.deepEqual(rejected, {
    accepted: false,
    reason: "completion-is-not-starting-column",
  });
  const unchangedParent = application.queryTask(parent.id);
  assert.equal(unchangedParent.available, true);
  if (!unchangedParent.available) return;
  assert.deepEqual(unchangedParent.task.relationships, []);
  assert.deepEqual(
    unchangedParent.task.activity.map((event) => event.type),
    ["task.created"],
  );
  assert.deepEqual(application.queryTask("T-0002"), { available: false, reason: "not-found" });

  const child = application.createChildTask({
    parentTaskId: parent.id,
    resumeAgentId: "implementer",
    boardId: "delivery",
    columnId: "implementation",
    title: "Deliberately placed child",
    description: "The child starts in the selected workflow column.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-deliberate-child",
  });
  assert.equal(child.accepted, true);
  if (!child.accepted) return;
  assert.equal(child.task.id, "T-0002");
  assert.equal(child.task.columnId, "implementation");
  assert.equal(child.task.relationships.length, 1);
  assert.equal(child.task.activity.filter((event) => event.type === "task.created").length, 1);
});

test("relationship satisfaction wakes idle automation after ordinary work completes", async (t) => {
  const fixture = await createGitFixture();
  const runtime = new RecordingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.processDefinitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const dependent = createTask(application, "implementation", "Dependent", "wake-dependent");
  const blocker = createTask(application, "backlog", "Blocker", "wake-blocker");
  application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "wake-link",
  });
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type), ["column-entry"]);

  application.moveTask({
    taskId: blocker.id,
    destinationColumnId: "completion",
    expectedRevision: blocker.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "wake-complete",
  });
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map((request) => request.reason.type), [
    "column-entry",
    "relationship-satisfied",
  ]);
});

test("satisfying a relationship in an unwatched column records its owner activation", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const dependent = createTask(application, "backlog", "Waiting dependent", "unwatched-dependent");
  const blocker = createTask(application, "backlog", "Waiting blocker", "unwatched-blocker");
  application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "unwatched-link",
  });
  application.moveTask({
    taskId: blocker.id,
    destinationColumnId: "completion",
    expectedRevision: blocker.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "unwatched-complete",
  });
  const result = application.queryTask(dependent.id);
  assert.equal(result.available, true);
  if (result.available) {
    assert.equal(result.task.activations.length, 1);
    assert.equal(result.task.activations[0]?.reason.type, "relationship-satisfied");
  }
});

test("removing an unresolved relationship preserves history without adding activation work", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const dependent = createTask(application, "implementation", "Recover dependent", "remove-dependent");
  const blocker = createTask(application, "backlog", "Mistaken blocker", "remove-blocker");
  const created = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-link",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const command = {
    taskId: blocker.id,
    relationshipId: created.relationship.id,
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "remove-final-blocker",
  };
  const removed = application.removeTaskRelationship(command);
  assert.equal(removed.accepted, true);
  if (!removed.accepted) return;
  assert.deepEqual(removed.sourceTask.relationships, []);
  assert.deepEqual(removed.targetTask.relationships, []);
  assert.equal(removed.sourceTask.activations.length, 1);
  assert.equal(removed.sourceTask.activations[0]?.reason.type, "column-entry");
  const removal = removed.sourceTask.activity.findLast(
    (event) => event.type === "relationship.removed",
  );
  assert.ok(removal);
  assert.notEqual(removed.sourceTask.activations[0]?.reason.sourceEventId, removal.id);
  assert.equal(
    removed.targetTask.activity.filter((event) => event.type === "relationship.removed").length,
    1,
  );
  assert.equal(application.queryTask(dependent.id).available, true);
  assert.equal(application.queryTask(blocker.id).available, true);

  assert.deepEqual(application.removeTaskRelationship(command), removed);
  assert.deepEqual(application.removeTaskRelationship({
    ...command,
    idempotencyKey: "remove-final-blocker-again",
  }), { accepted: false, reason: "relationship-conflict" });
});

test("relationship removal never creates or cancels activation work", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  const watched = createTask(application, "implementation", "Watched dependent", "remove-watched");
  const first = createTask(application, "backlog", "First blocker", "remove-first");
  const second = createTask(application, "backlog", "Second blocker", "remove-second");
  const firstLink = application.createTaskRelationship({
    type: "parent-child",
    sourceTaskId: watched.id,
    targetTaskId: first.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-first-link",
  });
  const secondLink = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: watched.id,
    targetTaskId: second.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-second-link",
  });
  assert.equal(firstLink.accepted, true);
  assert.equal(secondLink.accepted, true);
  if (!firstLink.accepted || !secondLink.accepted) return;

  const oneOfSeveral = application.removeTaskRelationship({
    taskId: watched.id,
    relationshipId: firstLink.relationship.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-one-of-several",
  });
  assert.equal(oneOfSeveral.accepted, true);
  if (!oneOfSeveral.accepted) return;
  assert.equal(oneOfSeveral.sourceTask.activations.length, 1);
  assert.deepEqual(
    oneOfSeveral.sourceTask.relationships.map((relationship) => relationship.id),
    [secondLink.relationship.id],
  );
  assert.deepEqual(oneOfSeveral.targetTask.relationships, []);
  assert.equal(
    oneOfSeveral.sourceTask.activity.filter((event) => event.type === "relationship.removed").length,
    1,
  );
  assert.equal(
    oneOfSeveral.targetTask.activity.filter((event) => event.type === "relationship.removed").length,
    1,
  );
  assert.equal(application.queryTask(watched.id).available, true);
  assert.equal(application.queryTask(first.id).available, true);

  const unwatched = createTask(application, "backlog", "Unwatched dependent", "remove-unwatched");
  const unwatchedLink = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: unwatched.id,
    targetTaskId: first.id,
    resumeAgentId: "implementer",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-unwatched-link",
  });
  assert.equal(unwatchedLink.accepted, true);
  if (!unwatchedLink.accepted) return;
  const unwatchedRemoval = application.removeTaskRelationship({
    taskId: unwatched.id,
    relationshipId: unwatchedLink.relationship.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-unwatched-link-command",
  });
  assert.equal(unwatchedRemoval.accepted, true);
  if (unwatchedRemoval.accepted) assert.equal(unwatchedRemoval.sourceTask.activations.length, 0);

  const completed = application.moveTask({
    taskId: second.id,
    destinationColumnId: "completion",
    expectedRevision: second.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-second-before-removal",
  });
  assert.equal(completed.accepted, true);
  const beforeSatisfiedRemoval = application.queryTask(watched.id);
  assert.equal(beforeSatisfiedRemoval.available, true);
  if (!beforeSatisfiedRemoval.available) return;
  const satisfiedRemoval = application.removeTaskRelationship({
    taskId: watched.id,
    relationshipId: secondLink.relationship.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "remove-satisfied-link",
  });
  assert.equal(satisfiedRemoval.accepted, true);
  if (satisfiedRemoval.accepted) {
    assert.equal(
      satisfiedRemoval.sourceTask.activations.length,
      beforeSatisfiedRemoval.task.activations.length,
    );
  }
});

function createTask(
  application: CoordinationApplication,
  columnId: string,
  title: string,
  key: string,
) {
  const result = application.createTask({
    boardId: "delivery",
    columnId,
    title,
    description: `${title} description.`,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: `create-${key}`,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error("fixture task was rejected");
  return result.task;
}

async function createFixture(): Promise<{ processDefinitionPath: string; databasePath: string }> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-relationships-"));
  await writeFile(join(directory, "implementer.md"), "Implement the current task.\n");
  await writeFile(join(directory, "reviewer.md"), "Review the current task.\n");
  const processDefinitionPath = join(directory, "process.yaml");
  await writeFile(processDefinitionPath, `schemaVersion: 1
name: Relationship process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep dependencies explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements work
    summary: Builds unblocked tasks.
    instructions: ./implementer.md
  - id: reviewer
    name: Review Agent
    role: Reviews work
    summary: Reviews completed work.
    instructions: ./reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Complete prerequisites first.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`);
  return { processDefinitionPath, databasePath: join(directory, "coordination.sqlite3") };
}

async function createGitFixture(): Promise<{
  processDefinitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
}> {
  const fixture = await createFixture();
  const directory = join(fixture.databasePath, "..");
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Main\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C", repositoryPath, "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
    "commit", "-m", "Main",
  ]);
  await execFileAsync("git", ["-C", repositoryPath, "branch", "feature-base"]);
  return { ...fixture, repositoryPath, workspaceRoot: join(directory, "workspaces") };
}

class RecordingRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started();
    return Promise.resolve({ status: "completed", summary: "Recorded." });
  }
}

class HoldingRuntime implements AgentRuntime {
  readonly #request = Promise.withResolvers<AgentRunRequest>();
  readonly #outcome = Promise.withResolvers<AgentRunOutcome>();

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    lifecycle.started();
    this.#request.resolve(request);
    return this.#outcome.promise;
  }

  waitForRequest(): Promise<AgentRunRequest> {
    return this.#request.promise;
  }

  complete(): void {
    this.#outcome.resolve({ status: "completed", summary: "Recorded." });
  }
}

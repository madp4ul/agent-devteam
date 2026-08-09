import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  CoordinationApplication,
  type AgentRunLifecycle,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRuntime,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);

test("the final completed dependency unblocks a task and queues exactly one activation", async (t) => {
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
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "link-first",
  });
  const secondLink = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: blocked.id,
    targetTaskId: second.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "link-second",
  });
  assert.equal(firstLink.accepted, true);
  assert.equal(secondLink.accepted, true);

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
  assert.deepEqual(stillBlocked.task.blocking, { blocked: true, blockerTaskIds: [second.id] });
  assert.equal(stillBlocked.task.run.queuedActivationCount, 1);

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
  assert.equal(unblocked.task.activations.length, 2);
  assert.equal(unblocked.task.activations[1]?.reason.type, "blockers-cleared");
  const finalClearingEvent = unblocked.task.activity.findLast(
    (event) => event.type === "relationship.satisfied",
  );
  assert.ok(finalClearingEvent);
  assert.equal(unblocked.task.activations[1]?.reason.sourceEventId, finalClearingEvent.id);
  assert.deepEqual(
    unblocked.task.activity.filter((event) => event.type.startsWith("relationship.")).map((event) => event.type),
    ["relationship.created", "relationship.created", "relationship.satisfied", "relationship.satisfied"],
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
  assert.equal(runtime.requests[2]?.reason.type, "blockers-cleared");
  const parentInspection = application.queryTaskInspection(parent.id);
  assert.equal(parentInspection.available, true);
  if (parentInspection.available) {
    assert.deepEqual(parentInspection.task.blocking, { blocked: false, blockerTaskIds: [] });
  }
});

test("child creation rejects Completion atomically and retains deliberate workflow placement", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  const parent = createTask(application, "backlog", "Parent work", "completion-parent");
  const rejected = application.createChildTask({
    parentTaskId: parent.id,
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

test("final blocker clearance wakes running idle automation", async (t) => {
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
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "wake-link",
  });
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 0);

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
    "blockers-cleared",
  ]);
});

test("fully unblocking a task in an unwatched column records no activation", async (t) => {
  const fixture = await createFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const dependent = createTask(application, "backlog", "Waiting dependent", "unwatched-dependent");
  const blocker = createTask(application, "backlog", "Waiting blocker", "unwatched-blocker");
  application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: dependent.id,
    targetTaskId: blocker.id,
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
  if (result.available) assert.equal(result.task.activations.length, 0);
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

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  CoordinationApplication,
  type AgentRuntime,
  type AgentRunRequest,
  type AttemptTranscriptAccess,
} from "../../src/application/coordination-application.ts";

const run = promisify(execFile);

test("archive removes a clean durable workspace and retains task history without its transcript", async (t) => {
  const fixture = await createFixture("archive-clean");
  const transcriptAccess: AttemptTranscriptAccess = {
    async read() {
      return [{ kind: "message", role: "agent", text: "Detailed retained evidence." }];
    },
  };
  const runtime: AgentRuntime = {
    async run(_request, lifecycle) {
      lifecycle.started("thread-archive");
      return { status: "completed", summary: "Finished safely.", threadId: "thread-archive" };
    },
  };
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repository,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
    transcriptAccess,
  });
  t.after(() => application.close());

  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Archive completed work",
    description: "Retain the coordination outcome without retaining detailed transcript content.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "create-archive-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const before = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(before.available, true);
  if (!before.available || before.task.workspace === null) return;
  await run("git", ["-C", before.task.workspace.path, "switch", "-c", "durable/archive-result"]);
  const blockerId = createTask(application, "Complete while archival runs", "archive-race-blocker");
  await application.waitForAutomationIdle();
  const relationship = application.createTaskRelationship({
    type: "dependency",
    sourceTaskId: created.task.id,
    targetTaskId: blockerId,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-race-dependency",
  });
  assert.equal(relationship.accepted, true);
  const blocker = application.queryTask(blockerId);
  assert.equal(blocker.available, true);
  if (!blocker.available) return;

  const archivePromise = application.archiveTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-task",
  });
  assert.deepEqual(application.addTaskComment({
    taskId: created.task.id,
    body: "Do not enqueue work while cleanup is in progress.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "comment-during-archive",
  }), { accepted: false, reason: "archived-task" });
  const completedBlocker = application.moveTask({
    taskId: blockerId,
    destinationColumnId: "completion",
    expectedRevision: blocker.task.revision,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "complete-during-dependent-archive",
  });
  assert.equal(completedBlocker.accepted, true);
  const archived = await archivePromise;

  assert.equal(archived.accepted, true);
  assert.deepEqual(await application.archiveTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-task",
  }), archived);
  const boards = application.queryBoards();
  assert.equal(boards.available, true);
  if (boards.available) assert.deepEqual(boards.boards[0]?.columns[0]?.tasks, []);
  const history = application.queryArchivedTaskOverviews();
  assert.equal(history.available, true);
  if (history.available) assert.deepEqual(history.tasks.map((task) => task.id), [created.task.id]);
  const direct = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(direct.available, true);
  if (direct.available) {
    assert.equal(direct.task.archived, true);
    assert.equal(direct.task.workspace, null);
  }
  await assert.rejects(stat(before.task.workspace.path));
  const queried = application.queryTask(created.task.id);
  const attemptId = queried.available ? queried.task.activations[0]?.attempts[0]?.id : undefined;
  if (queried.available) assert.equal(queried.task.activations.length, 1);
  assert.notEqual(attemptId, undefined);
  if (attemptId !== undefined) {
    assert.deepEqual(await application.queryAttemptTranscript(attemptId), {
      available: false,
      reason: "unavailable",
    });
  }
  assert.equal(archived.accepted && archived.task.activity.at(-1)?.type, "task.archived");
});

test("archive rejects busy tasks and requires explicit permission to discard a dirty workspace", async (t) => {
  const fixture = await createFixture("archive-rejections");
  let finishRun!: () => void;
  const runtime: AgentRuntime = {
    async run(_request, lifecycle) {
      lifecycle.started("thread-running");
      await new Promise<void>((resolve) => { finishRun = resolve; });
      return { status: "completed", summary: "Finished." };
    },
  };
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repository,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Do not archive active work",
    description: "The active attempt must finish before archival is eligible.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "create-running-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await waitFor(() => application.queryActiveRuns().length === 1);
  assert.deepEqual(await application.archiveTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-running",
  }), { accepted: false, reason: "activation-work-pending" });

  finishRun();
  await application.waitForAutomationIdle();
  const detail = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(detail.available, true);
  if (!detail.available || detail.task.workspace === null) return;
  await writeFile(join(detail.task.workspace.path, "untracked.txt"), "local work\n");
  assert.deepEqual(await application.archiveTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-dirty",
  }), { accepted: false, reason: "workspace-dirty" });
  assert.equal((await readFile(join(detail.task.workspace.path, "untracked.txt"), "utf8")), "local work\n");
  const unchanged = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(unchanged.available, true);
  if (unchanged.available) assert.notEqual(unchanged.task.archived, true);

  const discarded = await application.archiveTask({
    taskId: created.task.id,
    discardWorkspaceChanges: true,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-dirty-with-discard",
  });
  assert.equal(discarded.accepted, true);
  await assert.rejects(stat(detail.task.workspace.path));
  const archived = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(archived.available, true);
  if (archived.available) assert.equal(archived.task.archived, true);
});

test("archive rejects clean workspaces without a durable ref and worktree removal failures", async (t) => {
  const fixture = await createFixture("archive-git-safety");
  const runtime: AgentRuntime = {
    async run(_request, lifecycle) {
      lifecycle.started();
      return { status: "completed", summary: "Finished." };
    },
  };
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repository,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const first = createTask(application, "Create an unreferenced commit", "first");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const firstDetail = application.queryTaskInspectionForUser(first);
  assert.equal(firstDetail.available, true);
  if (!firstDetail.available || firstDetail.task.workspace === null) return;
  await writeFile(join(firstDetail.task.workspace.path, "result.txt"), "finished\n");
  await run("git", ["-C", firstDetail.task.workspace.path, "add", "result.txt"]);
  await run("git", ["-C", firstDetail.task.workspace.path, "commit", "-m", "Unreferenced result"]);
  assert.deepEqual(await application.archiveTask({
    taskId: first,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-unreferenced",
  }), { accepted: false, reason: "workspace-commit-not-durable" });

  const second = createTask(application, "Keep cleanup atomic", "second");
  await application.waitForAutomationIdle();
  const secondDetail = application.queryTaskInspectionForUser(second);
  assert.equal(secondDetail.available, true);
  if (!secondDetail.available || secondDetail.task.workspace === null) return;
  await run("git", ["-C", secondDetail.task.workspace.path, "switch", "-c", "durable/locked-result"]);
  await run("git", ["-C", fixture.repository, "worktree", "lock", secondDetail.task.workspace.path]);
  assert.deepEqual(await application.archiveTask({
    taskId: second,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-locked",
  }), { accepted: false, reason: "workspace-cleanup-failed" });
  assert.equal((await stat(secondDetail.task.workspace.path)).isDirectory(), true);
  const unchanged = application.queryTaskInspectionForUser(second);
  assert.equal(unchanged.available, true);
  if (unchanged.available) assert.notEqual(unchanged.task.archived, true);
});

test("bulk archive affects only eligible completed tasks and unarchive keeps history without a workspace", async (t) => {
  const fixture = await createFixture("archive-bulk", true);
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const completedOne = createTaskInColumn(application, "Completed one", "completion", "completed-one");
  const completedTwo = createTaskInColumn(application, "Completed two", "completion", "completed-two");
  const active = createTaskInColumn(application, "Still active", "implementation", "active");
  const otherBoardCompleted = createTaskInColumn(
    application,
    "Completed elsewhere",
    "completion",
    "other-board-completed",
    "support",
  );

  const bulk = await application.archiveCompletedTasks({
    boardId: "delivery",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-completed",
  });
  assert.deepEqual(bulk, { accepted: true, archivedTaskIds: [completedOne, completedTwo], rejected: [] });
  assert.deepEqual(await application.archiveCompletedTasks({
    boardId: "delivery",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-completed",
  }), bulk);
  const boards = application.queryBoards();
  assert.equal(boards.available, true);
  if (boards.available) {
    const tasksByBoard = new Map(boards.boards.map((board) => [
      board.id,
      board.columns.flatMap((column) => column.tasks.map((task) => task.id)),
    ]));
    assert.deepEqual(tasksByBoard.get("delivery"), [active]);
    assert.deepEqual(tasksByBoard.get("support"), [otherBoardCompleted]);
  }

  const unarchived = application.unarchiveTask({
    taskId: completedOne,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "unarchive-one",
  });
  assert.equal(unarchived.accepted, true);
  assert.deepEqual(application.unarchiveTask({
    taskId: completedOne,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "unarchive-one",
  }), unarchived);
  if (unarchived.accepted) {
    assert.notEqual(unarchived.task.archived, true);
    assert.equal(unarchived.task.activity.at(-1)?.type, "task.unarchived");
  }
  const detail = application.queryTaskInspectionForUser(completedOne);
  assert.equal(detail.available, true);
  if (detail.available) assert.equal(detail.task.workspace, null);
});

test("an activation after unarchive provisions from the current process default rather than the discarded task ref", async (t) => {
  const fixture = await createFixture("archive-reprovision");
  await run("git", ["-C", fixture.repository, "branch", "custom-start"]);
  const requests: AgentRunRequest[] = [];
  const runtime: AgentRuntime = {
    async run(request, lifecycle) {
      requests.push(request);
      lifecycle.started();
      return { status: "completed", summary: "Finished." };
    },
  };
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repository,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const parentId = createTaskInColumn(application, "Parent", "completion", "reprovision-parent");
  const child = application.createChildTask({
    parentTaskId: parentId,
    boardId: "delivery",
    columnId: "implementation",
    title: "Reprovision after archive",
    description: "Use the current process default after unarchive.",
    startingRef: "custom-start",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "reprovision-child",
  });
  assert.equal(child.accepted, true);
  if (!child.accepted) return;
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.equal(requests[0]?.workspace.startingRef, "custom-start");
  await run("git", ["-C", requests[0]!.workspace.path, "switch", "-c", "durable/reprovision"]);
  const archived = await application.archiveTask({
    taskId: child.task.id,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "archive-reprovision",
  });
  assert.equal(archived.accepted, true);
  const unarchived = application.unarchiveTask({
    taskId: child.task.id,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "unarchive-reprovision",
  });
  assert.equal(unarchived.accepted, true);
  const comment = application.addTaskComment({
    taskId: child.task.id,
    body: "@implementer inspect the unarchived task.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "activate-unarchived",
  });
  assert.equal(comment.accepted, true);
  await application.waitForAutomationIdle();
  assert.equal(requests[1]?.workspace.startingRef, "main");
});

test("bulk archive revalidates Completion after each awaited workspace cleanup", async (t) => {
  const fixture = await createFixture("archive-bulk-race");
  const runtime: AgentRuntime = {
    async run(_request, lifecycle) {
      lifecycle.started();
      return { status: "completed", summary: "Finished." };
    },
  };
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repository,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const firstId = createTask(application, "Completed task with workspace", "bulk-race-first");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const firstDetail = application.queryTaskInspectionForUser(firstId);
  assert.equal(firstDetail.available, true);
  if (!firstDetail.available || firstDetail.task.workspace === null) return;
  await run("git", ["-C", firstDetail.task.workspace.path, "switch", "-c", "durable/bulk-race"]);
  const movedFirst = application.moveTask({
    taskId: firstId,
    destinationColumnId: "completion",
    expectedRevision: firstDetail.task.revision,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "complete-bulk-race-first",
  });
  assert.equal(movedFirst.accepted, true);
  const secondId = createTaskInColumn(application, "Move during bulk", "completion", "bulk-race-second");
  const second = application.queryTask(secondId);
  assert.equal(second.available, true);
  if (!second.available) return;

  const bulkPromise = application.archiveCompletedTasks({
    boardId: "delivery",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "bulk-race",
  });
  const movedSecond = application.moveTask({
    taskId: secondId,
    destinationColumnId: "implementation",
    expectedRevision: second.task.revision,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "move-during-bulk",
  });
  assert.equal(movedSecond.accepted, true);
  assert.deepEqual(await bulkPromise, {
    accepted: true,
    archivedTaskIds: [firstId],
    rejected: [{ taskId: secondId, reason: "not-completed" }],
  });
  await application.waitForAutomationIdle();
});

test("startup recovers archival claims around the Git removal boundary", async (t) => {
  const fixture = await createFixture("archive-restart-recovery");
  const runtime: AgentRuntime = {
    async run(_request, lifecycle) {
      lifecycle.started();
      return { status: "completed", summary: "Finished." };
    },
  };
  const options = {
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repository,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  };
  let application = await CoordinationApplication.start(options);
  t.after(() => application.close());
  const intactId = createTask(application, "Recover before worktree removal", "restart-intact");
  const removedId = createTask(application, "Recover after worktree removal", "restart-removed");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const intact = application.queryTaskInspectionForUser(intactId);
  const removed = application.queryTaskInspectionForUser(removedId);
  assert.equal(intact.available, true);
  assert.equal(removed.available, true);
  if (
    !intact.available || intact.task.workspace === null ||
    !removed.available || removed.task.workspace === null
  ) return;
  await run("git", ["-C", intact.task.workspace.path, "switch", "-c", "durable/restart-intact"]);
  await run("git", ["-C", removed.task.workspace.path, "switch", "-c", "durable/restart-removed"]);
  application.close();

  const database = new DatabaseSync(fixture.databasePath);
  database.prepare(
    `UPDATE tasks
     SET archival_pending = 1, archival_actor_id = 'local-user', archival_idempotency_key = ?
     WHERE id = ?`,
  ).run("interrupted-intact", intactId);
  database.prepare(
    `UPDATE tasks
     SET archival_pending = 1, archival_actor_id = 'local-user', archival_idempotency_key = ?
     WHERE id = ?`,
  ).run("interrupted-removed", removedId);
  database.close();
  await run("git", ["-C", fixture.repository, "worktree", "remove", removed.task.workspace.path]);

  application = await CoordinationApplication.start(options);
  const startup = application.queryStartup();
  assert.equal(startup.mode, "paused");
  const recoveredIntact = application.queryTaskInspectionForUser(intactId);
  assert.equal(recoveredIntact.available, true);
  if (recoveredIntact.available) assert.notEqual(recoveredIntact.task.archived, true);
  const recoveredRemoved = application.queryTaskInspectionForUser(removedId);
  assert.equal(recoveredRemoved.available, true);
  if (recoveredRemoved.available) {
    assert.equal(recoveredRemoved.task.archived, true);
    assert.equal(recoveredRemoved.task.workspace, null);
  }
  const retry = await application.archiveTask({
    taskId: intactId,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "retry-after-interrupted-archive",
  });
  assert.equal(retry.accepted, true);
});

async function createFixture(name: string, includeSecondBoard = false): Promise<{
  repository: string;
  workspaceRoot: string;
  databasePath: string;
  definitionPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `coordination-${name}-`));
  const repository = join(directory, "repository");
  const workspaceRoot = join(directory, "workspaces");
  const definitionPath = join(directory, "process.yaml");
  await run("git", ["init", "--initial-branch=main", repository]);
  await run("git", ["-C", repository, "config", "user.email", "archive@example.test"]);
  await run("git", ["-C", repository, "config", "user.name", "Archive Test"]);
  await writeFile(join(repository, "README.md"), "archive fixture\n");
  await run("git", ["-C", repository, "add", "README.md"]);
  await run("git", ["-C", repository, "commit", "-m", "Initial"]);
  await writeFile(definitionPath, `schemaVersion: 1
name: Archival
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve completed work.
agents:
  - id: implementer
    name: Implementer
    role: Implements work
    summary: Completes work.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver safely.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
${includeSecondBoard ? `  - id: support
    name: Support
    guidance: Keep support work separate.
    columns:
      - id: triage
        name: Triage
` : ""}
`);
  await writeFile(join(directory, "implementer.md"), "Complete the task.");
  return { repository, workspaceRoot, databasePath: join(directory, "coordination.sqlite3"), definitionPath };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Condition was not met");
}

function createTask(application: CoordinationApplication, title: string, key: string): string {
  return createTaskInColumn(application, title, "implementation", key);
}

function createTaskInColumn(
  application: CoordinationApplication,
  title: string,
  columnId: string,
  key: string,
  boardId = "delivery",
): string {
  let startingColumnId = columnId;
  if (columnId === "completion") {
    startingColumnId = boardId === "support" ? "triage" : "backlog";
  }
  const result = application.createTask({
    boardId,
    columnId: startingColumnId,
    title,
    description: `${title} safely.`,
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: key,
  });
  assert.equal(result.accepted, true);
  if (!result.accepted) throw new Error("Task creation failed");
  if (columnId === "completion") {
    const completed = application.moveTask({
      taskId: result.task.id,
      destinationColumnId: "completion",
      expectedRevision: result.task.revision,
      actor: { kind: "user", id: "local-user" },
      idempotencyKey: `${key}-complete`,
    });
    assert.equal(completed.accepted, true);
    if (!completed.accepted) throw new Error("Task completion failed");
  }
  return result.task.id;
}

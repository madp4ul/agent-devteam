import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
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
import { writeProcessEvolutionDefinition } from "../support/process-evolution-fixture.ts";

const execFileAsync = promisify(execFile);

test("removed process identities preserve live state as unmapped and stale", async (t) => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve this task",
    description: "A changed definition must not reinterpret or dispatch it.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-process-change",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const activationId = created.task.activations[0]?.id;
  assert.ok(activationId);
  first.close();

  await writeProcessEvolutionDefinition(fixture.definitionPath, { includeImplementation: false });
  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });

  const startup = restarted.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode !== "paused") return;
  assert.deepEqual(startup.processImpact?.unmappedTasks, [{
    taskId: created.task.id,
    title: "Preserve this task",
    boardId: "delivery",
    boardName: "Delivery",
    columnId: "implementation",
    columnName: "Implementation",
  }]);
  assert.deepEqual(startup.processImpact?.staleActivations, [{
    activationId,
    taskId: created.task.id,
    targetAgentId: "implementer",
    priorStatus: "queued",
    targetAvailable: false,
    taskMapped: false,
  }]);

  const retained = restarted.queryTask(created.task.id);
  assert.equal(retained.available, true);
  if (retained.available) {
    assert.equal(retained.task.activations[0]?.stale, true);
    assert.equal(retained.task.activity.length, created.task.activity.length);
  }
  assert.deepEqual(restarted.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog"],
  }), { available: true, tasks: [], nextCursor: null });
  const commented = restarted.addTaskComment({
    taskId: created.task.id,
    body: "Please inspect this, @implementer.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "comment-on-unmapped-task",
  });
  assert.equal(commented.accepted, true);
  if (commented.accepted) assert.equal(commented.task.activations.length, 1);
  restarted.close();

  const restartedAgain = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restartedAgain.close());
  const repeatedStartup = restartedAgain.queryStartup();
  assert.equal(repeatedStartup.mode, "paused");
  if (repeatedStartup.mode === "paused") {
    assert.deepEqual(repeatedStartup.processImpact?.unmappedTasks.map((task) => task.taskId), [
      created.task.id,
    ]);
    assert.deepEqual(repeatedStartup.processImpact?.staleActivations.map((activation) => activation.activationId), [
      activationId,
    ]);
  }
});

test("renaming and reordering process entities preserves their live identities", async (t) => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Keep stable identity",
    description: "Names and positions may change without remapping the task.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-rename",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  first.close();

  await writeFile(fixture.definitionPath, `schemaVersion: 1
name: Renamed delivery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve process identity.
agents:
  - id: implementer
    name: Renamed Implementation Agent
    role: Implements scoped work
    summary: Builds and verifies changes.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Renamed Delivery
    guidance: Deliver changes safely.
    columns:
      - id: implementation
        name: Work in progress
        watchingAgent: implementer
      - id: backlog
        name: Planned work
`);
  const changed = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => changed.close());
  const startup = changed.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode === "paused") assert.deepEqual(startup.processImpact?.unmappedTasks, []);
  const boards = changed.queryBoards();
  assert.equal(boards.available, true);
  if (boards.available) {
    assert.equal(boards.boards[0]?.name, "Renamed Delivery");
    assert.deepEqual(boards.boards[0]?.columns.map((column) => column.id), [
      "implementation",
      "backlog",
      "completion",
    ]);
    assert.equal(boards.boards[0]?.columns[0]?.tasks[0]?.id, created.task.id);
  }
  const staleActivationId = created.task.activations[0]?.id;
  assert.ok(staleActivationId);
  assert.deepEqual(changed.dismissStaleActivation({
    activationId: staleActivationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-compatible-stale-activation",
  }), { accepted: true, activationId: staleActivationId });
});

test("restored identities remap without replay and require explicit process approval", async (t) => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Restore this task",
    description: "Stable identities should reconnect retained process state.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-restoration",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const activationId = created.task.activations[0]?.id;
  assert.ok(activationId);
  first.close();

  await writeProcessEvolutionDefinition(fixture.definitionPath, { includeImplementation: false });
  const removed = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  assert.equal(removed.queryStartup().mode, "paused");
  assert.deepEqual(removed.dismissStaleActivation({
    activationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-removed-target",
  }), { accepted: true, activationId });
  assert.deepEqual(removed.dismissStaleActivation({
    activationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-removed-target",
  }), { accepted: true, activationId });
  removed.close();

  await writeProcessEvolutionDefinition(fixture.definitionPath, { includeImplementation: true });
  const restored = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restored.close());
  const startup = restored.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode !== "paused") return;
  assert.equal(startup.processImpact, undefined);
  const task = restored.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (task.available) {
    assert.equal(task.task.columnId, "implementation");
    assert.equal(task.task.activations.length, 1);
    assert.equal(task.task.activations[0]?.status, "dismissed");
  }
});

test("Resume with current process rebases only compatible stale activations", async (t) => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Approve current instructions",
    description: "Keep the activation provenance while updating its execution version.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-compatible-change",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  first.close();

  await writeFile(join(fixture.directory, "implementer.md"), "Use the current instructions.\n");
  const { repositoryPath, workspaceRoot } = await prepareRepository(fixture);
  const runtime = new RecordingRuntime();
  const changed = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: repositoryPath,
      taskWorkspaceRoot: workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => changed.close());
  assert.deepEqual(await changed.resumeAutomation(), {
    accepted: false,
    reason: "process-change-approval-required",
  });
  const approved = await changed.resumeWithCurrentProcess();
  assert.equal(approved.accepted, true);
  await changed.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0]?.agent.instructions, "Use the current instructions.\n");
  assert.equal(runtime.requests[0]?.reason.sourceEventId,
    created.task.activations[0]?.reason.sourceEventId);
  const task = changed.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (task.available) {
    assert.equal(task.task.activations[0]?.stale, false);
    assert.equal(task.task.activations[0]?.reason.sourceEventId,
      created.task.activations[0]?.reason.sourceEventId);
  }
});

test("retired boards retain inspectable history and restore matching state without replay", async (t) => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const unfinished = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Unfinished retained task",
    description: "This task becomes unmapped when its board retires.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-unfinished-retired-board",
  });
  const completed = first.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Completed retained task",
    description: "This task remains completed and directly inspectable.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-completed-retired-board",
  });
  assert.equal(unfinished.accepted, true);
  assert.equal(completed.accepted, true);
  if (!unfinished.accepted || !completed.accepted) return;
  const moved = first.moveTask({
    taskId: completed.task.id,
    destinationColumnId: "completion",
    expectedRevision: completed.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-before-retirement",
  });
  assert.equal(moved.accepted, true);
  first.close();

  await writeFile(fixture.definitionPath, `schemaVersion: 1
name: Delivery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve process identity.
agents: []
boards:
  - id: maintenance
    name: Maintenance
    guidance: Maintain the product.
    columns:
      - id: planned
        name: Planned
`);
  const retired = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const retiredBoards = retired.queryBoards();
  assert.equal(retiredBoards.available, true);
  if (retiredBoards.available) {
    assert.deepEqual(retiredBoards.boards.map((board) => board.id), ["maintenance"]);
  }
  assert.equal(retired.queryTask(unfinished.task.id).available, true);
  assert.equal(retired.queryTaskInspection(unfinished.task.id).available, false);
  assert.equal(retired.queryTaskInspectionForUser(unfinished.task.id).available, true);
  assert.equal(retired.queryTask(completed.task.id).available, true);
  assert.equal(retired.queryTaskInspection(completed.task.id).available, true);
  const impact = retired.queryStartup();
  assert.equal(impact.mode, "paused");
  if (impact.mode === "paused") {
    assert.deepEqual(impact.processImpact?.unmappedTasks.map((task) => task.taskId), [
      unfinished.task.id,
    ]);
  }
  retired.close();

  await writeProcessEvolutionDefinition(fixture.definitionPath, { includeImplementation: true });
  const restored = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restored.close());
  const boards = restored.queryBoards();
  assert.equal(boards.available, true);
  if (boards.available) {
    assert.deepEqual(
      boards.boards.flatMap((board) => board.columns.flatMap((column) => column.tasks.map((task) => task.id))),
      [unfinished.task.id, completed.task.id],
    );
  }
  const restoredTask = restored.queryTask(unfinished.task.id);
  assert.equal(restoredTask.available, true);
  if (restoredTask.available) assert.equal(restoredTask.task.activations.length, 1);
});

test("only the user can recover an unmapped task into a defined column", async (t) => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Recover mapping explicitly",
    description: "An agent must not reinterpret an unmapped task.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-unmapped-move",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  first.close();
  await writeProcessEvolutionDefinition(fixture.definitionPath, { includeImplementation: false });
  const changed = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => changed.close());
  const rejected = changed.moveTask({
    taskId: created.task.id,
    destinationColumnId: "backlog",
    expectedRevision: created.task.revision,
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "agent-cannot-remap",
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.reason, "unmapped-task-user-only");
  const recovered = changed.moveTask({
    taskId: created.task.id,
    destinationColumnId: "backlog",
    expectedRevision: created.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "user-remaps-task",
  });
  assert.equal(recovered.accepted, true);
  if (recovered.accepted) assert.equal(recovered.task.activations.length, 1);
});

test("failed and user-interrupted activations become stale after a semantic change", async (t) => {
  const fixture = await createFixture();
  const { repositoryPath, workspaceRoot } = await prepareRepository(fixture);
  const runtime = new FailureAndInterruptionRuntime();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: repositoryPath, taskWorkspaceRoot: workspaceRoot, agentRuntime: runtime },
  });
  const failed = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retain failed activation",
    description: "A permission-blocked activation must become stale after the definition changes.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-failed-before-change",
  });
  assert.equal(failed.accepted, true);
  if (!failed.accepted) return;
  assert.equal((await first.resumeAutomation()).accepted, true);
  await first.waitForAutomationIdle();

  const interrupted = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retain interrupted activation",
    description: "A user-interrupted activation must become stale after the definition changes.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-interrupted-before-change",
  });
  assert.equal(interrupted.accepted, true);
  if (!interrupted.accepted) return;
  await runtime.waitForRequests(2);
  const interruption = first.interruptTask({
    taskId: interrupted.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-before-process-change",
  });
  assert.equal(interruption.accepted, true);
  if (interruption.accepted) await interruption.confirmed;
  first.pauseAutomation();
  await first.waitForAutomationIdle();
  first.close();

  await writeFile(join(fixture.directory, "implementer.md"), "Use changed instructions.\n");
  const rebasedRuntime = new RecordingRuntime();
  const changed = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: repositoryPath,
      taskWorkspaceRoot: workspaceRoot,
      agentRuntime: rebasedRuntime,
    },
  });
  t.after(() => changed.close());
  const startup = changed.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode === "paused") {
    assert.deepEqual(
      startup.processImpact?.staleActivations.map(({ taskId, priorStatus }) => ({ taskId, priorStatus })),
      [
        { taskId: failed.task.id, priorStatus: "failed" },
        { taskId: interrupted.task.id, priorStatus: "queued" },
      ],
    );
  }
  assert.equal((await changed.resumeWithCurrentProcess()).accepted, true);
  const rebasedAttention = changed.queryNeedsAttention();
  assert.equal(rebasedAttention.available, true);
  if (!rebasedAttention.available) return;
  const permissionReason = rebasedAttention.tasks
    .find(({ task }) => task.id === failed.task.id)
    ?.reasons.find((reason) => reason.recovery?.kind === "permission-block");
  assert.ok(permissionReason);
  assert.equal(changed.continuePermissionBlockedActivation({
    attentionReasonId: permissionReason.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-version-tagged-rebase",
  }).accepted, true);
  await changed.waitForAutomationIdle();
  const versionTaggedRebase = rebasedRuntime.requests.find((request) => request.task.id === failed.task.id);
  assert.equal(versionTaggedRebase?.resumeThreadId, "process-evolution-thread-1");
  assert.equal(versionTaggedRebase?.attempt.fullCompositionReason, "process-rebased");
  const continued = changed.continueInterruptedTask({
    taskId: interrupted.task.id,
    message: "Continue under the approved current process.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-rebased-interruption",
  });
  assert.equal(continued.accepted, true);
  await changed.waitForAutomationIdle();
  const resumedRequest = rebasedRuntime.requests.find((request) => request.task.id === interrupted.task.id);
  assert.equal(resumedRequest?.resumeThreadId, "process-evolution-thread-2");
  assert.equal(resumedRequest?.attempt.fullCompositionReason, "process-rebased");
});

async function createFixture(): Promise<{
  directory: string;
  definitionPath: string;
  databasePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-process-evolution-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the requested change.\n");
  await writeProcessEvolutionDefinition(definitionPath, { includeImplementation: true });
  return { directory, definitionPath, databasePath: join(directory, "coordination.sqlite3") };
}

class RecordingRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started("process-evolution-thread");
    return Promise.resolve({
      status: "completed",
      summary: "Completed under the approved current process.",
      threadId: "process-evolution-thread",
    });
  }
}

class FailureAndInterruptionRuntime implements AgentRuntime {
  readonly #requests: AgentRunRequest[] = [];
  readonly #waiters: Array<{ count: number; resolve(): void }> = [];

  run(
    request: AgentRunRequest,
    lifecycle: AgentRunLifecycle,
    signal?: AbortSignal,
  ): Promise<AgentRunOutcome> {
    this.#requests.push(request);
    lifecycle.started(`process-evolution-thread-${this.#requests.length}`);
    for (const waiter of this.#waiters.splice(0)) {
      if (this.#requests.length >= waiter.count) waiter.resolve();
      else this.#waiters.push(waiter);
    }
    if (this.#requests.length === 1) {
      return Promise.resolve({
        status: "permission-blocked",
        summary: "Approval is required.",
        threadId: "process-evolution-thread-1",
      });
    }
    return new Promise((resolve) => {
      signal?.addEventListener("abort", () => resolve({
        status: "failed",
        summary: "Stopped after user interruption.",
        threadId: "process-evolution-thread-2",
      }), { once: true });
    });
  }

  waitForRequests(count: number): Promise<void> {
    return this.#requests.length >= count
      ? Promise.resolve()
      : new Promise((resolve) => this.#waiters.push({ count, resolve }));
  }
}

async function prepareRepository(
  fixture: { directory: string },
): Promise<{ repositoryPath: string; workspaceRoot: string }> {
  const repositoryPath = join(fixture.directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Process evolution fixture\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C", repositoryPath, "-c", "user.name=Test", "-c",
    "user.email=test@example.invalid", "commit", "-m", "initial",
  ]);
  return { repositoryPath, workspaceRoot: join(fixture.directory, "task-workspaces") };
}

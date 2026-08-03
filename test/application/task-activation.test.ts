import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunLifecycle,
  type AgentRuntime,
  CoordinationApplication,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);

test("entering a watched column records one activation with immutable source provenance", async (t) => {
  const fixture = await createFixture("watched-entry");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());

  const command = {
    boardId: "delivery",
    columnId: "implementation",
    title: "Execute the first activation",
    description: "Keep the trigger and its activation durable.",
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "create-watched-task",
  };
  const created = application.createTask(command);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  assert.deepEqual(application.createTask(command), created);
  const queried = application.queryTask(created.task.id);
  assert.equal(queried.available, true);
  if (!queried.available) return;
  assert.deepEqual(
    queried.task.activity.map((event) => event.type),
    ["task.created", "activation.created"],
  );
  const sourceEvent = queried.task.activity[0];
  assert.deepEqual(sourceEvent?.details, {
    boardId: "delivery",
    columnId: "implementation",
  });
  assert.deepEqual(
    queried.task.activations.map((activation) => ({
      targetAgentId: activation.targetAgentId,
      status: activation.status,
      reason: activation.reason,
      attempts: activation.attempts,
    })),
    [
      {
        targetAgentId: "implementer",
        status: "queued",
        reason: {
          type: "column-entry",
          sourceEventId: sourceEvent?.id,
        },
        attempts: [],
      },
    ],
  );
});

test("moving into a watched column records an activation for the movement event", async (t) => {
  const fixture = await createFixture("watched-move");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());

  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Move into implementation",
    description: "The move is the exact activation source.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-watched-move",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-into-watched-column",
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;

  assert.equal(moved.task.activations.length, 1);
  assert.deepEqual(moved.task.activations[0]?.reason, {
    type: "column-entry",
    sourceEventId: moved.task.activity.find((event) => event.type === "task.moved")?.id,
  });
  assert.equal(moved.task.activations[0]?.targetAgentId, "implementer");
});

test("unwatched and Completion column entries remain inert", async (t) => {
  const fixture = await createFixture("inert-entry");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());

  const backlogTask = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Wait without activation",
    description: "Backlog is intentionally unwatched.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-in-backlog",
  });
  const completedTask = application.createTask({
    boardId: "delivery",
    columnId: "completion",
    title: "Already complete",
    description: "Completion never has a watcher.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-in-completion",
  });
  assert.equal(backlogTask.accepted, true);
  assert.equal(completedTask.accepted, true);
  if (!backlogTask.accepted || !completedTask.accepted) return;
  const moved = application.moveTask({
    taskId: backlogTask.task.id,
    destinationColumnId: "completion",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-to-completion",
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;

  assert.equal(moved.task.activations.length, 0);
  assert.equal(completedTask.task.activations.length, 0);
});

test("moving to the current column is rejected without creating an entry activation", async (t) => {
  const fixture = await createFixture("same-column-move");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Do not fake re-entry",
    description: "Only actual column entry activates a watcher.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-noop-move",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const result = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "same-column-move",
  });

  assert.deepEqual(result, { accepted: false, reason: "invalid-destination" });
  const unchanged = application.queryTask(created.task.id);
  assert.equal(unchanged.available, true);
  if (unchanged.available) assert.equal(unchanged.task.activations.length, 1);
});

test("a process with watched columns cannot resume without a configured runtime", async (t) => {
  const fixture = await createFixture("missing-runtime");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Remain safely paused",
    description: "Runnable work needs a configured runtime before resume.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-without-runtime",
  });
  assert.equal(created.accepted, true);

  assert.deepEqual(await application.resumeAutomation(), {
    accepted: false,
    reason: "runtime-unavailable",
  });
  assert.deepEqual(application.queryAutomation(), {
    state: "paused",
    attemptsMayStart: false,
  });
});

test("a runtime startup failure leaves automation paused with an actionable result", async (t) => {
  const fixture = await createFixture("runtime-start-failure");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: {
        run: () => Promise.reject(new Error("Codex executable could not start")),
      },
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Report startup failures",
    description: "Resume should not claim the runtime started.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-startup-failure",
  });
  assert.equal(created.accepted, true);

  assert.deepEqual(await application.resumeAutomation(), {
    accepted: false,
    reason: "runtime-start-failed",
    diagnostic: "Codex executable could not start",
  });
  assert.deepEqual(application.queryAutomation(), {
    state: "paused",
    attemptsMayStart: false,
  });
  const failed = created.accepted ? application.queryTask(created.task.id) : undefined;
  assert.equal(failed?.available, true);
  if (failed?.available) assert.equal(failed.task.activations[0]?.status, "failed");
});

test("a failed outcome before thread startup preserves the runtime diagnostic", async (t) => {
  const fixture = await createFixture("runtime-pre-thread-failure");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: {
        run: () =>
          Promise.resolve({
            status: "failed",
            summary: "Codex rejected the MCP server configuration",
          }),
      },
    },
  });
  t.after(() => application.close());
  application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve the runtime diagnostic",
    description: "A pre-thread failure should remain actionable.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-pre-thread-failure",
  });

  assert.deepEqual(await application.resumeAutomation(), {
    accepted: false,
    reason: "runtime-start-failed",
    diagnostic: "Codex rejected the MCP server configuration",
  });
});

test("a pre-attempt workspace failure is durable, correlated, and visible after restart", async (t) => {
  const fixture = await createFixture("durable-startup-failure", "missing-starting-ref");
  const logged: unknown[] = [];
  const firstApplication = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDiagnostic: (diagnostic) => logged.push(diagnostic),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: new CompletingAgentRuntime(),
    },
  });
  const created = firstApplication.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Persist workspace startup evidence",
    description: "A missing starting ref must remain visible after the Resume response is gone.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-durable-startup-failure",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const resume = await firstApplication.resumeAutomation();
  assert.equal(resume.accepted, false);
  if (resume.accepted || resume.reason !== "runtime-start-failed") return;
  const failed = firstApplication.queryTask(created.task.id);
  assert.equal(failed.available, true);
  if (!failed.available) return;
  const activation = failed.task.activations[0];
  assert.equal(activation?.status, "failed");
  assert.deepEqual(activation?.attempts, []);
  assert.equal(activation?.startupFailure?.boundary, "starting-ref-resolution");
  assert.equal(activation?.startupFailure?.diagnostic, resume.diagnostic);
  assert.equal(activation?.startupFailure?.resolvedAt, null);
  assert.match(activation?.startupFailure?.occurredAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(logged, [
    {
      taskId: created.task.id,
      activationId: activation?.id,
      occurredAt: activation?.startupFailure?.occurredAt,
      boundary: "starting-ref-resolution",
      diagnostic: resume.diagnostic,
      resolvedAt: null,
    },
  ]);
  const inspection = firstApplication.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.equal(inspection.task.run.status, "failed");
    assert.deepEqual(inspection.task.unresolvedAttention.map((reason) => reason.type), ["failed-run"]);
  }
  firstApplication.close();

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restarted.close());
  const persisted = restarted.queryTask(created.task.id);
  assert.equal(persisted.available, true);
  if (!persisted.available) return;
  assert.deepEqual(
    persisted.task.activations[0]?.startupFailure,
    activation?.startupFailure,
  );
});

test("resuming runs the queued activation in a just-in-time detached task workspace", async (t) => {
  const fixture = await createFixture("first-run");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Run in isolation",
    description: "Provision only when automation can run.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-runnable-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await assert.rejects(execFileAsync("git", ["-C", fixture.workspaceRoot, "status"]));
  assert.equal(runtime.requests.length, 0);

  await application.resumeAutomation();

  assert.equal(runtime.requests.length, 1);
  const running = application.queryTask(created.task.id);
  assert.equal(running.available, true);
  if (running.available) {
    assert.equal(running.task.activations[0]?.attempts[0]?.threadId, "controlled-thread");
    assert.equal(
      running.task.activity.find((activity) => activity.type === "attempt.started")?.details.threadId,
      "controlled-thread",
    );
  }
  const request = runtime.requests[0];
  assert.ok(request);
  assert.deepEqual(request.agent, {
    id: "implementer",
    name: "Implementation Agent",
    role: "Implements scoped tasks",
    summary: "Builds and verifies changes.",
    instructions: "Implement the requested task.\n",
  });
  assert.deepEqual(request.reason, created.task.activations[0]?.reason);
  assert.deepEqual(request.sourceEvent, created.task.activity[0]);
  assert.equal(request.task.id, created.task.id);
  assert.equal(request.task.columnId, "implementation");
  assert.equal(request.workspace.startingRef, "main");
  assert.equal(request.workspace.path, join(fixture.workspaceRoot, created.task.id));
  const [{ stdout: workspaceCommit }, { stdout: startingCommit }, { stdout: branch }] =
    await Promise.all([
      execFileAsync("git", ["-C", request.workspace.path, "rev-parse", "HEAD"]),
      execFileAsync("git", ["-C", fixture.repositoryPath, "rev-parse", "main"]),
      execFileAsync("git", ["-C", request.workspace.path, "rev-parse", "--abbrev-ref", "HEAD"]),
    ]);
  assert.equal(workspaceCommit.trim(), startingCommit.trim());
  assert.equal(branch.trim(), "HEAD");

  runtime.complete({ status: "completed", summary: "Implemented and verified." });
  await application.waitForAutomationIdle();
  const completed = application.queryTask(created.task.id);
  assert.equal(completed.available, true);
  if (!completed.available) return;
  assert.equal(completed.task.columnId, "implementation");
  assert.equal(completed.task.revision, 1);
  assert.deepEqual(
    completed.task.activations[0]?.attempts.map((attempt) => ({
      status: attempt.status,
      outcome: attempt.outcome,
      workspacePath: attempt.workspacePath,
    })),
    [
      {
        status: "completed",
        outcome: { status: "completed", summary: "Implemented and verified." },
        workspacePath: request.workspace.path,
      },
    ],
  );
  assert.deepEqual(
    completed.task.activity.map((event) => event.type),
    ["task.created", "activation.created", "attempt.started", "attempt.completed"],
  );
});

test(
  "the Windows source-start identity provisions a registered worktree without changing global Git trust",
  { skip: process.platform !== "win32" },
  async (t) => {
    const fixture = await createFixture("windows-source-identity");
    const safeDirectoriesBefore = await readGlobalSafeDirectories();
    const runtime = new CompletingAgentRuntime();
    const application = await CoordinationApplication.start({
      processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath,
      runtimeDispatch: {
        projectRepositoryPath: fixture.repositoryPath,
        taskWorkspaceRoot: fixture.workspaceRoot,
        agentRuntime: runtime,
      },
    });
    t.after(() => application.close());
    const created = application.createTask({
      boardId: "delivery",
      columnId: "implementation",
      title: "Verify Windows source-start permissions",
      description: "Provision through Git's ordinary worktree registration without trust changes.",
      actor: { kind: "user", id: "paul" },
      idempotencyKey: "windows-source-identity-task",
    });
    assert.equal(created.accepted, true);
    if (!created.accepted) return;

    assert.equal((await application.resumeAutomation()).accepted, true);
    await application.waitForAutomationIdle();
    const workspacePath = runtime.requests[0]?.workspace.path;
    assert.ok(workspacePath);
    const registration = (
      await execFileAsync("git", [
        "-C",
        fixture.repositoryPath,
        "worktree",
        "list",
        "--porcelain",
      ])
    ).stdout;
    assert.ok(
      registration.toLowerCase().includes(workspacePath.replaceAll("\\", "/").toLowerCase()),
    );
    assert.deepEqual(await readGlobalSafeDirectories(), safeDirectoriesBefore);
  },
);

test("entering a watched column wakes automation that is already running", async (t) => {
  const fixture = await createFixture("running-entry");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  await application.resumeAutomation();

  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Wake the running scheduler",
    description: "Running automation should notice new runnable work.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-while-running",
  });
  assert.equal(created.accepted, true);
  await application.waitForAutomationIdle();

  assert.equal(runtime.requests.length, 1);
});

test("successive activations reuse one task workspace while another task is isolated", async (t) => {
  const fixture = await createFixture("workspace-reuse");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const first = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Reuse my workspace",
    description: "Successive runs share durable Git state.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-first-workspace-task",
  });
  const second = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Use another workspace",
    description: "Tasks remain isolated from each other.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-second-workspace-task",
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;

  await application.resumeAutomation();
  const firstRequest = await runtime.waitForRequest(1);
  await execFileAsync("git", ["-C", firstRequest.workspace.path, "switch", "-c", "task-work"]);
  await writeFile(join(firstRequest.workspace.path, "result.txt"), "Agent-created result.\n");
  await execFileAsync("git", ["-C", firstRequest.workspace.path, "add", "result.txt"]);
  await execFileAsync("git", [
    "-C",
    firstRequest.workspace.path,
    "-c",
    "user.name=Coordination Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Agent result",
  ]);
  const firstToBacklog = application.moveTask({
    taskId: first.task.id,
    destinationColumnId: "backlog",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "first-to-backlog",
  });
  assert.equal(firstToBacklog.accepted, true);
  const firstReentry = application.moveTask({
    taskId: first.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 2,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "first-reentry",
  });
  const secondEntry = application.moveTask({
    taskId: second.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "second-entry",
  });
  assert.equal(firstReentry.accepted, true);
  assert.equal(secondEntry.accepted, true);

  runtime.complete({ status: "completed", summary: "First activation complete." });
  const repeatedRequest = await runtime.waitForRequest(2);
  assert.equal(repeatedRequest.workspace.path, firstRequest.workspace.path);
  assert.equal(repeatedRequest.workspace.commit, firstRequest.workspace.commit);
  assert.equal(
    (await execFileAsync("git", ["-C", repeatedRequest.workspace.path, "branch", "--show-current"]))
      .stdout.trim(),
    "task-work",
  );
  runtime.complete({ status: "completed", summary: "Repeated activation complete." });
  const otherTaskRequest = await runtime.waitForRequest(3);
  assert.notEqual(otherTaskRequest.workspace.path, firstRequest.workspace.path);
  runtime.complete({ status: "completed", summary: "Other task complete." });
  await application.waitForAutomationIdle();
});

test("a reused workspace must still be the task worktree registered by the project", async (t) => {
  const fixture = await createFixture("workspace-registration");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Verify my registered worktree",
    description: "An unrelated repository must never be accepted as this workspace.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-registration-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const workspacePath = runtime.requests[0]?.workspace.path;
  assert.ok(workspacePath);

  await execFileAsync("git", [
    "-C",
    fixture.repositoryPath,
    "worktree",
    "remove",
    "--force",
    workspacePath,
  ]);
  await execFileAsync("git", ["init", "--initial-branch=main", workspacePath]);
  const toBacklog = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "backlog",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "registration-to-backlog",
  });
  assert.equal(toBacklog.accepted, true);
  const reentry = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 2,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "registration-reentry",
  });
  assert.equal(reentry.accepted, true);

  await assert.rejects(
    application.waitForAutomationIdle(),
    /registered task worktree/,
  );
  assert.equal(runtime.requests.length, 1);
  const failed = application.queryTask(created.task.id);
  assert.equal(failed.available, true);
  if (failed.available) {
    const startupFailure = failed.task.activations[1]?.startupFailure;
    assert.equal(failed.task.activations[1]?.status, "failed");
    assert.deepEqual(failed.task.activations[1]?.attempts, []);
    assert.equal(startupFailure?.boundary, "worktree-registration");
    assert.match(startupFailure?.diagnostic ?? "", /registered task worktree/);
  }
});

test("a queued activation survives application restart and remains paused", async (t) => {
  const fixture = await createFixture("durable-queue");
  const firstApplication = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const created = firstApplication.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Survive restart",
    description: "Durable work stays queued and does not dispatch on startup.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-restart",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  firstApplication.close();

  const runtime = new CompletingAgentRuntime();
  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  t.after(() => restarted.close());
  assert.deepEqual(restarted.queryAutomation(), {
    state: "paused",
    attemptsMayStart: false,
  });
  assert.equal(runtime.requests.length, 0);
  const queued = restarted.queryTask(created.task.id);
  assert.equal(queued.available, true);
  if (!queued.available) return;
  assert.equal(queued.task.activations[0]?.status, "queued");

  await restarted.resumeAutomation();
  await restarted.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
  const completed = restarted.queryTask(created.task.id);
  assert.equal(completed.available, true);
  if (completed.available) assert.equal(completed.task.activations[0]?.status, "completed");
});

class ControlledAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];
  #complete: ((outcome: AgentRunOutcome) => void) | undefined;
  readonly #requestWaiters: Array<{
    count: number;
    resolve: (request: AgentRunRequest) => void;
  }> = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started("controlled-thread");
    for (const waiter of this.#requestWaiters.splice(0)) {
      if (this.requests.length >= waiter.count) {
        waiter.resolve(this.requests[waiter.count - 1] as AgentRunRequest);
      } else {
        this.#requestWaiters.push(waiter);
      }
    }
    return new Promise((resolve) => {
      this.#complete = resolve;
    });
  }

  waitForRequest(count: number): Promise<AgentRunRequest> {
    const existing = this.requests[count - 1];
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve) => {
      this.#requestWaiters.push({ count, resolve });
    });
  }

  complete(outcome: AgentRunOutcome): void {
    assert.ok(this.#complete, "No controlled agent run is awaiting completion");
    this.#complete(outcome);
    this.#complete = undefined;
  }
}

class CompletingAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started();
    return Promise.resolve({ status: "completed", summary: "Completed under control." });
  }
}

async function createFixture(name: string, startingRef = "main"): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `coordination-${name}-`));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Test project\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Coordination Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Initial commit",
  ]);

  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the requested task.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Activation process
defaultTaskWorkspaceStartingRef: ${startingRef}
coordinationGuidance: Keep activation provenance exact.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tasks
    summary: Builds and verifies changes.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Move work through delivery.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

async function readGlobalSafeDirectories(): Promise<string[]> {
  try {
    const result = await execFileAsync("git", ["config", "--global", "--get-all", "safe.directory"]);
    return result.stdout.split(/\r?\n/).filter((value) => value.length > 0);
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

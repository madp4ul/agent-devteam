import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
} from "../../src/application/runtime-contract.ts";
import type { TaskWorkspaceView } from "../../src/application/task-contract.ts";
import { GitTaskWorkspaceManager } from "../../src/application/internal/git-task-workspace.ts";

const execFileAsync = promisify(execFile);
import {
  CompletingAgentRuntime,
  ConcurrentAgentRuntime,
  ControlledAgentRuntime,
  ControlledRetryClock,
  createActivationFixture,
  createResponsibilityActivationFixture,
  PausedRetryClock,
  readGlobalSafeDirectories,
  startMentionedAgentMoveScenario,
} from "../support/activation-fixture.ts";

test("resuming runs the queued activation in a just-in-time detached task workspace", async (t) => {
  const fixture = await createActivationFixture(
    "first-run",
    "main",
    "    model: gpt-5.6-sol\n    reasoningEffort: medium\n",
  );
  const runtime = new ControlledAgentRuntime("controlled-thread");
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
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.deepEqual(inspection.task.currentActivation, {
      id: running.task.activations[0]?.id,
      targetAgentId: "implementer",
      state: "running",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
    });
  }
  const request = runtime.requests[0];
  assert.ok(request);
  assert.deepEqual(request.agent, {
    id: "implementer",
    name: "Implementation Agent",
    role: "Implements scoped tasks",
    summary: "Builds and verifies changes.",
    instructions: "Implement the requested task.\n",
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
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
      model: attempt.model,
      reasoningEffort: attempt.reasoningEffort,
    })),
    [
      {
        status: "completed",
        outcome: { status: "completed", summary: "Implemented and verified." },
        workspacePath: request.workspace.path,
        model: "gpt-5.6-sol",
        reasoningEffort: "medium",
      },
    ],
  );
  assert.deepEqual(
    completed.task.activity.map((event) => event.type),
    ["task.created", "activation.created", "attempt.started", "attempt.completed"],
  );
});

test("a failed start commit leaves external workspace state unadopted and blocks restart", async (t) => {
  const fixture = await createActivationFixture("start-commit-failure");
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
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Fail the prepared start commit",
    description: "Leave externally provisioned state for fail-closed startup validation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-start-commit-failure",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const originalProvision = GitTaskWorkspaceManager.prototype.provision;
  let markWorkspacePrepared = () => {};
  const workspacePrepared = new Promise<void>((resolve) => {
    markWorkspacePrepared = resolve;
  });
  let releaseProvision = () => {};
  const provisionReleased = new Promise<void>((resolve) => {
    releaseProvision = resolve;
  });
  t.mock.method(
    GitTaskWorkspaceManager.prototype,
    "provision",
    async function (
      this: GitTaskWorkspaceManager,
      taskId: string,
      startingRef: string,
      existing: TaskWorkspaceView | undefined,
    ): Promise<TaskWorkspaceView> {
      const workspace = await originalProvision.call(this, taskId, startingRef, existing);
      markWorkspacePrepared();
      await provisionReleased;
      return workspace;
    },
  );

  const resume = application.resumeAutomation();
  await workspacePrepared;
  const failureInjection = new DatabaseSync(fixture.databasePath);
  failureInjection.exec(`
    CREATE TRIGGER reject_attempt_start
    BEFORE INSERT ON activity_ledger
    WHEN NEW.type = 'attempt.started'
    BEGIN
      SELECT RAISE(ABORT, 'simulated attempt-start persistence failure');
    END;
  `);
  failureInjection.close();
  releaseProvision();
  const result = await resume;
  assert.equal(result.accepted, false);
  if (!result.accepted) {
    assert.equal(result.reason, "runtime-start-failed");
    assert.match(result.diagnostic ?? "", /simulated attempt-start persistence failure/);
  }
  assert.equal(runtime.requests.length, 0);
  const failedStart = application.queryTask(created.task.id);
  assert.equal(failedStart.available, true);
  if (failedStart.available) {
    assert.equal(failedStart.task.activations[0]?.status, "running");
    assert.deepEqual(failedStart.task.activations[0]?.attempts, []);
    assert.equal(
      failedStart.task.activity.some((activity) => activity.type === "attempt.started"),
      false,
    );
  }
  application.close();

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
  const startup = restarted.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.equal(
      startup.diagnostics.some(({ rule }) => rule.includes("database workspace record")),
      true,
    );
  }
  assert.equal(runtime.requests.length, 0);
});

test("user task inspection exposes the lazy task workspace lifecycle", async (t) => {
  const fixture = await createActivationFixture("inspect-task-workspace");
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
    title: "Inspect my workspace",
    description: "Show authoritative workspace identity only after provisioning.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-inspectable-workspace-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const beforeProvisioning = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(beforeProvisioning.available, true);
  if (!beforeProvisioning.available) return;
  assert.equal(beforeProvisioning.task.workspace, null);

  await application.resumeAutomation();
  const request = runtime.requests[0];
  assert.ok(request);
  const afterProvisioning = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(afterProvisioning.available, true);
  if (!afterProvisioning.available) return;
  assert.deepEqual(afterProvisioning.task.workspace, {
    path: join(fixture.workspaceRoot, created.task.id),
    startingRef: "main",
    commit: request.workspace.commit,
  });
});

test(
  "the Windows source-start identity provisions a registered worktree without changing global Git trust",
  { skip: process.platform !== "win32" },
  async (t) => {
    const fixture = await createActivationFixture("windows-source-identity");
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

test("successive activations reuse one task workspace while another task is isolated", async (t) => {
  const fixture = await createActivationFixture("workspace-reuse");
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
  const fixture = await createActivationFixture("workspace-registration");
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

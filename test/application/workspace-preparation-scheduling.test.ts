import { startWebServer } from "../../src/web/web-server.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { GitTaskWorkspaceManager } from "../../src/application/internal/git-task-workspace.ts";
import { CompletingAgentRuntime, ConcurrentAgentRuntime, createActivationFixture } from "../support/activation-fixture.ts";

const actor = { kind: "user", id: "user" } as const;

test("bounded workspace creation does not block ready tasks or duplicate task claims", async (t) => {
  const fixture = await createActivationFixture("parallel-preparation");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  const create = (title: string) => {
    const result = application.createTask({ boardId: "delivery", columnId: "implementation", title,
      description: "Controlled preparation", actor, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task.id;
  };
  const ready = create("Ready workspace");
  runtime.onCompletion = () => application.pauseAutomation();
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  runtime.onCompletion = () => { if (runtime.requests.length === 2) application.pauseAutomation(); };
  const first = create("First slow checkout");
  const second = create("Second slow checkout");
  const third = create("Capacity waiter");
  assert.ok(application.addTaskComment({ taskId: ready, body: "@implementer Continue", actor, idempotencyKey: "ready-again" }).accepted);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const preparing: string[] = [];
  const original = GitTaskWorkspaceManager.prototype.provision;
  t.mock.method(GitTaskWorkspaceManager.prototype, "provision", async function (this: GitTaskWorkspaceManager, ...args: Parameters<typeof original>) {
    if (args[2] === undefined) {
      preparing.push(args[0]);
      args[3]?.({ stage: "Updating files", completed: 25, total: 100, percent: 25 });
      await gate;
    }
    return original.apply(this, args);
  });
  try {
    const resumed = application.resumeAutomation();
    await eventually(() => runtime.requests.length === 2);
    assert.deepEqual(preparing, [first, second]);
    assert.equal(runtime.requests[1]!.task.id, ready);
    assert.equal(application.queryActiveRuns().some((run) => run.taskId === first || run.taskId === second), false);
    const preparations = application.queryWorkspacePreparations();
    assert.deepEqual(preparations.map(({ taskId, stage }) => ({ taskId, stage })),
      [{ taskId: first, stage: "creating" }, { taskId: second, stage: "creating" }]);
    assert.equal(preparations[0]!.progress?.completed, 25);
    assert.equal(preparations[0]!.taskTitle, "First slow checkout");
    const board = application.queryUserBoard();
    const card = board.boards.flatMap(({ columns }) => columns.flatMap(({ tasks }) => tasks)).find(({ id }) => id === first)!;
    assert.equal(card.run.activeAgentId, null);
    assert.equal(card.workspacePreparation?.progress?.completed, 25);
    const detail = application.queryUserTaskDetail(first);
    assert.ok(detail.available);
    assert.equal(detail.workspacePreparation?.taskId, first);
    assert.equal(detail.conversations[0]?.status, "preparing");
    const conversation = await application.queryAgentConversation(first, detail.conversations[0]!.id);
    assert.ok(conversation.available);
    assert.equal(conversation.conversation.workspacePreparation?.progress?.percent, 25);
    assert.equal(conversation.conversation.liveStatus, "queued");
    const server = await startWebServer(application, { host: "127.0.0.1", port: 0, assetDirectory: "dist/web" });
    try {
      const httpDetail = await (await fetch(`${server.baseUrl}/api/tasks/${first}`)).json() as typeof detail;
      assert.equal(httpDetail.workspacePreparation?.progress?.completed, 25);
    } finally { await server.close(); }
    assert.ok(preparations.every(({ startedAt }) => Number.isFinite(Date.parse(startedAt))));
    for (let index = 0; index < 3; index += 1) {
      application.addTaskComment({ taskId: first, body: "@implementer Later work", actor, idempotencyKey: `kick-${index}` });
    }
    await delay(30);
    assert.deepEqual(preparing, [first, second]);
    assert.ok(!preparing.includes(third));
    // Resume was paused by the ready runtime; capacity is not a current wait during pause.
    const capacityDetail = application.queryUserTaskDetail(third);
    assert.ok(capacityDetail.available);
    assert.equal(capacityDetail.preparationCapacityWait, undefined);
    application.pauseAutomation();
    release();
    await resumed;
    await application.waitForAutomationIdle();
    assert.equal(runtime.requests.length, 2);
    assert.deepEqual(application.queryWorkspacePreparations(), []);
  } finally {
    application.pauseAutomation();
    release();
    await application.waitForAutomationIdle();
    application.close();
  }
});

async function eventually(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 150 && !predicate(); index += 1) await delay(20);
  assert.ok(predicate(), "Expected application progress while unrelated preparation remained pending");
}

test("a preparation failure is task-local while later work can still start", async (t) => {
  const fixture = await createActivationFixture("preparation-failure-isolation");
  const runtime = new ConcurrentAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  const create = (title: string) => {
    const result = application.createTask({ boardId: "delivery", columnId: "implementation", title,
      description: "Controlled preparation", actor, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task.id;
  };
  const failing = create("Failed preparation");
  const independent = create("Independent run");
  const original = GitTaskWorkspaceManager.prototype.provision;
  t.mock.method(GitTaskWorkspaceManager.prototype, "provision", async function (this: GitTaskWorkspaceManager, ...args: Parameters<typeof original>) {
    if (args[0] === failing) throw new Error("Controlled checkout failure");
    return original.apply(this, args);
  });
  try {
    const resumed = application.resumeAutomation();
    await eventually(() => runtime.requests.length === 1);
    assert.equal(runtime.requests[0]!.task.id, independent);
    const later = create("Later independent run");
    await eventually(() => runtime.requests.length === 2);
    assert.equal(runtime.requests[1]!.task.id, later);
    const failed = application.queryTask(failing);
    assert.ok(failed.available);
    assert.equal(failed.task.activations[0]!.status, "failed");
    assert.match(failed.task.activations[0]!.startupFailure!.diagnostic, /Controlled checkout failure/);
    assert.deepEqual(failed.task.activations[0]!.attempts, []);
    assert.equal(application.queryWorkspacePreparations().length, 0);
    assert.ok((await resumed).accepted);
  } finally {
    application.pauseAutomation();
    for (const request of runtime.requests) runtime.complete(request.activationId, { status: "completed", summary: "Done" });
    await application.waitForAutomationIdle().catch(() => {});
    application.close();
  }
});

test("simultaneous preparation completion releases capacity without overlapping a task's activations", async (t) => {
  const fixture = await createActivationFixture("preparation-completion-order");
  const runtime = new ConcurrentAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  const ids = ["First", "Second", "Third"].map((title) => {
    const result = application.createTask({ boardId: "delivery", columnId: "implementation", title,
      description: "Controlled preparation", actor, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task.id;
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const calls: string[] = [];
  const original = GitTaskWorkspaceManager.prototype.provision;
  t.mock.method(GitTaskWorkspaceManager.prototype, "provision", async function (this: GitTaskWorkspaceManager, ...args: Parameters<typeof original>) {
    calls.push(args[0]);
    if (args[2] === undefined) await gate;
    return original.apply(this, args);
  });
  const completed = new Set<string>();
  try {
    const initialResume = application.resumeAutomation();
    await eventually(() => calls.length === 2);
    const capacityWaiter = application.queryUserTaskDetail(ids[2]!);
    assert.ok(capacityWaiter.available);
    assert.equal(capacityWaiter.preparationCapacityWait, true);
    assert.ok((await application.resumeAutomation()).accepted);
    assert.ok(application.addTaskComment({ taskId: ids[0]!, body: "@implementer Second activation", actor, idempotencyKey: "follow-up" }).accepted);
    release();
    await eventually(() => runtime.requests.length === 3);
    assert.ok((await initialResume).accepted);
    assert.equal(new Set(runtime.requests.map(({ task }) => task.id)).size, 3);
    assert.deepEqual(calls.sort(), [...ids].sort());
    const first = runtime.requests.find(({ task }) => task.id === ids[0])!;
    runtime.complete(first.activationId, { status: "completed", summary: "First activation finished" });
    completed.add(first.activationId);
    await eventually(() => runtime.requests.length === 4);
    assert.equal(runtime.requests[3]!.task.id, ids[0]);
    assert.notEqual(runtime.requests[3]!.activationId, first.activationId);
  } finally {
    application.pauseAutomation();
    release();
    for (const request of runtime.requests) {
      if (!completed.has(request.activationId)) runtime.complete(request.activationId, { status: "completed", summary: "Done" });
    }
    await application.waitForAutomationIdle();
    application.close();
  }
});

test("closing during preparation preserves unknown checkout evidence and refuses adoption on restart", async (t) => {
  const fixture = await createActivationFixture("close-during-preparation");
  const runtime = new CompletingAgentRuntime();
  const options = {
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  };
  const application = await CoordinationApplication.start(options);
  const result = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Interrupted checkout",
    description: "Preserve recovery evidence", actor, idempotencyKey: "interrupted" });
  assert.ok(result.accepted);
  let release = () => {};
  let prepared = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const original = GitTaskWorkspaceManager.prototype.provision;
  const mocked = t.mock.method(GitTaskWorkspaceManager.prototype, "provision", async function (this: GitTaskWorkspaceManager, ...args: Parameters<typeof original>) {
    const workspace = await original.apply(this, args);
    prepared = true;
    await gate;
    return workspace;
  });
  const resumed = application.resumeAutomation();
  await eventually(() => prepared);
  application.close();
  release();
  await resumed;
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 0);
  mocked.mock.restore();
  const restarted = await CoordinationApplication.start(options);
  t.after(() => restarted.close());
  const startup = restarted.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.ok(startup.diagnostics.some(({ rule }) => rule.includes("database workspace record")));
  }
});


for (const interruptBeforeStart of [false, true]) test(`runtime startup remains distinct from execution (interrupt before start: ${interruptBeforeStart})`, async () => {
  const fixture = await createActivationFixture("preparation-runtime-startup");
  let lifecycle: import("../../src/application/runtime-contract.ts").AgentRunLifecycle | undefined;
  let finish!: (outcome: import("../../src/application/runtime-contract.ts").AgentRunOutcome) => void;
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: { run(_request, control) { lifecycle = control; return new Promise((resolve) => { finish = resolve; }); } } } });
  try {
    const task = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Startup", description: "Controlled runtime startup", actor, idempotencyKey: "startup" });
    assert.ok(task.accepted);
    await application.resumeAutomation();
    await eventually(() => lifecycle !== undefined);
    assert.equal(application.queryActiveRuns()[0]!.status, "starting");
    assert.equal(application.queryActiveRuns()[0]!.executionStarted, false);
    const detail = application.queryUserTaskDetail(task.task.id);
    assert.ok(detail.available);
    assert.equal(detail.conversations[0]!.status, "starting");
    if (interruptBeforeStart) {
      const interrupted = application.interruptTask({ taskId: task.task.id, actor, idempotencyKey: "interrupt-startup" });
      assert.ok(interrupted.accepted);
      assert.equal(application.queryActiveRuns()[0]!.status, "interrupting");
      assert.equal(application.queryActiveRuns()[0]!.executionStarted, false);
    } else {
      lifecycle!.started("startup-thread");
      assert.equal(application.queryActiveRuns()[0]!.status, "running");
      assert.equal(application.queryActiveRuns()[0]!.executionStarted, true);
    }
  } finally {
    application.pauseAutomation();
    finish?.({ status: "completed", summary: "Done" });
    await application.waitForAutomationIdle();
    assert.equal(application.queryActivityMenuHistory().runs[0]?.status, interruptBeforeStart ? "interrupted" : "completed");
    assert.equal(application.queryActivityMenuHistory().preparations[0]?.status, "prepared");
    application.close();
  }
});

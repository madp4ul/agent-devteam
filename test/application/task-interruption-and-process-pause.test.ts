import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import {
  CoordinationApplication,
  type AgentRunLifecycle,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRuntime,
  type AttemptTranscriptAccess,
  type AttemptTranscriptItem,
  type AutomationClock,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);

test("interrupt confirms runtime termination, preserves the queue head, and continues in context", async (t) => {
  const fixture = await createFixture("interrupt");
  const runtime = new InterruptibleRuntime();
  const application = await startApplication(fixture, runtime);

  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Interrupt safely",
    description: "Preserve this activation while a user investigates.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-interrupt-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  const interrupt = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-current-attempt",
  });
  assert.equal(interrupt.accepted, true);
  if (!interrupt.accepted) return;
  assert.equal(interrupt.state, "interrupting");
  const interruptReplay = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-current-attempt",
  });
  assert.equal(interruptReplay.accepted, true);
  await interrupt.confirmed;
  const confirmedReplay = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-current-attempt",
  });
  assert.equal(confirmedReplay.accepted, true);
  if (confirmedReplay.accepted) assert.equal(confirmedReplay.state, "interrupted");

  const interrupted = application.queryTask(created.task.id);
  assert.equal(interrupted.available, true);
  if (!interrupted.available) return;
  assert.equal(interrupted.task.activations[0]?.status, "queued");
  assert.equal(interrupted.task.activations[0]?.attempts[0]?.status, "interrupted");
  assert.equal(interrupted.task.activations[0]?.attempts[0]?.outcome?.status, "user-interrupted");
  assert.equal(interrupted.task.activations[0]?.attempts.length, 1);
  assert.deepEqual(await application.queryAttemptTranscript(first.attemptId), {
    available: true,
    threadId: "thread-1",
    items: [{ kind: "message", role: "agent", text: "Attempt 1 interruptible evidence." }],
  });
  assert.deepEqual(interrupted.task.activity.at(-1)?.actor, { kind: "user", id: "paul" });
  const firstSuspensionActivity = interrupted.task.activity.find(
    (activity) => activity.type === "automation.suspended",
  );
  assert.ok(firstSuspensionActivity);
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) assert.equal(inspection.task.automationSuspended, true);
  const suspendedOverview = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["implementation"],
  });
  assert.equal(suspendedOverview.available, true);
  if (suspendedOverview.available) {
    assert.equal(suspendedOverview.tasks[0]?.automationSuspended, true);
    assert.equal(suspendedOverview.tasks[0]?.run.status, "queued");
  }
  const suspendedAttention = application.queryNeedsAttention();
  assert.equal(suspendedAttention.available, true);
  let firstSuspensionReasonId: string | undefined;
  if (suspendedAttention.available) {
    const taskAttention = suspendedAttention.tasks.find(({ task }) => task.id === created.task.id);
    assert.equal(String(taskAttention?.reasons[0]?.type), "automation-suspended");
    assert.equal(taskAttention?.reasons[0]?.sourceEventId, firstSuspensionActivity.id);
    firstSuspensionReasonId = taskAttention?.reasons[0]?.id;
  }

  const continued = application.continueInterruptedTask({
    taskId: created.task.id,
    message: "",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-current-attempt",
  });
  assert.equal(continued.accepted, true);
  assert.deepEqual(application.continueInterruptedTask({
    taskId: created.task.id,
    message: "",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-current-attempt",
  }), continued);
  const continuedOverview = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["implementation"],
  });
  assert.equal(continuedOverview.available, true);
  if (continuedOverview.available) {
    assert.equal(continuedOverview.tasks[0]?.automationSuspended, false);
  }
  const continuedAttention = application.queryNeedsAttention();
  assert.equal(continuedAttention.available, true);
  if (continuedAttention.available) {
    assert.equal(continuedAttention.tasks.some(({ task }) => task.id === created.task.id), false);
  }
  const afterContinue = application.queryTask(created.task.id);
  assert.equal(afterContinue.available, true);
  if (afterContinue.available) {
    const continuedActivity = afterContinue.task.activity.find(
      (activity) => activity.type === "automation.resumed",
    );
    assert.deepEqual(continuedActivity?.actor, { kind: "user", id: "paul" });
  }
  const second = await runtime.waitForRequest(2);
  assert.equal(second.activationId, first.activationId);
  assert.equal(second.workspace.path, first.workspace.path);
  assert.equal(second.resumeThreadId, "thread-1");
  assert.equal(second.attempt.number, 2);
  assert.equal(second.attempt.precedingOutcome?.status, "user-interrupted");
  assert.equal(second.attempt.continuationMessage, null);
  const secondInterrupt = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-continued-attempt",
  });
  assert.equal(secondInterrupt.accepted, true);
  if (!secondInterrupt.accepted) return;
  await secondInterrupt.confirmed;
  const twiceInterrupted = application.queryTask(created.task.id);
  assert.equal(twiceInterrupted.available, true);
  if (!twiceInterrupted.available) return;
  const secondSuspensionActivity = twiceInterrupted.task.activity
    .filter((activity) => activity.type === "automation.suspended")
    .at(-1);
  assert.ok(secondSuspensionActivity);
  const secondSuspendedAttention = application.queryNeedsAttention();
  assert.equal(secondSuspendedAttention.available, true);
  if (secondSuspendedAttention.available) {
    const reason = secondSuspendedAttention.tasks
      .find(({ task }) => task.id === created.task.id)?.reasons[0];
    assert.notEqual(reason?.id, firstSuspensionReasonId);
    assert.equal(reason?.sourceEventId, secondSuspensionActivity.id);
  }
  const secondContinue = application.continueInterruptedTask({
    taskId: created.task.id,
    message: "Finish after the second interruption.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-second-interruption",
  });
  assert.equal(secondContinue.accepted, true);
  await runtime.waitForRequest(3);
  runtime.complete({ status: "completed", summary: "Continued safely.", threadId: "thread-1" });
  await application.waitForAutomationIdle();
  application.close();
  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => restarted.close());
  assert.deepEqual(await restarted.queryAttemptTranscript(first.attemptId), {
    available: true,
    threadId: "thread-1",
    items: [{ kind: "message", role: "agent", text: "Attempt 1 interruptible evidence." }],
  });
});

test("user dismisses an interrupted head and releases later work in Completion", async (t) => {
  const fixture = await createFixture("dismiss-interrupted");
  const runtime = new InterruptibleRuntime();
  const application = await startApplication(fixture, runtime);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Dismiss interrupted work",
    description: "Let the later consultation proceed after interruption.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-dismiss-interrupted-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: "@consultant inspect the final state after implementation stops.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-later-consultation",
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) return;
  const [interruptedActivation, laterActivation] = mentioned.task.activations;
  assert.ok(interruptedActivation);
  assert.ok(laterActivation);

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  assert.equal(first.activationId, interruptedActivation.id);
  const interruption = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-before-dismissal",
  });
  assert.equal(interruption.accepted, true);
  if (!interruption.accepted) return;
  await interruption.confirmed;
  const completed = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "completion",
    expectedRevision: created.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-interrupted-task-to-completion",
  });
  assert.equal(completed.accepted, true);
  if (!completed.accepted) return;

  const dismissed = application.dismissActivation({
    activationId: interruptedActivation.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-interrupted-head",
  });
  assert.deepEqual(dismissed, {
    accepted: true,
    activationId: interruptedActivation.id,
  });
  const next = await runtime.waitForRequest(2);
  assert.equal(next.activationId, laterActivation.id);
  const inspected = application.queryTask(created.task.id);
  assert.equal(inspected.available, true);
  if (!inspected.available) return;
  assert.equal(inspected.task.columnId, "completion");
  assert.equal(inspected.task.activations[0]?.status, "dismissed");
  assert.equal(inspected.task.activations[0]?.attempts.length, 1);
  assert.equal(inspected.task.activations[0]?.attempts[0]?.outcome?.status, "user-interrupted");
  const dismissal = inspected.task.activity.find(
    (activity) => activity.type === "activation.dismissed",
  );
  assert.equal(dismissal?.details.clearedSuspension, "true");
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) assert.equal(inspection.task.automationSuspended, false);
  runtime.complete({ status: "completed", summary: "Later consultation completed." });
  await application.waitForAutomationIdle();
});

test("dismissing later queued work leaves the interrupted head suspended", async (t) => {
  const fixture = await createFixture("dismiss-behind-interruption");
  const runtime = new InterruptibleRuntime();
  const application = await startApplication(fixture, runtime);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Keep interruption suspended",
    description: "Dismiss only the later consultation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-suspended-dismissal-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: "@consultant this later consultation is no longer wanted.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-dismissible-consultation",
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) return;
  await application.resumeAutomation();
  const running = await runtime.waitForRequest(1);
  assert.deepEqual(application.dismissActivation({
    activationId: running.activationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "cannot-dismiss-running-activation",
  }), { accepted: false, reason: "not-dismissible" });
  const interruption = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-before-later-dismissal",
  });
  assert.equal(interruption.accepted, true);
  if (!interruption.accepted) return;
  await interruption.confirmed;
  const laterActivationId = mentioned.task.activations[1]!.id;
  const beforeDismissal = application.queryTask(created.task.id);
  assert.equal(beforeDismissal.available, true);
  if (beforeDismissal.available) {
    assert.deepEqual(beforeDismissal.task.activations[1]?.dismissal, { mayStartNext: false });
  }
  assert.deepEqual(application.dismissActivation({
    activationId: laterActivationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-later-while-suspended",
  }), { accepted: true, activationId: laterActivationId });
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) assert.equal(inspection.task.automationSuspended, true);
  const task = application.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (!task.available) return;
  assert.equal(task.task.activations[0]?.status, "queued");
  assert.equal(task.task.activations[1]?.status, "dismissed");
  assert.equal(runtime.requests.length, 1);
});

test("pause drains active attempts and preserves queued work until resume", async (t) => {
  const fixture = await createFixture("pause");
  const runtime = new InterruptibleRuntime();
  const application = await startApplication(fixture, runtime);
  t.after(() => application.close());

  for (const [title, key] of [["First", "first"], ["Second", "second"]] as const) {
    const created = application.createTask({
      boardId: "delivery",
      columnId: "implementation",
      title,
      description: `${title} independent task.`,
      actor: { kind: "user", id: "paul" },
      idempotencyKey: key,
    });
    assert.equal(created.accepted, true);
  }

  await application.resumeAutomation();
  await runtime.waitForRequest(2);
  const pausing = application.pauseAutomation();
  assert.deepEqual(pausing, { accepted: true, automation: { state: "pausing", attemptsMayStart: false } });
  runtime.completeAll({ status: "completed", summary: "Finished while draining." });
  await application.waitForAutomationIdle();
  assert.deepEqual(application.queryAutomation(), { state: "paused", attemptsMayStart: false });

  const third = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Queued while paused",
    description: "This must not dispatch until Resume.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "third",
  });
  assert.equal(third.accepted, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtime.requests.length, 2);
  await application.resumeAutomation();
  await runtime.waitForRequest(3);
  runtime.completeAll({ status: "completed", summary: "Resumed in order." });
  await application.waitForAutomationIdle();
});

test("live-run projection uses the mentioned agent rather than the column watcher", async (t) => {
  const fixture = await createFixture("mentioned-agent");
  const runtime = new InterruptibleRuntime();
  const application = await startApplication(fixture, runtime);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Consult another role",
    description: "The active agent does not own this column.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-consultation",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const commented = application.addTaskComment({
    taskId: created.task.id,
    body: "@consultant please inspect this question.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "request-consultation",
  });
  assert.equal(commented.accepted, true);
  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  assert.deepEqual(application.queryActiveRuns().map((run) => ({
    taskId: run.taskId,
    agentId: run.agentId,
    columnId: run.columnId,
    status: run.status,
  })), [{
    taskId: created.task.id,
    agentId: "consultant",
    columnId: "backlog",
    status: "running",
  }]);
  runtime.completeAll({ status: "completed", summary: "Consulted." });
  await application.waitForAutomationIdle();
});

test("pause preserves a scheduled retry without starting it", async (t) => {
  const fixture = await createFixture("scheduled-retry-pause");
  const runtime = new FailingThenCompletingRuntime();
  const clock = new RetryClock();
  const application = await startApplication(fixture, runtime, clock);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve scheduled retry",
    description: "Pause must hold the retry until Resume.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-retry-pause",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await waitUntil(() => {
    const task = application.queryTask(created.task.id);
    return task.available && task.task.activations[0]?.recovery?.state === "scheduled";
  });
  assert.equal(runtime.requests.length, 1);
  application.pauseAutomation();
  clock.advanceTo("2026-01-01T12:00:10.000Z");
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
  await application.resumeAutomation();
  await waitUntil(() => runtime.requests.length === 2);
  await application.waitForAutomationIdle();
});

test("interrupt confirmation rejects when durable finalization fails", async () => {
  const fixture = await createFixture("interrupt-persistence-failure");
  const runtime = new InterruptibleRuntime();
  const application = await startApplication(fixture, runtime);
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Require durable interruption",
    description: "Do not confirm if suspension cannot be stored.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-durable-interrupt",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  const interrupt = application.interruptTask({
    taskId: created.task.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "interrupt-with-store-failure",
  });
  assert.equal(interrupt.accepted, true);
  if (!interrupt.accepted) return;
  application.close();
  await assert.rejects(interrupt.confirmed);
  await assert.rejects(application.waitForAutomationIdle());
});

class InterruptibleRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly requests: AgentRunRequest[] = [];
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();
  readonly #pending = new Map<string, (outcome: AgentRunOutcome) => void>();
  readonly #waiters: Array<{ count: number; resolve(request: AgentRunRequest): void }> = [];

  run(
    request: AgentRunRequest,
    lifecycle: AgentRunLifecycle,
    signal?: AbortSignal,
  ): Promise<AgentRunOutcome> {
    this.requests.push(request);
    this.#transcripts.set(request.attemptId, [{
      kind: "message",
      role: "agent",
      text: `Attempt ${request.attempt.number} interruptible evidence.`,
    }]);
    lifecycle.started(`thread-${this.requests.length}`);
    for (const waiter of this.#waiters.splice(0)) {
      const found = this.requests[waiter.count - 1];
      if (found === undefined) this.#waiters.push(waiter);
      else waiter.resolve(found);
    }
    return new Promise((resolve) => {
      this.#pending.set(request.activationId, resolve);
      signal?.addEventListener("abort", () => {
        this.#pending.delete(request.activationId);
        resolve({ status: "failed", summary: "Runtime stopped after user interrupt.", threadId: `thread-${this.requests.length}` });
      }, { once: true });
    });
  }

  async read(attemptId: string): Promise<AttemptTranscriptItem[] | null> {
    return structuredClone(this.#transcripts.get(attemptId) ?? null);
  }

  waitForRequest(count: number): Promise<AgentRunRequest> {
    const existing = this.requests[count - 1];
    return existing === undefined
      ? new Promise((resolve) => this.#waiters.push({ count, resolve }))
      : Promise.resolve(existing);
  }

  complete(outcome: AgentRunOutcome): void {
    const next = this.#pending.values().next().value as ((value: AgentRunOutcome) => void) | undefined;
    assert.ok(next);
    this.#pending.delete(this.#pending.keys().next().value as string);
    next(outcome);
  }

  completeAll(outcome: AgentRunOutcome): void {
    for (const complete of this.#pending.values()) complete(outcome);
    this.#pending.clear();
  }
}

async function startApplication(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  runtime: AgentRuntime,
  automationClock?: AutomationClock,
): Promise<CoordinationApplication> {
  return CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    ...(automationClock === undefined ? {} : { automationClock }),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
    ...(runtime instanceof InterruptibleRuntime ? { transcriptAccess: runtime } : {}),
  });
}

class FailingThenCompletingRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started(`retry-thread-${this.requests.length}`);
    return Promise.resolve(this.requests.length === 1
      ? { status: "failed", summary: "Transient failure." }
      : { status: "completed", summary: "Retry completed." });
  }
}

class RetryClock implements AutomationClock {
  #now = new Date("2026-01-01T12:00:00.000Z");
  readonly #waiters: Array<{ instant: string; resolve(): void }> = [];

  now(): Date {
    return new Date(this.#now);
  }

  waitUntil(instant: string): Promise<void> {
    if (Date.parse(instant) <= this.#now.getTime()) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.push({ instant, resolve }));
  }

  advanceTo(instant: string): void {
    this.#now = new Date(instant);
    for (const waiter of this.#waiters.splice(0)) {
      if (Date.parse(waiter.instant) <= this.#now.getTime()) waiter.resolve();
      else this.#waiters.push(waiter);
    }
  }
}

async function waitUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.fail("Condition did not become true");
}

async function createFixture(name: string): Promise<{
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
  await execFileAsync("git", ["-C", repositoryPath, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "initial"]);
  const processDirectory = join(directory, "process");
  await mkdir(processDirectory);
  await writeFile(join(processDirectory, "agent.md"), "Implement the task.\n");
  await writeFile(join(processDirectory, "consultant.md"), "Consult on the task.\n");
  const definitionPath = join(processDirectory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: Test process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Coordinate through the board.
agents:
  - id: implementer
    name: Implementer
    role: implementation
    summary: Implements tasks.
    instructions: agent.md
  - id: consultant
    name: Consultant
    role: consultation
    summary: Consults on tasks.
    instructions: consultant.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`);
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

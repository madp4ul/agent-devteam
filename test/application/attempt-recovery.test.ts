import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
  AttemptTokenUsage,
} from "../../src/application/runtime-contract.ts";

const execFileAsync = promisify(execFile);

test("user dismisses one untouched queued activation without creating an attempt", async (t) => {
  const fixture = await createFixture("dismiss-queued");
  const runtime = new ControlledRuntime();
  const clock = new ControlledClock("2026-01-01T12:00:00.000Z");
  const application = await startControlledApplication(fixture, runtime, clock);
  t.after(() => application.close());
  const { taskId, firstActivationId, laterActivationId } = createQueuedPair(application);

  const dismissed = application.dismissActivation({
    activationId: laterActivationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-untouched-queued-activation",
  });

  assert.deepEqual(dismissed, { accepted: true, activationId: laterActivationId });
  assert.deepEqual(application.dismissActivation({
    activationId: laterActivationId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-untouched-queued-activation",
  }), dismissed);
  const inspected = application.queryTask(taskId);
  assert.equal(inspected.available, true);
  if (!inspected.available) return;
  assert.equal(inspected.task.activations[0]?.id, firstActivationId);
  assert.equal(inspected.task.activations[0]?.status, "queued");
  assert.equal(inspected.task.activations[1]?.status, "dismissed");
  assert.deepEqual(inspected.task.activations[1]?.attempts, []);
  assert.deepEqual(
    inspected.task.activity.find((activity) => activity.type === "activation.dismissed"),
    {
      id: inspected.task.activity.find((activity) => activity.type === "activation.dismissed")?.id,
      type: "activation.dismissed",
      actor: { kind: "user", id: "paul" },
      occurredAt: inspected.task.activity.find((activity) => activity.type === "activation.dismissed")?.occurredAt,
      details: {
        activationId: laterActivationId,
        targetAgentId: "reviewer",
        reasonType: "column-entry",
        sourceEventId: inspected.task.activations[1]!.reason.sourceEventId,
      },
    },
  );
  assert.equal(runtime.requests.length, 0);
  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  assert.equal(first.activationId, firstActivationId);
  assert.equal(runtime.requests.some(({ activationId }) => activationId === laterActivationId), false);
  await runtime.finish({ status: "completed", summary: "Remaining work completed after resume." });
  await application.waitForAutomationIdle();
});

test("technical failure schedules the same head activation with capped exponential backoff", async (t) => {
  const fixture = await createFixture("technical-retry");
  const runtime = new ControlledRuntime();
  const clock = new ControlledClock("2026-01-01T12:00:00.000Z");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: clock,
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
    title: "Retry transient runtime failure",
    description: "Keep the original activation at the queue head.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-retry-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-later-activation",
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  const firstActivationId = moved.task.activations[0]!.id;
  const laterActivationId = moved.task.activations[1]!.id;
  const conversationId = moved.task.activations[0]!.conversationId;
  assert.ok(conversationId);

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  runtime.complete({ status: "failed", summary: "temporary transport failure", threadId: "thread-1" });
  await runtime.waitForCompletion();

  const waiting = application.queryTask(created.task.id);
  assert.equal(waiting.available, true);
  if (!waiting.available) return;
  assert.deepEqual(waiting.task.activations.map(({ id, status }) => ({ id, status })), [
    { id: firstActivationId, status: "queued" },
    { id: laterActivationId, status: "queued" },
  ]);
  assert.deepEqual(waiting.task.activations[0]?.recovery, {
    state: "scheduled",
    nextAttempt: 2,
    dueAt: "2026-01-01T12:00:05.000Z",
  });
  assert.equal(runtime.requests.length, 1);

  clock.advanceTo("2026-01-01T12:00:05.000Z");
  const second = await runtime.waitForRequest(2);
  assert.equal(second.activationId, first.activationId);
  assert.equal(second.attempt.number, 2);
  assert.equal(second.resumeThreadId, "thread-1");
  runtime.complete({ status: "completed", summary: "Recovered.", threadId: "thread-1" });

  const later = await runtime.waitForRequest(3);
  assert.equal(later.activationId, laterActivationId);
  runtime.complete({ status: "completed", summary: "Later work preserved." });
  await application.waitForAutomationIdle();
  const conversation = await application.queryAgentConversation(created.task.id, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.deepEqual(
      conversation.conversation.runs.map(({ activationId, attempt }) => ({
        activationId,
        threadId: attempt.threadId,
      })),
      [
        { activationId: firstActivationId, threadId: "thread-1" },
        { activationId: firstActivationId, threadId: "thread-1" },
      ],
    );
  }
});

test("exhaustion offers retry and dismiss only on the current attention reason", async (t) => {
  const fixture = await createFixture("exhausted-recovery");
  const runtime = new ControlledRuntime();
  const clock = new ControlledClock("2026-01-01T12:00:00.000Z");
  const application = await startControlledApplication(fixture, runtime, clock);
  t.after(() => application.close());
  const { taskId, firstActivationId, laterActivationId } = createQueuedPair(application);

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  await runtime.finish({ status: "failed", summary: "failure one", threadId: "thread-1" });
  clock.advanceTo("2026-01-01T12:00:05.000Z");
  await runtime.waitForRequest(2);
  await runtime.finish({ status: "failed", summary: "failure two", threadId: "thread-1" });
  clock.advanceTo("2026-01-01T12:00:15.000Z");
  await runtime.waitForRequest(3);
  await runtime.finish({ status: "failed", summary: "failure three", threadId: "thread-1" });
  await application.waitForAutomationIdle();

  const exhausted = application.queryTask(taskId);
  assert.equal(exhausted.available, true);
  if (!exhausted.available) return;
  assert.deepEqual(exhausted.task.activations[0]?.recovery, {
    state: "awaiting-retry",
    summary: "failure three",
  });
  assert.equal(exhausted.task.activations[1]?.status, "queued");
  assert.equal(exhausted.task.activations[0]?.attempts.length, 3);
  const attention = application.queryNeedsAttention();
  assert.equal(attention.available, true);
  if (!attention.available) return;
  const reason = attention.tasks[0]?.reasons[0];
  assert.deepEqual(reason?.recovery, {
    kind: "technical-failure",
    summary: "failure three",
    actions: ["retry", "dismiss"],
  });
  const failureOccurrences = application.queryNotificationOccurrences(0).occurrences;
  assert.deepEqual(failureOccurrences.map((occurrence) => occurrence.type), ["failed-run"]);
  assert.equal(failureOccurrences[0]?.attentionReasonId, reason?.id);
  const retried = application.retryFailedActivation({
    attentionReasonId: reason!.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "retry-exhausted-cycle",
  });
  assert.equal(retried.accepted, true);
  assert.deepEqual(application.retryFailedActivation({
    attentionReasonId: reason!.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "retry-exhausted-cycle",
  }), retried);
  const fourth = await runtime.waitForRequest(4);
  assert.equal(fourth.activationId, firstActivationId);
  assert.equal(fourth.attempt.number, 4);
  assert.equal(fourth.resumeThreadId, "thread-1");
  assert.equal(fourth.workspace.path, runtime.requests[0]?.workspace.path);
  await runtime.finish({ status: "completed", summary: "Recovered after user retry." });
  const later = await runtime.waitForRequest(5);
  assert.equal(later.activationId, laterActivationId);
  await runtime.finish({ status: "completed", summary: "Queue advanced." });
  await application.waitForAutomationIdle();
  const recovered = application.queryTask(taskId);
  assert.equal(recovered.available, true);
  if (!recovered.available) return;
  const conversationId = recovered.task.activations[0]?.conversationId;
  assert.ok(conversationId);
  const conversation = await application.queryAgentConversation(taskId, conversationId);
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.equal(conversation.conversation.runs.length, 4);
    assert.ok(conversation.conversation.runs.every(
      ({ activationId }) => activationId === firstActivationId,
    ));
  }
});

test("dismiss records abandonment and permits the preserved queue to advance", async (t) => {
  const fixture = await createFixture("dismiss-exhausted");
  const runtime = new ControlledRuntime();
  const clock = new ControlledClock("2026-01-01T12:00:00.000Z");
  const application = await startControlledApplication(fixture, runtime, clock);
  t.after(() => application.close());
  const { taskId, firstActivationId, laterActivationId } = createQueuedPair(application);

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  await runtime.finish({ status: "failed", summary: "failure one" });
  clock.advanceTo("2026-01-01T12:00:05.000Z");
  await runtime.waitForRequest(2);
  await runtime.finish({ status: "failed", summary: "failure two" });
  clock.advanceTo("2026-01-01T12:00:15.000Z");
  await runtime.waitForRequest(3);
  await runtime.finish({ status: "failed", summary: "failure three" });
  await application.waitForAutomationIdle();
  const attention = application.queryNeedsAttention();
  assert.equal(attention.available, true);
  if (!attention.available) return;

  const dismissed = application.dismissFailedActivation({
    attentionReasonId: attention.tasks[0]!.reasons[0]!.id,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "dismiss-exhausted-activation",
  });
  assert.equal(dismissed.accepted, true);
  const later = await runtime.waitForRequest(4);
  assert.equal(later.activationId, laterActivationId);
  await runtime.finish({ status: "completed", summary: "Later activation completed." });
  await application.waitForAutomationIdle();
  const inspected = application.queryTask(taskId);
  assert.equal(inspected.available, true);
  if (!inspected.available) return;
  assert.equal(inspected.task.activations[0]?.id, firstActivationId);
  assert.equal(inspected.task.activations[0]?.status, "dismissed");
  assert.equal(inspected.task.activations[1]?.status, "completed");
  assert.deepEqual(
    inspected.task.activity.find((activity) => activity.type === "activation.dismissed")?.details,
    {
      activationId: firstActivationId,
      targetAgentId: "implementer",
      reasonType: "column-entry",
      sourceEventId: inspected.task.activations[0]!.reason.sourceEventId,
    },
  );
  const noAttention = application.queryNeedsAttention();
  assert.equal(noAttention.available, true);
  if (noAttention.available) assert.deepEqual(noAttention.tasks, []);
});

test("permission block requires explicit continuation and never retries automatically", async (t) => {
  const fixture = await createFixture("permission-continuation");
  const runtime = new ControlledRuntime();
  const clock = new ControlledClock("2026-01-01T12:00:00.000Z");
  const application = await startControlledApplication(fixture, runtime, clock);
  const { taskId, firstActivationId, laterActivationId } = createQueuedPair(application);

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  runtime.setUsage(first.attemptId, {
    inputTokens: 1_000,
    cachedInputTokens: 800,
    cacheWriteInputTokens: 50,
    outputTokens: 200,
    reasoningOutputTokens: 100,
  });
  await runtime.finish({
    status: "permission-blocked",
    summary: "Writing the protected file requires user approval.",
    threadId: "permission-thread",
  });
  await application.waitForAutomationIdle();
  clock.advanceTo("2026-01-02T12:00:00.000Z");
  assert.equal(runtime.requests.length, 1);
  const attention = application.queryNeedsAttention();
  assert.equal(attention.available, true);
  if (!attention.available) return;
  const reason = attention.tasks[0]?.reasons[0];
  assert.deepEqual(reason?.recovery, {
    kind: "permission-block",
    summary: "Writing the protected file requires user approval.",
    actions: ["continue"],
    explanation:
      "Automatic retry is unavailable for permission blocks. Describe the exact retry you authorize, the managed policy you changed, or the operation you completed externally, then Continue. Auto-review can still deny the retry; continuation does not bypass policy.",
  });
  assert.deepEqual(await application.queryAttemptTranscript(first.attemptId), {
    available: true,
    threadId: "permission-thread",
    items: [{ kind: "message", role: "agent", text: "Attempt 1 runtime evidence." }],
    usage: {
      inputTokens: 1_000,
      cachedInputTokens: 800,
      cacheWriteInputTokens: 50,
      outputTokens: 200,
      reasoningOutputTokens: 100,
    },
  });

  application.close();
  const pausedAfterRestart = await startControlledApplication(fixture, runtime, clock);
  assert.deepEqual(pausedAfterRestart.continuePermissionBlockedActivation({
    attentionReasonId: reason!.id,
    message: "   ",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-without-authorization",
  }), { accepted: false, reason: "message-required" });
  const continued = pausedAfterRestart.continuePermissionBlockedActivation({
    attentionReasonId: reason!.id,
    message: "I authorize retrying the exact protected-file write after reviewing the requested action.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-after-policy-change",
  });
  assert.equal(continued.accepted, true);
  pausedAfterRestart.close();
  const restarted = await startControlledApplication(fixture, runtime, clock);
  t.after(() => restarted.close());
  assert.equal((await restarted.resumeAutomation()).accepted, true);
  const resumed = await runtime.waitForRequest(2);
  assert.equal(resumed.activationId, firstActivationId);
  assert.equal(resumed.resumeThreadId, "permission-thread");
  assert.equal(resumed.workspace.path, first.workspace.path);
  assert.equal(
    resumed.attempt.continuationMessage,
    "I authorize retrying the exact protected-file write after reviewing the requested action.",
  );
  runtime.setUsage(resumed.attemptId, {
    inputTokens: 1_600,
    cachedInputTokens: 1_100,
    cacheWriteInputTokens: 90,
    outputTokens: 350,
    reasoningOutputTokens: 180,
  });
  await runtime.finish({
    status: "permission-blocked",
    summary: "Auto-review denied the protected-file write after reassessment.",
    threadId: "permission-thread",
  });
  await restarted.waitForAutomationIdle();
  clock.advanceTo("2026-01-03T12:00:00.000Z");
  assert.equal(runtime.requests.length, 2);
  const repeatedAttention = restarted.queryNeedsAttention();
  assert.equal(repeatedAttention.available, true);
  if (!repeatedAttention.available) return;
  const repeatedReason = repeatedAttention.tasks[0]?.reasons[0];
  assert.equal(repeatedReason?.recovery?.kind, "permission-block");
  assert.equal(restarted.continuePermissionBlockedActivation({
    attentionReasonId: repeatedReason!.id,
    message: "I completed the protected-file write externally; reassess the workspace and continue.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-after-external-action",
  }).accepted, true);
  const recovered = await runtime.waitForRequest(3);
  assert.equal(
    recovered.attempt.continuationMessage,
    "I completed the protected-file write externally; reassess the workspace and continue.",
  );
  runtime.omitTranscript(recovered.attemptId);
  await runtime.finish({
    status: "permission-blocked",
    summary: "The resumed attempt ended before Codex reported usage.",
    threadId: "permission-thread",
  });
  await restarted.waitForAutomationIdle();
  const thirdAttention = restarted.queryNeedsAttention();
  assert.equal(thirdAttention.available, true);
  if (!thirdAttention.available) return;
  const thirdReason = thirdAttention.tasks[0]?.reasons[0];
  assert.equal(restarted.continuePermissionBlockedActivation({
    attentionReasonId: thirdReason!.id,
    message: "Continue once more without treating missing usage as a zero-token baseline.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "continue-after-missing-usage",
  }).accepted, true);
  const finalAttempt = await runtime.waitForRequest(4);
  runtime.setUsage(finalAttempt.attemptId, {
    inputTokens: 2_100,
    cachedInputTokens: 1_400,
    cacheWriteInputTokens: 120,
    outputTokens: 500,
    reasoningOutputTokens: 250,
  });
  await runtime.finish({
    status: "completed",
    summary: "Permission supplied.",
    threadId: "permission-thread",
  });
  const later = await runtime.waitForRequest(5);
  assert.equal(later.activationId, laterActivationId);
  await runtime.finish({ status: "completed", summary: "Later work completed." });
  await restarted.waitForAutomationIdle();
  const inspected = restarted.queryTask(taskId);
  assert.equal(inspected.available, true);
  if (inspected.available) {
    assert.equal(inspected.task.activations[0]?.attempts[0]?.outcome?.status, "permission-blocked");
    const continuedActivation = inspected.task.activations[0];
    const laterActivation = inspected.task.activations[1];
    assert.ok(continuedActivation?.conversationId);
    assert.ok(laterActivation?.conversationId);
    assert.notEqual(continuedActivation.conversationId, laterActivation.conversationId);
    const conversation = await restarted.queryAgentConversation(taskId, continuedActivation.conversationId);
    assert.equal(conversation.available, true);
    if (conversation.available) {
      assert.equal(conversation.conversation.runs.length, 4);
      assert.deepEqual(
        conversation.conversation.runs.map((run) => run.activationId),
        Array.from({ length: 4 }, () => continuedActivation.id),
      );
      assert.deepEqual(
        conversation.conversation.runs.map((run) => run.attempt.id),
        [first.attemptId, resumed.attemptId, recovered.attemptId, finalAttempt.attemptId],
      );
    }
  }
  assert.deepEqual(await restarted.queryAttemptTranscript(first.attemptId), {
    available: true,
    threadId: "permission-thread",
    items: [{ kind: "message", role: "agent", text: "Attempt 1 runtime evidence." }],
    usage: {
      inputTokens: 1_000,
      cachedInputTokens: 800,
      cacheWriteInputTokens: 50,
      outputTokens: 200,
      reasoningOutputTokens: 100,
    },
  });
  assert.deepEqual(await restarted.queryAttemptTranscript(resumed.attemptId), {
    available: true,
    threadId: "permission-thread",
    items: [{ kind: "message", role: "agent", text: "Attempt 2 runtime evidence." }],
    usage: {
      inputTokens: 600,
      cachedInputTokens: 300,
      cacheWriteInputTokens: 40,
      outputTokens: 150,
      reasoningOutputTokens: 80,
    },
  });
  assert.deepEqual(await restarted.queryAttemptTranscript(recovered.attemptId), {
    available: false,
    reason: "unavailable",
  });
  assert.deepEqual(await restarted.queryAttemptTranscript(finalAttempt.attemptId), {
    available: true,
    threadId: "permission-thread",
    items: [{ kind: "message", role: "agent", text: "Attempt 4 runtime evidence." }],
  });
});

class ControlledRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly requests: AgentRunRequest[] = [];
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();
  readonly #usage = new Map<string, AttemptTokenUsage>();
  #complete: ((outcome: AgentRunOutcome) => void) | undefined;
  #completed: Promise<void> = Promise.resolve();
  readonly #waiters: Array<{ count: number; resolve(request: AgentRunRequest): void }> = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    this.#transcripts.set(request.attemptId, [{
      kind: "message",
      role: "agent",
      text: `Attempt ${request.attempt.number} runtime evidence.`,
    }]);
    lifecycle.started(`thread-${this.requests.length}`);
    for (const waiter of this.#waiters.splice(0)) {
      const found = this.requests[waiter.count - 1];
      if (found === undefined) this.#waiters.push(waiter);
      else waiter.resolve(found);
    }
    const outcome = new Promise<AgentRunOutcome>((resolve) => { this.#complete = resolve; });
    this.#completed = outcome.then(() => undefined);
    return outcome;
  }

  async read(attemptId: string): Promise<AttemptTranscriptItem[] | null> {
    return structuredClone(this.#transcripts.get(attemptId) ?? null);
  }

  omitTranscript(attemptId: string): void {
    this.#transcripts.delete(attemptId);
  }

  setUsage(attemptId: string, usage: AttemptTokenUsage): void {
    this.#usage.set(attemptId, structuredClone(usage));
  }

  async readUsage(attemptId: string): Promise<AttemptTokenUsage | null> {
    return structuredClone(this.#usage.get(attemptId) ?? null);
  }

  complete(outcome: AgentRunOutcome): void {
    assert.ok(this.#complete);
    this.#complete(outcome);
    this.#complete = undefined;
  }

  waitForCompletion(): Promise<void> {
    return this.#completed;
  }

  async finish(outcome: AgentRunOutcome): Promise<void> {
    this.complete(outcome);
    await this.#completed;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  waitForRequest(count: number): Promise<AgentRunRequest> {
    const existing = this.requests[count - 1];
    return existing === undefined
      ? new Promise((resolve) => this.#waiters.push({ count, resolve }))
      : Promise.resolve(existing);
  }
}

async function startControlledApplication(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  runtime: ControlledRuntime,
  clock: ControlledClock,
): Promise<CoordinationApplication> {
  return CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: clock,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
    transcriptAccess: runtime,
  });
}

function createQueuedPair(application: CoordinationApplication): {
  taskId: string;
  firstActivationId: string;
  laterActivationId: string;
} {
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Recover the head activation",
    description: "Do not bypass its later queued activation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: `create-pair-${crypto.randomUUID()}`,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected task creation");
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: `move-pair-${crypto.randomUUID()}`,
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) throw new Error("Expected task movement");
  return {
    taskId: created.task.id,
    firstActivationId: moved.task.activations[0]!.id,
    laterActivationId: moved.task.activations[1]!.id,
  };
}

class ControlledClock implements AutomationClock {
  #now: Date;
  readonly #waiters: Array<{ due: number; resolve(): void }> = [];

  constructor(now: string) {
    this.#now = new Date(now);
  }

  now(): Date {
    return new Date(this.#now);
  }

  waitUntil(instant: string): Promise<void> {
    if (Date.parse(instant) <= this.#now.getTime()) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.push({ due: Date.parse(instant), resolve }));
  }

  advanceTo(instant: string): void {
    this.#now = new Date(instant);
    for (const waiter of this.#waiters.splice(0)) {
      if (waiter.due <= this.#now.getTime()) waiter.resolve();
      else this.#waiters.push(waiter);
    }
  }
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
  await execFileAsync("git", [
    "-C", repositoryPath, "-c", "user.name=Coordination Test",
    "-c", "user.email=coordination@example.invalid", "commit", "-m", "Initial commit",
  ]);
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "agent.md"), "Handle the activation.\n");
  await writeFile(definitionPath, `schemaVersion: 1
name: Recovery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve activation order.
agents:
  - id: implementer
    name: Implementer
    role: Implements work
    summary: Implements queued work.
    instructions: ./agent.md
  - id: reviewer
    name: Reviewer
    role: Reviews work
    summary: Reviews queued work.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Delivery
    guidance: Move work through delivery.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`);
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

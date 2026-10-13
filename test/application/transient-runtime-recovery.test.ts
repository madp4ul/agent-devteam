import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";
import { ControlledRetryClock } from "../support/activation-fixture.ts";
import { DatabaseSync } from "node:sqlite";
import type { AgentRunOutcome } from "../../src/application/runtime-contract.ts";
import type { RuntimeWaitingView } from "../../src/application/automation-contract.ts";

async function setup(t: test.TestContext, thread: string | null = null, cleanup = true) {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime(thread);
  const clock = new ControlledRetryClock("2027-01-01T12:00:00.000Z");
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime }, automationClock: clock, transcriptAccess: runtime };
  const app = await CoordinationApplication.start(options);
  if (cleanup) t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Recover", description: "Same activation", actor: { kind: "user", id: "paul" }, idempotencyKey: "recover" });
  assert.ok(created.accepted);
  const taskId = created.task.id;
  const waiting = (): RuntimeWaitingView => {
    const result = app.queryTask(taskId); assert.ok(result.available);
    const recovery = result.task.activations[0]!.recovery; assert.equal(recovery?.state, "waiting");
    if (recovery?.state !== "waiting") throw new Error("Expected waiting episode");
    return recovery;
  };
  async function fail(outcome: AgentRunOutcome = { status: "failed", summary: "Connection lost; reconnect attempts exhausted" }) {
    runtime.complete(outcome);
    await until(() => { const result = app.queryTask(taskId); return result.available && result.task.activations[0]?.status !== "running"; });
  }
  await app.resumeAutomation(); await runtime.waitForRequest(1);
  return { app, runtime, clock, fixture, options, taskId, waiting, fail };
}

async function until(predicate: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) { if (predicate()) return; await new Promise<void>((resolve) => setImmediate(resolve)); }
  assert.fail("Expected the application to reach the observed state");
}

test("recognized connection failures wait at least a minute without failure attention or the ordinary attempt ceiling", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const clock = new ControlledRetryClock("2027-01-01T12:00:00.000Z");
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime }, automationClock: clock, transcriptAccess: runtime });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Recover connection", description: "Resume the same activation", actor: { kind: "user", id: "paul" }, idempotencyKey: "connection" });
  assert.ok(created.accepted);
  await app.resumeAutomation();
  await runtime.waitForRequest(1);
  runtime.complete({ status: "failed", summary: "Connection lost; reconnect attempts exhausted" });
  await until(() => {
    const result = app.queryTask(created.task.id);
    return result.available && result.task.activations[0]?.status === "queued";
  });
  const result = app.queryTask(created.task.id);
  assert.ok(result.available);
  assert.equal(result.task.activations[0]?.recovery?.state, "waiting");
  assert.equal(result.task.activations[0]?.recovery && "dueAt" in result.task.activations[0].recovery ? result.task.activations[0].recovery.dueAt : undefined, "2027-01-01T12:01:00.000Z");
  const inspection = app.queryTaskInspectionForUser(created.task.id);
  assert.ok(inspection.available);
  assert.equal(inspection.task.unresolvedAttention.length, 0);
  clock.advanceTo("2027-01-01T12:00:59.000Z");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(runtime.requests.length, 1);
  app.pauseAutomation();
  await app.waitForAutomationIdle();
});

test("1,000 no-progress failures retain one episode and bounded durable history, then recover unattended", async (t) => {
  const { app, runtime, clock, fixture, taskId, waiting, fail } = await setup(t, "same-thread");
  const database = new DatabaseSync(fixture.databasePath); t.after(() => database.close());
  await fail({ status: "failed", summary: "Connection lost; reconnect attempts exhausted", threadId: "same-thread" });
  const episode = waiting().episodeId;
  const initial = JSON.stringify(app.queryUserTaskDetail(taskId)).length;
  for (let i = 1; i < 1000; i++) {
    clock.advanceTo(waiting().dueAt);
    const request = await runtime.waitForRequest(i + 1);
    assert.equal(request.activationId, runtime.requests[0]!.activationId);
    assert.equal(request.resumeThreadId, "same-thread");
    runtime.setTranscript(request.attemptId, [{ kind: "message", role: "agent", text: "" }, { kind: "diagnostic", text: "Connection lost; reconnect attempts exhausted" }]);
    await fail({ status: "failed", summary: "Connection lost; reconnect attempts exhausted", threadId: "same-thread" });
  }
  assert.equal(waiting().episodeId, episode);
  assert.equal(waiting().failureCount, 1000);
  assert.equal(waiting().retryCount, 999);
  for (const [table, expected] of [["attempts", 1], ["runtime_recovery_episodes", 1], ["activation_dispatch_claims", 0], ["conversation_history_items", 1]] as const) {
    assert.equal((database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, expected, table);
  }
  assert.equal((database.prepare("SELECT COUNT(*) AS count FROM activity_ledger WHERE type IN ('attempt.started', 'attempt.completed')").get() as { count: number }).count, 2);
  assert.ok(JSON.stringify(app.queryUserTaskDetail(taskId)).length < initial + 1000);
  const inspection = app.queryTaskInspectionForUser(taskId); assert.ok(inspection.available); assert.equal(inspection.task.unresolvedAttention.length, 0);
  const samples = database.prepare("SELECT samples_json FROM runtime_recovery_episodes").get() as { samples_json: string };
  assert.equal((JSON.parse(samples.samples_json) as unknown[]).length, 1);
  clock.advanceTo(waiting().dueAt); await runtime.waitForRequest(1001);
  runtime.complete({ status: "completed", summary: "Recovered", threadId: "same-thread" });
  app.pauseAutomation(); await app.waitForAutomationIdle();
  const result = app.queryTask(taskId); assert.ok(result.available);
  assert.equal(result.task.activations[0]?.status, "completed"); assert.equal(result.task.activations[0]?.attempts.length, 2);
  assert.equal(result.task.activations[0]?.recovery, null);
});

test("reset deadlines, changed classification, pause/resume and dismissal retain one retry episode", async (t) => {
  const { app, runtime, clock, taskId, waiting, fail } = await setup(t);
  await fail({ status: "failed", summary: "Usage limit reached", failure: { code: "usage_limit_reached", retryAt: "2027-01-01T13:00:00Z" } });
  assert.equal(waiting().dueAt, "2027-01-01T13:00:00.000Z");
  app.pauseAutomation(); await app.waitForAutomationIdle();
  clock.advanceTo("2027-01-01T13:00:00Z"); assert.equal(runtime.requests.length, 1);
  await app.resumeAutomation(); await runtime.waitForRequest(2);
  await fail({ status: "failed", summary: "Service unavailable", failure: { statusCode: 503, retryAt: "2027-01-01T13:30:00Z" } });
  assert.equal(waiting().classification, "service-unavailable"); assert.equal(waiting().dueAt, "2027-01-01T13:30:00.000Z");
  app.pauseAutomation(); await app.waitForAutomationIdle();
  await app.resumeAutomation(); // Future waiting must return immediately.
  const dismissal = app.dismissActivation({ activationId: waiting().activationId, actor: { kind: "user", id: "paul" }, idempotencyKey: "stop-wait" });
  assert.ok(dismissal.accepted);
  clock.advanceTo("2027-01-02T00:00:00Z"); app.pauseAutomation(); await app.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 2);
  const result = app.queryTask(taskId); assert.ok(result.available); assert.equal(result.task.activations[0]?.status, "dismissed");
});

test("transient retries preserve partial work and do not spend the three ordinary failures", async (t) => {
  const { app, runtime, clock, taskId, waiting, fail } = await setup(t, "partial-thread");
  await fail({ status: "failed", summary: "Connection lost", threadId: "partial-thread" });
  clock.advanceTo(waiting().dueAt); const probe = await runtime.waitForRequest(2);
  runtime.setTranscript(probe.attemptId, [{ kind: "message", role: "agent", text: "Completed useful work before the outage" }]);
  const comment = app.addTaskComment({ taskId, body: "Durable partial output", actor: { kind: "agent", id: "implementer" }, attemptId: probe.attemptId, idempotencyKey: "partial" });
  assert.ok(comment.accepted);
  await fail({ status: "failed", summary: "Connection lost", threadId: "partial-thread" });
  let requestCount = 2;
  for (let i = 0; i < 3; i++) {
    const result = app.queryTask(taskId); assert.ok(result.available);
    const recovery = result.task.activations[0]!.recovery; assert.ok(recovery && "dueAt" in recovery);
    clock.advanceTo(recovery.dueAt); await runtime.waitForRequest(++requestCount);
    await fail({ status: "failed", summary: "Unrecognized application defect" });
  }
  app.pauseAutomation(); await app.waitForAutomationIdle();
  const result = app.queryTask(taskId); assert.ok(result.available);
  assert.equal(result.task.activations[0]!.status, "failed"); assert.equal(result.task.activations[0]!.attempts.length, 5);
  assert.ok(result.task.comments.some((comment) => comment.body === "Durable partial output"));
  const inspection = app.queryTaskInspectionForUser(taskId); assert.ok(inspection.available); assert.equal(inspection.task.unresolvedAttention.length, 1);
});

test("restart retains a waiting deadline and recovers abandoned provisional probes without noisy host-stop history", async (t) => {
  const { app, runtime, clock, options, taskId, waiting, fail } = await setup(t, "restart-thread", false);
  await fail({ status: "failed", summary: "Connection lost", threadId: "restart-thread" });
  const first = waiting();
  app.close();
  let restarted = await CoordinationApplication.start(options);
  t.after(() => restarted.close());
  assert.equal(restarted.queryAutomation().state, "paused");
  let result = restarted.queryTask(taskId); assert.ok(result.available);
  assert.equal(result.task.activations[0]!.recovery?.state, "waiting");
  await restarted.resumeAutomation();
  clock.advanceTo(first.dueAt); await runtime.waitForRequest(2);
  restarted.close(); // The host stopped before this empty probe produced evidence.
  restarted = await CoordinationApplication.start(options);
  result = restarted.queryTask(taskId); assert.ok(result.available);
  const recovery = result.task.activations[0]!.recovery; assert.ok(recovery?.state === "waiting");
  assert.equal(recovery.retryCount, 1); assert.equal(recovery.failureCount, 1);
  assert.equal(recovery.dueAt, "2027-01-01T12:02:00.000Z");
  assert.equal(result.task.activations[0]!.attempts.length, 1);
  assert.equal(result.task.activity.filter((item) => item.type === "attempt.completed").length, 1);
});

test("explicit interruption publishes the probe and stops waiting before dismissal", async (t) => {
  const { app, runtime, clock, taskId, waiting, fail } = await setup(t);
  await fail(); clock.advanceTo(waiting().dueAt); await runtime.waitForRequest(2);
  assert.deepEqual(app.interruptTask({ taskId, activationId: "another-activation", actor: { kind: "user", id: "paul" }, idempotencyKey: "wrong-probe" }), { accepted: false, reason: "not-running" });
  const interruption = app.interruptTask({ taskId, actor: { kind: "user", id: "paul" }, idempotencyKey: "interrupt-probe" });
  assert.ok(interruption.accepted);
  runtime.complete({ status: "failed", summary: "Aborted" }); await interruption.confirmed;
  const result = app.queryTask(taskId); assert.ok(result.available);
  assert.equal(result.task.activations[0]!.attempts.length, 2);
  assert.equal(result.task.activations[0]!.recovery, null);
  assert.ok(app.dismissActivation({ activationId: result.task.activations[0]!.id, actor: { kind: "user", id: "paul" }, idempotencyKey: "dismiss-interrupted-probe" }).accepted);
  app.pauseAutomation(); await app.waitForAutomationIdle();
});

test("permission blocks end a waiting episode immediately without automatic retries", async (t) => {
  const { app, runtime, clock, taskId, waiting, fail } = await setup(t);
  await fail(); clock.advanceTo(waiting().dueAt); await runtime.waitForRequest(2);
  await fail({ status: "permission-blocked", summary: "User authorization needed" });
  app.pauseAutomation(); await app.waitForAutomationIdle();
  const result = app.queryTask(taskId); assert.ok(result.available);
  assert.equal(result.task.activations[0]!.recovery?.state, "permission-blocked");
  assert.equal(result.task.activations[0]!.status, "failed");
});

test("waiting releases other-task dispatch while cumulative usage checkpoints survive empty probes", async (t) => {
  const { app, runtime, clock, taskId, waiting, fail } = await setup(t, "usage-thread");
  const usage = { inputTokens: 100, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 10, reasoningOutputTokens: 0 };
  runtime.setUsage(runtime.requests[0]!.attemptId, usage);
  await fail({ status: "failed", summary: "Connection lost", threadId: "usage-thread" });
  const other = app.createTask({ boardId: "delivery", columnId: "review", title: "Other task", description: "Progress during waiting", actor: { kind: "user", id: "paul" }, idempotencyKey: "other" });
  assert.ok(other.accepted);
  const unrelated = await runtime.waitForRequest(2); assert.equal(unrelated.task.id, other.task.id);
  runtime.complete({ status: "completed", summary: "Other task completed", threadId: "usage-thread" });
  await until(() => { const result = app.queryTask(other.task.id); return result.available && result.task.activations[0]?.status === "completed"; });
  clock.advanceTo(waiting().dueAt); const empty = await runtime.waitForRequest(3);
  runtime.setUsage(empty.attemptId, usage);
  await fail({ status: "failed", summary: "Connection lost", threadId: "usage-thread" });
  let result = app.queryTask(taskId); assert.ok(result.available); assert.equal(result.task.activations[0]!.attempts.length, 1);
  clock.advanceTo(waiting().dueAt); const meaningful = await runtime.waitForRequest(4);
  runtime.setUsage(meaningful.attemptId, { ...usage, inputTokens: 120, outputTokens: 15 });
  await fail({ status: "failed", summary: "Connection lost", threadId: "usage-thread" });
  app.pauseAutomation(); await app.waitForAutomationIdle();
  result = app.queryTask(taskId); assert.ok(result.available); assert.equal(result.task.activations[0]!.attempts.length, 2);
  const transcript = await app.queryAttemptTranscript(meaningful.attemptId);
  assert.ok(transcript.available); assert.equal(transcript.usage?.inputTokens, 20); assert.equal(transcript.usage?.outputTokens, 5);
});

test("diagnostic recognition stays conservative for unknown, authentication, permission and billing failures", async (t) => {
  for (const [summary, evidence, expected] of [
    ["Reconnect attempts exhausted", undefined, "connection-lost"],
    ["Temporary service unavailable", undefined, "service-unavailable"],
    ["You've hit your message usage limit", undefined, "budget-exhausted"],
    ["Billing: message budget exhausted", { code: "usage_limit_reached" }, undefined],
    ["Budget rejected", { code: "invalid_api_key", statusCode: 401 }, undefined],
    ["Permission denied", { code: "usage_limit_reached" }, undefined],
    ["Unknown defect", { statusCode: 429 }, undefined],
  ] as const) {
    const { app, taskId, fail } = await setup(t);
    await fail({ status: "failed", summary, ...(evidence === undefined ? {} : { failure: evidence }) });
    app.pauseAutomation(); await app.waitForAutomationIdle();
    const result = app.queryTask(taskId); assert.ok(result.available);
    const recovery = result.task.activations[0]!.recovery;
    assert.equal(recovery?.state, expected === undefined ? "scheduled" : "waiting", summary);
    if (recovery?.state === "waiting") assert.equal(recovery.classification, expected);
  }
});

test("accepted coordination writes publish probes even without streamed output, while rejected writes stay provisional", async (t) => {
  const { app, runtime, clock, taskId, waiting, fail } = await setup(t);
  await fail(); clock.advanceTo(waiting().dueAt); const probe = await runtime.waitForRequest(2);
  assert.equal(app.addTaskComment({ taskId, body: " ", actor: { kind: "agent", id: "implementer" }, attemptId: probe.attemptId, idempotencyKey: "rejected-probe-comment" }).accepted, false);
  let result = app.queryTask(taskId); assert.ok(result.available); assert.equal(result.task.activations[0]!.attempts.length, 1);
  assert.ok(app.addTaskComment({ taskId, body: "Retain this effect", actor: { kind: "agent", id: "implementer" }, attemptId: probe.attemptId, idempotencyKey: "accepted-probe-comment" }).accepted);
  await fail(); app.pauseAutomation(); await app.waitForAutomationIdle();
  result = app.queryTask(taskId); assert.ok(result.available); assert.equal(result.task.activations[0]!.attempts.length, 2);
  assert.equal(result.task.comments.find((comment) => comment.body === "Retain this effect")?.attemptId, probe.attemptId);
});

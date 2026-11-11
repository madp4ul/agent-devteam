import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AgentRunLifecycle, AgentRunOutcome } from "../../src/application/runtime-contract.ts";
import { createHandoffFixture } from "../support/handoff-fixture.ts";
import { ControlledAgentRuntime } from "../support/handoff-fixture.ts";
import { ControlledRetryClock } from "../support/activation-fixture.ts";

for (const interruptFirst of [false, true]) test(`Stop retries finalizes on the host${interruptFirst ? " after an existing interruption" : " before interruption"}`, async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime("same-thread");
  const clock = new ControlledRetryClock("2027-01-01T12:00:00Z");
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime }, automationClock: clock });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Stop budget retries", description: "Retain conversation", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  await app.resumeAutomation(); const first = await runtime.waitForRequest(1);
  runtime.complete({ status: "failed", summary: "Usage limit reached", threadId: "same-thread" });
  app.pauseAutomation(); await app.waitForAutomationIdle();
  clock.advanceTo("2027-01-01T12:01:00Z"); await app.resumeAutomation(); await runtime.waitForRequest(2);
  app.pauseAutomation();
  const command = { taskId: created.task.id, activationId: first.activationId, actor: { kind: "user" as const, id: "paul" }, idempotencyKey: "stop" };
  if (interruptFirst) assert.ok(app.interruptTask({ ...command, idempotencyKey: "interrupt" }).accepted);
  assert.deepEqual(app.stopActivation({ ...command, activationId: "wrong" }), { accepted: false, reason: "not-stoppable" });
  assert.deepEqual(app.stopActivation(command), { accepted: true, state: "stopping" });
  assert.deepEqual(app.stopActivation({ ...command, idempotencyKey: "repeat" }), { accepted: true, state: "stopping" });
  const detail = app.queryUserTaskDetail(created.task.id); assert.ok(detail.available);
  assert.equal(detail.activeRun?.stopRequested, true); // A new browser load receives host-owned intent.
  assert.ok(app.interruptTask({ ...command, idempotencyKey: "interrupt-again" }).accepted);
  runtime.complete({ status: "failed", summary: "Aborted", threadId: "same-thread" });
  await app.waitForAutomationIdle();
  assert.deepEqual(app.stopActivation(command), { accepted: true, state: "stopped" });
  const task = app.queryTask(created.task.id); assert.ok(task.available);
  assert.equal(task.task.activations[0]?.status, "dismissed");
  assert.equal(task.task.activations[0]?.attempts.at(-1)?.threadId, "same-thread");
  const inspection = app.queryTaskInspectionForUser(created.task.id); assert.ok(inspection.available);
  assert.equal(inspection.task.automationSuspended, false);
  assert.equal(app.queryAutomation().state, "paused");
});

test("blocked termination is visible, retryable, and makes shutdown report its blocker", async (t) => {
  const fixture = await createHandoffFixture();
  const outcome = Promise.withResolvers<AgentRunOutcome>();
  let lifecycle!: AgentRunLifecycle;
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: { run: async (_request, events) => { lifecycle = events; events.started("retained-thread"); return outcome.promise; } } } });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Recover cleanup", description: "Retain conversation", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  await app.resumeAutomation();
  const active = app.queryActiveRuns()[0]!;
  let retries = 0;
  const shutdownPending = app.prepareShutdown();
  lifecycle.terminationChanged?.({ state: "blocked", diagnostic: "Inspection unavailable", retryAvailable: true }, () => { retries++; });
  assert.equal(app.queryActiveRuns()[0]?.status, "termination-blocked");
  assert.equal(app.queryActiveRuns()[0]?.termination?.diagnostic, "Inspection unavailable");
  const shutdown = await shutdownPending;
  assert.equal(shutdown.ready, false);
  assert.equal(app.queryAutomation().state, "pausing");
  assert.equal(app.retryTaskTermination(created.task.id, "wrong-attempt").accepted, false);
  assert.equal(app.retryTaskTermination(created.task.id, active.attemptId).accepted, true);
  assert.equal(retries, 1);
  outcome.resolve({ status: "failed", summary: "Usage limit reached", threadId: "retained-thread" });
  await app.waitForAutomationIdle();
  assert.deepEqual(app.queryActiveRuns(), []);
  assert.equal(app.queryAutomation().state, "paused");
  assert.deepEqual(await app.prepareShutdown(), { ready: true });
  const task = app.queryTask(created.task.id); assert.ok(task.available);
  assert.equal(task.task.activations[0]?.attempts[0]?.threadId, "retained-thread");
});

test("a rejected stale stop does not poison stopping a later attempt of the same activation", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime("retained-thread");
  const clock = new ControlledRetryClock("2027-01-01T12:00:00Z");
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime }, automationClock: clock });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Rejected stale stop", description: "Retry remains stoppable", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  await app.resumeAutomation(); const first = await runtime.waitForRequest(1);
  app.pauseAutomation(); runtime.complete({ status: "failed", summary: "Ordinary failure", threadId: "retained-thread" });
  await app.waitForAutomationIdle();
  const command = { taskId: created.task.id, activationId: first.activationId, actor: { kind: "user" as const, id: "paul" }, idempotencyKey: "stale-stop" };
  assert.deepEqual(app.stopActivation(command), { accepted: false, reason: "not-stoppable" });
  clock.advanceTo("2027-01-01T12:01:00Z"); await app.resumeAutomation(); await runtime.waitForRequest(2);
  app.pauseAutomation();
  assert.deepEqual(app.stopActivation({ ...command, idempotencyKey: "new-stop" }), { accepted: true, state: "stopping" });
  runtime.complete({ status: "failed", summary: "Aborted", threadId: "retained-thread" });
  await app.waitForAutomationIdle();
  const result = app.queryTask(created.task.id); assert.ok(result.available);
  assert.equal(result.task.activations[0]?.status, "dismissed");
});

import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { composeActivationPrompt } from "../../src/application/activation-prompt.ts";
import { CompletingAgentRuntime, ControlledAgentRuntime, ControlledRetryClock,
  createActivationFixture } from "../support/activation-fixture.ts";

test("grace expiry wakes another task while an unrelated attempt remains running", async (t) => {
  const fixture = await createActivationFixture("stall-concurrent-grace");
  const clock = new ControlledRetryClock("2026-10-04T00:00:00.000Z");
  const longRunning = new ControlledAgentRuntime();
  const completing = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, automationClock: clock,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: { run: (request, lifecycle) => request.task.title === "Long running"
        ? longRunning.run(request, lifecycle) : completing.run(request, lifecycle) } } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  application.createTask({ boardId: "delivery", columnId: "implementation", title: "Long running",
    description: "Keep this attempt open", actor, idempotencyKey: "long-task" });
  const waiting = application.createTask({ boardId: "delivery", columnId: "implementation", title: "User preparation",
    description: "Resume after attention", actor, idempotencyKey: "waiting-task" });
  assert.ok(waiting.accepted);
  application.addTaskComment({ taskId: waiting.task.id, body: "@user Please prepare this task.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "prepare-task" });
  await application.resumeAutomation();
  await longRunning.waitForRequest(1);
  while (completing.requests.length === 0) await delay(10);
  const inspection = application.queryTaskInspection(waiting.task.id);
  assert.ok(inspection.available);
  assert.ok(application.markUserMentionAddressed({ attentionReasonId: inspection.task.unresolvedAttention[0]!.id,
    actor, idempotencyKey: "prepared-task" }).accepted);
  await delay(20);
  clock.advanceTo("2026-10-04T00:01:00.000Z");
  while (completing.requests.length < 4) await delay(10);
  assert.deepEqual(completing.requests.map(({ reason }) => reason.type),
    ["column-entry", "stall-recovery", "stall-recovery", "stall-recovery"]);
  assert.equal(longRunning.requests.length, 1);
  application.pauseAutomation();
  longRunning.complete({ status: "completed", summary: "Long attempt settled" });
  await application.waitForAutomationIdle();
});

test("watched work gets three attributable recoveries then addressable framework attention", async (t) => {
  const fixture = await createActivationFixture("stall-budget");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Keep work moving", description: "Recover missing continuation", actor: { kind: "user", id: "paul" },
    idempotencyKey: "stall-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type),
    ["column-entry", "stall-recovery", "stall-recovery", "stall-recovery"]);
  const prompt = composeActivationPrompt(runtime.requests[3]!);
  assert.match(prompt, /Stall recovery.*3 of 3/);
  assert.match(prompt, /final automatic recovery/);
  const inspected = application.queryTaskInspection(created.task.id);
  assert.ok(inspected.available);
  assert.equal(inspected.task.unresolvedAttention[0]?.type, "stall-recovery-exhausted");
  assert.ok(inspected.task.unresolvedAttention[0]?.sourceEventId);
  assert.deepEqual(application.queryNotificationOccurrences(0).occurrences.map(({ type }) => type),
    ["stall-recovery-exhausted"]);
});

test("retained satisfied waits recover, reopening resets, and user handoff cancels grace recovery", async (t) => {
  const fixture = await createActivationFixture("stall-reopen-user-handoff");
  const clock = new ControlledRetryClock("2026-10-04T00:00:00.000Z");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, automationClock: clock,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const source = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Retained wait",
    description: "Recover only without a current promise", actor, idempotencyKey: "reopen-source" });
  const target = application.createTask({ boardId: "delivery", columnId: "backlog", title: "Prepared input",
    description: "User preparation", actor, idempotencyKey: "reopen-target" });
  assert.ok(source.accepted && target.accepted);
  assert.ok(application.moveTask({ taskId: target.task.id, destinationColumnId: "completion",
    expectedRevision: 1, actor, idempotencyKey: "prepared-input" }).accepted);
  const linked = application.createTaskRelationship({ type: "dependency", sourceTaskId: source.task.id,
    targetTaskId: target.task.id, resumeAgentId: "implementer", actor, idempotencyKey: "retained-wait" });
  assert.ok(linked.accepted);
  await application.resumeAutomation();
  runtime.complete({ status: "completed", summary: "Initial work finished" });
  await runtime.waitForRequest(2);
  runtime.complete({ status: "completed", summary: "First recovery finished" });
  const second = await runtime.waitForRequest(3);
  assert.equal("details" in second.sourceEvent && second.sourceEvent.details.recoveryNumber, "2");
  assert.ok(application.moveTask({ taskId: target.task.id, destinationColumnId: "backlog",
    expectedRevision: 2, actor, idempotencyKey: "reopen-input" }).accepted);
  runtime.complete({ status: "completed", summary: "Waiting again" });
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 3);
  assert.ok(application.removeTaskRelationship({ taskId: source.task.id, relationshipId: linked.relationship.id,
    actor, idempotencyKey: "remove-reopened-wait" }).accepted);
  const fresh = await runtime.waitForRequest(4);
  assert.equal("details" in fresh.sourceEvent && fresh.sourceEvent.details.recoveryNumber, "1");
  assert.ok(application.addTaskComment({ taskId: source.task.id, body: "@user Please prepare the input externally.",
    actor: { kind: "agent", id: "implementer" }, attemptId: fresh.attemptId,
    idempotencyKey: "request-input" }).accepted);
  runtime.complete({ status: "completed", summary: "User owns preparation" });
  await application.waitForAutomationIdle();
  const attention = application.queryTaskInspection(source.task.id);
  assert.ok(attention.available);
  assert.ok(application.markUserMentionAddressed({ attentionReasonId: attention.task.unresolvedAttention[0]!.id,
    actor, idempotencyKey: "address-input" }).accepted);
  assert.ok(application.moveTask({ taskId: source.task.id, destinationColumnId: "backlog",
    expectedRevision: 1, actor, idempotencyKey: "user-owned-input" }).accepted);
  clock.advanceTo("2026-10-04T00:01:00.000Z");
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 4);
  assert.ok(application.moveTask({ taskId: source.task.id, destinationColumnId: "implementation",
    expectedRevision: 2, actor, idempotencyKey: "return-prepared-input" }).accepted);
  assert.equal((await runtime.waitForRequest(5)).reason.type, "column-entry");
  runtime.complete({ status: "completed", summary: "Prepared input processed" });
  const afterHandoff = await runtime.waitForRequest(6);
  assert.equal("details" in afterHandoff.sourceEvent && afterHandoff.sourceEvent.details.recoveryNumber, "1");
  assert.ok(application.moveTask({ taskId: source.task.id, destinationColumnId: "completion",
    expectedRevision: 3, actor, idempotencyKey: "complete-prepared-input" }).accepted);
  runtime.complete({ status: "completed", summary: "Completed" });
  await application.waitForAutomationIdle();
});

test("competing coordinators cannot duplicate recovery slots or exhaustion attention", async (t) => {
  const fixture = await createActivationFixture("stall-competing-coordinators");
  const runtime = new CompletingAgentRuntime();
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } };
  const first = await CoordinationApplication.start(options);
  const second = await CoordinationApplication.start(options);
  t.after(() => { first.close(); second.close(); });
  const created = first.createTask({ boardId: "delivery", columnId: "implementation", title: "Shared recovery",
    description: "One durable budget", actor: { kind: "user", id: "paul" }, idempotencyKey: "shared-task" });
  assert.ok(created.accepted);
  await Promise.all([first.resumeAutomation(), second.resumeAutomation()]);
  await Promise.all([first.waitForAutomationIdle(), second.waitForAutomationIdle()]);
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type),
    ["column-entry", "stall-recovery", "stall-recovery", "stall-recovery"]);
  const task = second.queryTaskInspection(created.task.id);
  assert.ok(task.available);
  assert.equal(task.task.unresolvedAttention.length, 1);
  assert.equal(task.task.unresolvedAttention[0]?.type, "stall-recovery-exhausted");
});

test("addressing exhaustion grants sixty seconds then starts a fresh recovery budget without another command", async (t) => {
  const fixture = await createActivationFixture("stall-grace");
  const clock = new ControlledRetryClock("2026-10-04T00:00:00.000Z");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, automationClock: clock,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "User intervention", description: "Acknowledge before arranging continuation", actor: { kind: "user", id: "paul" },
    idempotencyKey: "grace-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const inspection = application.queryTaskInspection(created.task.id);
  assert.ok(inspection.available);
  const reason = inspection.task.unresolvedAttention[0]!;
  assert.ok(application.markUserMentionAddressed({ attentionReasonId: reason.id,
    actor: { kind: "user", id: "paul" }, idempotencyKey: "address-exhaustion" }).accepted);
  await delay(20);
  clock.advanceTo("2026-10-04T00:00:59.000Z");
  await delay(20);
  assert.equal(runtime.requests.length, 4);
  clock.advanceTo("2026-10-04T00:01:00.000Z");
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 7);
  const fresh = runtime.requests[4]!;
  assert.equal("details" in fresh.sourceEvent && fresh.sourceEvent.details.recoveryNumber, "1");
});

test("waiting promises suppress recovery while normal work remains runnable", async (t) => {
  const fixture = await createActivationFixture("stall-waiting");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const parent = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Parent", description: "Await child", actor, idempotencyKey: "waiting-parent" });
  assert.ok(parent.accepted);
  const child = application.createChildTask({ parentTaskId: parent.task.id, boardId: "delivery", columnId: "backlog",
    title: "Child", description: "User preparation", resumeAgentId: "implementer", actor, idempotencyKey: "waiting-child" });
  assert.ok(child.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type), ["column-entry"]);
  application.addTaskComment({ taskId: parent.task.id, body: "@implementer Please reassess while waiting.",
    actor, idempotencyKey: "normal-while-waiting" });
  await application.waitForAutomationIdle();
  assert.deepEqual(runtime.requests.map(({ reason }) => reason.type), ["column-entry", "agent-mention"]);
  const task = application.queryTask(parent.task.id);
  assert.ok(task.available);
  assert.ok(application.removeTaskRelationship({ taskId: parent.task.id,
    relationshipId: task.task.relationships[0]!.id, actor, idempotencyKey: "remove-wait" }).accepted);
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests[2]?.reason.type, "stall-recovery");
  assert.equal("details" in runtime.requests[2]!.sourceEvent && runtime.requests[2]!.sourceEvent.details.recoveryNumber, "1");
});

test("prose changes preserve budget while ordinary mentions reset it during recovery", async (t) => {
  const fixture = await createActivationFixture("stall-resets");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Reset evidence", description: "Continuation matters", actor, idempotencyKey: "reset-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  runtime.complete({ status: "completed", summary: "No handoff" });
  const first = await runtime.waitForRequest(2);
  application.addTaskComment({ taskId: created.task.id, body: "More description without continuation.", actor,
    idempotencyKey: "prose-only" });
  runtime.complete({ status: "completed", summary: "Still idle" });
  const second = await runtime.waitForRequest(3);
  assert.equal("details" in first.sourceEvent && first.sourceEvent.details.recoveryNumber, "1");
  assert.equal("details" in second.sourceEvent && second.sourceEvent.details.recoveryNumber, "2");
  application.addTaskComment({ taskId: created.task.id, body: "@implementer Continue this work.", actor,
    idempotencyKey: "reset-mention" });
  runtime.complete({ status: "completed", summary: "Handed off" });
  assert.equal((await runtime.waitForRequest(4)).reason.type, "agent-mention");
  runtime.complete({ status: "completed", summary: "Regular work finished" });
  const fresh = await runtime.waitForRequest(5);
  assert.equal("details" in fresh.sourceEvent && fresh.sourceEvent.details.recoveryNumber, "1");
  const child = application.createChildTask({ parentTaskId: created.task.id, boardId: "delivery", columnId: "backlog",
    title: "Explicit wait", description: "User preparation", resumeAgentId: "implementer", actor,
    idempotencyKey: "reset-child" });
  assert.ok(child.accepted);
  runtime.complete({ status: "completed", summary: "Waiting established" });
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 5);
});

test("restart and pause retain budget and the original grace deadline", async (t) => {
  const fixture = await createActivationFixture("stall-restart");
  const clock = new ControlledRetryClock("2026-10-04T00:00:00.000Z");
  const controlled = new ControlledAgentRuntime();
  const start = (runtime: CompletingAgentRuntime | ControlledAgentRuntime) => CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath, automationClock: clock,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  let application = await start(controlled);
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Retained recovery", description: "Do not renew budget", actor, idempotencyKey: "restart-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  controlled.complete({ status: "completed", summary: "Idle" });
  await controlled.waitForRequest(2);
  application.pauseAutomation();
  controlled.complete({ status: "completed", summary: "First recovery finished" });
  await application.waitForAutomationIdle();
  application.close();
  const completing = new CompletingAgentRuntime();
  application = await start(completing);
  assert.equal(application.queryAutomation().state, "paused");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(completing.requests.map(({ sourceEvent }) => "details" in sourceEvent && sourceEvent.details.recoveryNumber), ["2", "3"]);
  application.pauseAutomation();
  const inspection = application.queryTaskInspection(created.task.id);
  assert.ok(inspection.available);
  assert.ok(application.markUserMentionAddressed({ attentionReasonId: inspection.task.unresolvedAttention[0]!.id,
    actor, idempotencyKey: "restart-address" }).accepted);
  application.close();
  clock.advanceTo("2026-10-04T00:00:30.000Z");
  const resumed = new CompletingAgentRuntime();
  application = await start(resumed);
  const resume = application.resumeAutomation();
  await delay(20);
  assert.equal(resumed.requests.length, 0);
  clock.advanceTo("2026-10-04T00:01:00.000Z");
  await resume;
  await application.waitForAutomationIdle();
  assert.equal(resumed.requests.length, 3);
});

test("technical retries repeat one recovery slot and an interruption holds its count", async (t) => {
  const fixture = await createActivationFixture("stall-retry-interrupt");
  const clock = new ControlledRetryClock("2026-10-04T00:00:00.000Z");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, automationClock: clock,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Operational holds", description: "Retry and interruption", actor, idempotencyKey: "holds-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  runtime.complete({ status: "completed", summary: "Idle" });
  const firstRecovery = await runtime.waitForRequest(2);
  runtime.complete({ status: "failed", summary: "Transient transport failure" });
  await delay(20);
  clock.advanceTo("2026-10-04T00:00:05.000Z");
  const retry = await runtime.waitForRequest(3);
  assert.equal(retry.activationId, firstRecovery.activationId);
  assert.equal(retry.attempt.number, 2);
  const interrupted = application.interruptTask({ taskId: created.task.id, actor, idempotencyKey: "hold-interrupt" });
  assert.ok(interrupted.accepted);
  runtime.complete({ status: "completed", summary: "Stopped by user" });
  await interrupted.confirmed;
  await application.waitForAutomationIdle();
  const inspection = application.queryTaskInspection(created.task.id);
  assert.ok(inspection.available);
  assert.equal(inspection.task.unresolvedAttention[0]?.type, "automation-suspended");
  assert.equal(runtime.requests.length, 3);
  assert.ok(application.dismissActivation({ activationId: firstRecovery.activationId, actor,
    idempotencyKey: "hold-dismiss" }).accepted);
  await delay(20);
  clock.advanceTo("2026-10-04T00:01:04.000Z");
  await delay(20);
  assert.equal(runtime.requests.length, 3);
  clock.advanceTo("2026-10-04T00:01:05.000Z");
  const next = await runtime.waitForRequest(4);
  assert.equal("details" in next.sourceEvent && next.sourceEvent.details.recoveryNumber, "2");
  const current = application.queryTask(created.task.id);
  assert.ok(current.available);
  application.moveTask({ taskId: created.task.id, destinationColumnId: "backlog",
    expectedRevision: current.task.revision, actor, idempotencyKey: "holds-user-owned" });
  runtime.complete({ status: "completed", summary: "User owns next work" });
  await application.waitForAutomationIdle();
});

test("a dispatched recovery keeps its technical retry ahead of a later ordinary handoff", async (t) => {
  const fixture = await createActivationFixture("stall-retry-before-handoff");
  const clock = new ControlledRetryClock("2026-10-04T00:00:00.000Z");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, automationClock: clock,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Retry before handoff",
    description: "Preserve started work and its queue position", actor, idempotencyKey: "retry-handoff-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  runtime.complete({ status: "completed", summary: "Initial work finished" });
  const recovery = await runtime.waitForRequest(2);
  runtime.complete({ status: "failed", summary: "Temporary transport failure" });
  await delay(20);
  assert.ok(application.addTaskComment({ taskId: created.task.id, body: "@implementer Follow this regular request next.",
    actor, idempotencyKey: "later-handoff" }).accepted);
  clock.advanceTo("2026-10-04T00:00:05.000Z");
  const retry = await runtime.waitForRequest(3);
  assert.equal(retry.activationId, recovery.activationId);
  assert.equal(retry.attempt.number, 2);
  runtime.complete({ status: "completed", summary: "Retry finished" });
  assert.equal((await runtime.waitForRequest(4)).reason.type, "agent-mention");
  runtime.complete({ status: "completed", summary: "Handoff handled" });
  const fresh = await runtime.waitForRequest(5);
  assert.equal("details" in fresh.sourceEvent && fresh.sourceEvent.details.recoveryNumber, "1");
  assert.ok(application.moveTask({ taskId: created.task.id, destinationColumnId: "completion",
    expectedRevision: 1, actor, idempotencyKey: "complete-handoff" }).accepted);
  runtime.complete({ status: "completed", summary: "Completed" });
  await application.waitForAutomationIdle();
});

test("a regular request arriving during workspace preparation supersedes recovery before dispatch", async (t) => {
  const fixture = await createActivationFixture("stall-dispatch-recheck");
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => application.close());
  const actor = { kind: "user", id: "paul" } as const;
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Superseded recovery", description: "Recheck after asynchronous preparation", actor,
    idempotencyKey: "recheck-task" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  application.pauseAutomation();
  runtime.complete({ status: "completed", summary: "No continuation" });
  await application.waitForAutomationIdle();
  const resume = application.resumeAutomation();
  application.addTaskComment({ taskId: created.task.id, body: "@implementer Here is the next request.",
    actor, idempotencyKey: "recheck-ordinary" });
  await resume;
  const ordinary = await runtime.waitForRequest(2);
  assert.equal(ordinary.reason.type, "agent-mention");
  const current = application.queryTask(created.task.id);
  assert.ok(current.available);
  const skipped = current.task.activations.find(({ reason }) => reason.type === "stall-recovery");
  assert.ok(skipped);
  assert.equal(skipped.attempts.length, 0);
  assert.ok(current.task.activity.some(({ type }) => type === "stall.recovery-skipped"));
  application.moveTask({ taskId: created.task.id, destinationColumnId: "backlog",
    expectedRevision: current.task.revision, actor, idempotencyKey: "recheck-user-owned" });
  runtime.complete({ status: "completed", summary: "Resolved regular request" });
  await application.waitForAutomationIdle();
});

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

test("entering a watched column records one activation with immutable source provenance", async (t) => {
  const fixture = await createActivationFixture("watched-entry");
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
  const fixture = await createActivationFixture("watched-move");
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

test("a running mentioned agent can claim its watched column without a second activation", async (t) => {
  const { application, runtime, created, mentioned, request } =
    await startMentionedAgentMoveScenario("mentioned-agent-claim");
  t.after(() => application.close());
  assert.equal(request.reason.type, "agent-mention");
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: mentioned.task.revision,
    actor: { kind: "agent", id: request.agent.id },
    attemptId: request.attemptId,
    idempotencyKey: "mentioned-agent-claims-column",
  });

  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  assert.deepEqual(moved.transition, {
    taskId: created.task.id,
    fromColumnId: "backlog",
    toColumnId: "implementation",
  });
  assert.equal(moved.task.revision, 2);
  assert.deepEqual(
    moved.task.activations.map((activation) => ({
      id: activation.id,
      targetAgentId: activation.targetAgentId,
      status: activation.status,
      reason: activation.reason,
    })),
    [{
      id: request.activationId,
      targetAgentId: "implementer",
      status: "running",
      reason: mentioned.task.activations[0]?.reason,
    }],
  );
  assert.deepEqual(
    moved.task.activity.map((event) => event.type),
    ["task.created", "activation.created", "attempt.started", "task.moved"],
  );
  assert.equal(moved.task.activity.at(-1)?.details.attemptId, request.attemptId);

  runtime.complete({ status: "completed", summary: "Claimed and completed the work." });
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
  const completed = application.queryTask(created.task.id);
  assert.equal(completed.available, true);
  if (completed.available) assert.equal(completed.task.activations[0]?.status, "completed");
});

test("a failed mentioned-agent claim retries the same activation under the normal lifecycle", async (t) => {
  const clock = new ControlledRetryClock("2026-08-11T10:00:00.000Z");
  const { application, runtime, created, mentioned, request: firstRequest } =
    await startMentionedAgentMoveScenario("mentioned-agent-claim-retry", { clock });
  t.after(() => application.close());
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: mentioned.task.revision,
    actor: { kind: "agent", id: firstRequest.agent.id },
    attemptId: firstRequest.attemptId,
    idempotencyKey: "claim-before-retry",
  });
  assert.equal(moved.accepted, true);
  runtime.complete({ status: "failed", summary: "Transient failure after the claim." });

  let waiting = application.queryTask(created.task.id);
  for (let index = 0; index < 100 && (
    !waiting.available || waiting.task.activations[0]?.recovery?.state !== "scheduled"
  ); index += 1) {
    await delay(10);
    waiting = application.queryTask(created.task.id);
  }
  assert.equal(waiting.available, true);
  if (!waiting.available) return;
  assert.equal(waiting.task.columnId, "implementation");
  assert.equal(waiting.task.activations.length, 1);
  assert.equal(waiting.task.activations[0]?.id, firstRequest.activationId);
  assert.deepEqual(waiting.task.activations[0]?.reason, firstRequest.reason);
  assert.equal(waiting.task.activations[0]?.recovery?.state, "scheduled");

  clock.advanceTo("2026-08-11T10:00:05.000Z");
  const retryRequest = await runtime.waitForRequest(2);
  assert.equal(retryRequest.activationId, firstRequest.activationId);
  assert.equal(retryRequest.reason.type, "agent-mention");
  assert.equal(retryRequest.attempt.number, 2);
  assert.equal(retryRequest.task.columnId, "implementation");
  runtime.complete({ status: "completed", summary: "Completed the claimed responsibility." });
  await application.waitForAutomationIdle();

  const completed = application.queryTask(created.task.id);
  assert.equal(completed.available, true);
  if (completed.available) {
    assert.equal(completed.task.activations.length, 1);
    assert.equal(completed.task.activations[0]?.status, "completed");
    assert.equal(completed.task.activations[0]?.attempts.length, 2);
  }
});

test("a same-agent column-entry run moving to another watched column still queues that entry", async (t) => {
  const fixture = await createResponsibilityActivationFixture("column-entry-counterexample");
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
    title: "Keep consecutive responsibilities distinct",
    description: "A normal column entry does not absorb a later same-agent column entry.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-consecutive-responsibilities",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  assert.equal(request.reason.type, "column-entry");
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "verification",
    expectedRevision: created.task.revision,
    actor: { kind: "agent", id: request.agent.id },
    attemptId: request.attemptId,
    idempotencyKey: "enter-next-same-agent-column",
  });

  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  assert.deepEqual(
    moved.task.activations.map((activation) => ({
      targetAgentId: activation.targetAgentId,
      status: activation.status,
      reasonType: activation.reason.type,
    })),
    [
      { targetAgentId: "implementer", status: "running", reasonType: "column-entry" },
      { targetAgentId: "implementer", status: "queued", reasonType: "column-entry" },
    ],
  );

  runtime.complete({ status: "completed", summary: "First responsibility complete." });
  const nextRequest = await runtime.waitForRequest(2);
  assert.equal(nextRequest.reason.type, "column-entry");
  runtime.complete({ status: "completed", summary: "Second responsibility complete." });
  await application.waitForAutomationIdle();
});

test("a mentioned agent moving into another agent's watched column still hands off", async (t) => {
  const { application, runtime, created, mentioned, request } =
    await startMentionedAgentMoveScenario("different-agent-counterexample", { multipleAgents: true });
  t.after(() => application.close());
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: mentioned.task.revision,
    actor: { kind: "agent", id: request.agent.id },
    attemptId: request.attemptId,
    idempotencyKey: "mentioned-agent-hands-off",
  });

  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  assert.deepEqual(
    moved.task.activations.map((activation) => ({
      targetAgentId: activation.targetAgentId,
      status: activation.status,
      reasonType: activation.reason.type,
    })),
    [
      { targetAgentId: "implementer", status: "running", reasonType: "agent-mention" },
      { targetAgentId: "reviewer", status: "queued", reasonType: "column-entry" },
    ],
  );

  runtime.complete({ status: "completed", summary: "Routed to review." });
  const reviewerRequest = await runtime.waitForRequest(2);
  assert.equal(reviewerRequest.agent.id, "reviewer");
  runtime.complete({ status: "completed", summary: "Reviewed the routed work." });
  await application.waitForAutomationIdle();
});

test("tasks start in workflow columns and enter Completion only by moving", async (t) => {
  const fixture = await createActivationFixture("inert-entry");
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
  const rejectedCompletionTask = application.createTask({
    boardId: "delivery",
    columnId: "completion",
    title: "Already complete",
    description: "Completion never has a watcher.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-in-completion",
  });
  assert.deepEqual(rejectedCompletionTask, {
    accepted: false,
    reason: "completion-is-not-starting-column",
  });
  assert.equal(backlogTask.accepted, true);
  if (!backlogTask.accepted) return;
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
  assert.equal(moved.task.columnId, "completion");
});

test("moving to the current column is rejected without creating an entry activation", async (t) => {
  const fixture = await createActivationFixture("same-column-move");
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

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

test("a process with watched columns cannot resume without a configured runtime", async (t) => {
  const fixture = await createActivationFixture("missing-runtime");
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

test("retry attempts retain the activation's snapshotted execution profile", async (t) => {
  const fixture = await createActivationFixture(
    "profiled-retry",
    "main",
    "    model: gpt-5.6-sol\n    reasoningEffort: medium\n",
  );
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
    title: "Retry with the requested profile",
    description: "A later attempt must not silently change model selection.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-profiled-retry",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  runtime.complete({ status: "failed", summary: "Transient runtime failure." });
  const retry = await runtime.waitForRequest(2);
  assert.equal(retry.activationId, first.activationId);
  assert.equal(retry.attempt.number, 2);
  assert.deepEqual(
    { model: retry.agent.model, reasoningEffort: retry.agent.reasoningEffort },
    { model: "gpt-5.6-sol", reasoningEffort: "medium" },
  );
  runtime.complete({ status: "completed", summary: "Retry completed." });
  await application.waitForAutomationIdle();

  const inspected = application.queryTask(created.task.id);
  assert.equal(inspected.available, true);
  if (inspected.available) {
    assert.deepEqual(
      inspected.task.activations[0]?.attempts.map(({ model, reasoningEffort }) => ({
        model,
        reasoningEffort,
      })),
      [
        { model: "gpt-5.6-sol", reasoningEffort: "medium" },
        { model: "gpt-5.6-sol", reasoningEffort: "medium" },
      ],
    );
  }
});

test("entering a watched column wakes automation that is already running", async (t) => {
  const fixture = await createActivationFixture("running-entry");
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

test("different tasks run concurrently while each task preserves activation order", async (t) => {
  const fixture = await createActivationFixture("task-run-concurrency");
  const runtime = new ConcurrentAgentRuntime();
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
    title: "Serialize my activations",
    description: "Only one activation for this task may run at a time.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-serialized-task",
  });
  const second = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Run independently",
    description: "This task should not wait for another task's active run.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-concurrent-task",
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;
  const firstBacklog = application.moveTask({
    taskId: first.task.id,
    destinationColumnId: "backlog",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "serialized-task-backlog",
  });
  assert.equal(firstBacklog.accepted, true);
  if (!firstBacklog.accepted) return;
  const firstReentry = application.moveTask({
    taskId: first.task.id,
    destinationColumnId: "implementation",
    expectedRevision: firstBacklog.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "serialized-task-reentry",
  });
  assert.equal(firstReentry.accepted, true);
  if (!firstReentry.accepted) return;

  await application.resumeAutomation();
  const firstTwoRequests = await Promise.race([
    runtime.waitForRequests(2),
    delay(1_000).then(() => undefined),
  ]);
  assert.ok(firstTwoRequests, "independent tasks did not begin concurrently");
  assert.deepEqual(
    firstTwoRequests.map((request) => request.task.id),
    [first.task.id, second.task.id],
  );
  assert.equal(runtime.requests.length, 2, "the later same-task activation must remain queued");

  runtime.complete(firstTwoRequests[0]!.activationId, {
    status: "completed",
    summary: "First task activation completed.",
  });
  const firstThreeRequests = await runtime.waitForRequests(3);
  assert.equal(firstThreeRequests[2]?.task.id, first.task.id);
  assert.notEqual(firstThreeRequests[2]?.activationId, firstTwoRequests[0]?.activationId);

  runtime.complete(firstTwoRequests[1]!.activationId, {
    status: "completed",
    summary: "Independent task completed.",
  });
  runtime.complete(firstThreeRequests[2]!.activationId, {
    status: "completed",
    summary: "Second activation completed.",
  });
  await application.waitForAutomationIdle();
});

test("a newly queued independent task starts while another task is still running", async (t) => {
  const fixture = await createActivationFixture("running-task-concurrency");
  const runtime = new ConcurrentAgentRuntime();
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
    title: "Keep running",
    description: "Another task may start without waiting for this run.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-already-running-task",
  });
  assert.equal(first.accepted, true);
  if (!first.accepted) return;

  await application.resumeAutomation();
  const firstRequest = (await runtime.waitForRequests(1))[0]!;
  const second = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Start during another run",
    description: "A running task must not globally serialize this task.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-task-during-run",
  });
  assert.equal(second.accepted, true);
  if (!second.accepted) return;
  const firstTwoRequests = await Promise.race([
    runtime.waitForRequests(2),
    delay(1_000).then(() => undefined),
  ]);
  assert.ok(firstTwoRequests, "the automation pump did not wake for the independent task");
  assert.equal(firstTwoRequests[1]?.task.id, second.task.id);

  runtime.complete(firstRequest.activationId, {
    status: "completed",
    summary: "Original task completed.",
  });
  runtime.complete(firstTwoRequests[1]!.activationId, {
    status: "completed",
    summary: "Concurrent task completed.",
  });
  await application.waitForAutomationIdle();
});

test("competing coordinators claim one activation before workspace provisioning", async (t) => {
  const fixture = await createActivationFixture("activation-claim");
  const runtime = new ConcurrentAgentRuntime();
  const runtimeDispatch = {
    projectRepositoryPath: fixture.repositoryPath,
    taskWorkspaceRoot: fixture.workspaceRoot,
    agentRuntime: runtime,
  };
  const firstApplication = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch,
  });
  t.after(() => firstApplication.close());
  const created = firstApplication.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Claim before provisioning",
    description: "Only one coordinator may prepare and dispatch this activation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-claimed-activation",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const secondApplication = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch,
  });
  t.after(() => secondApplication.close());

  const resumes = await Promise.all([
    firstApplication.resumeAutomation(),
    secondApplication.resumeAutomation(),
  ]);
  assert.ok(resumes.every((result) => result.accepted));
  const request = (await runtime.waitForRequests(1))[0]!;
  await delay(250);
  assert.equal(runtime.requests.length, 1);

  runtime.complete(request.activationId, {
    status: "completed",
    summary: "Claimed activation completed once.",
  });
  await Promise.all([
    firstApplication.waitForAutomationIdle(),
    secondApplication.waitForAutomationIdle(),
  ]);
  const inspected = firstApplication.queryTask(created.task.id);
  assert.equal(inspected.available, true);
  if (inspected.available) {
    assert.equal(inspected.task.activations[0]?.attempts.length, 1);
    assert.equal(inspected.task.activations[0]?.status, "completed");
    assert.equal(inspected.task.activations[0]?.startupFailure, null);
  }
});

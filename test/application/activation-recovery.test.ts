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
  replacePersistedCoordinationStateWithIncompleteFixture,
  PausedRetryClock,
  readGlobalSafeDirectories,
  startMentionedAgentMoveScenario,
} from "../support/activation-fixture.ts";

test("a rejected runtime attempt enters bounded automatic retry", async (t) => {
  const fixture = await createActivationFixture("runtime-start-failure");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: new PausedRetryClock(),
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

  assert.equal((await application.resumeAutomation()).accepted, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(application.queryAutomation(), {
    state: "running",
    attemptsMayStart: true,
  });
  const failed = created.accepted ? application.queryTask(created.task.id) : undefined;
  assert.equal(failed?.available, true);
  if (failed?.available) {
    assert.equal(failed.task.activations[0]?.status, "queued");
    assert.equal(failed.task.activations[0]?.recovery?.state, "scheduled");
  }
});

test("a failed outcome without a thread preserves its diagnostic for automatic retry", async (t) => {
  const fixture = await createActivationFixture("runtime-pre-thread-failure");
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: new PausedRetryClock(),
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
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve the runtime diagnostic",
    description: "A pre-thread failure should remain actionable.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-pre-thread-failure",
  });

  assert.equal((await application.resumeAutomation()).accepted, true);
  await new Promise<void>((resolve) => setImmediate(resolve));
  const failed = created.accepted ? application.queryTask(created.task.id) : undefined;
  assert.equal(failed?.available, true);
  if (failed?.available) {
    assert.equal(failed.task.activations[0]?.status, "queued");
    assert.equal(
      failed.task.activations[0]?.attempts[0]?.outcome?.summary,
      "Codex rejected the MCP server configuration",
    );
  }
});

test("a pre-attempt workspace failure is durable, correlated, and visible after restart", async (t) => {
  const fixture = await createActivationFixture("durable-startup-failure", "missing-starting-ref");
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
  const failureOccurrences = firstApplication.queryNotificationOccurrences(0).occurrences;
  assert.deepEqual(failureOccurrences.map((occurrence) => occurrence.type), ["failed-run"]);
  assert.equal(failureOccurrences[0]?.attentionReasonId, inspection.available
    ? inspection.task.unresolvedAttention[0]?.id
    : undefined);
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

test("startup recreates populated current coordination state when it is incomplete", async (t) => {
  const fixture = await createActivationFixture("dispatch-claim-initialization");
  const initialApplication = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const disposable = initialApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Discard incomplete coordination state",
    description: "This task must disappear with incomplete persisted state.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-incomplete-schema",
  });
  assert.equal(disposable.accepted, true);
  if (!disposable.accepted) return;
  initialApplication.close();
  await replacePersistedCoordinationStateWithIncompleteFixture(fixture.databasePath);

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
  assert.equal(application.queryTask(disposable.task.id).available, false);
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Use recreated coordination state",
    description: "The recreated state supports ordinary activation dispatch.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-after-claim-initialization",
  });
  assert.equal(created.accepted, true);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
});

test("a queued activation survives application restart and remains paused", async (t) => {
  const fixture = await createActivationFixture("durable-queue");
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

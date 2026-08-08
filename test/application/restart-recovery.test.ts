import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, rename, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  type AgentRunLifecycle,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRuntime,
  type AutomationClock,
  CoordinationApplication,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);

test("restart records an interrupted attempt and retries its activation at the head", async (t) => {
  const fixture = await createFixture();
  const interruptedRuntime = new RecordingRuntime(false);
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: interruptedRuntime,
    },
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Recover this activation",
    description: "Restart must preserve the workspace and activation order.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-restart-recovery",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await first.resumeAutomation();
  const firstRequest = await interruptedRuntime.waitForRequest();
  const moved = first.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: created.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-review-before-restart",
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  const queuedActivationId = moved.task.activations[1]?.id;
  assert.ok(queuedActivationId);
  const idle = first.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Remain idle across restart",
    description: "This unwatched task must stay durable without dispatch.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-idle-restart-task",
  });
  assert.equal(idle.accepted, true);
  if (!idle.accepted) return;
  first.close();

  const recoveringRuntime = new RecordingRuntime(true);
  const recoveryClock = new ControlledClock("2026-01-01T12:00:00.000Z");
  const recovered = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: recoveryClock,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: recoveringRuntime,
    },
  });
  t.after(() => recovered.close());
  assert.equal(recovered.queryStartup().mode, "paused");
  const resumePromise = recovered.resumeAutomation();
  assert.equal(recoveringRuntime.requestCount, 0);
  recoveryClock.advanceTo("2026-01-01T12:00:05.000Z");
  const resume = await resumePromise;
  assert.equal(resume.accepted, true);
  const retry = await recoveringRuntime.waitForRequest();
  assert.equal(retry.activationId, firstRequest.activationId);
  assert.equal(retry.workspace.path, firstRequest.workspace.path);
  assert.deepEqual(retry.attempt, {
    number: 2,
    precedingOutcome: {
      status: "failed",
      summary: "The previous host stopped while this attempt was active.",
    },
    thread: "resumed",
    continuationMessage: null,
  });
  await recovered.waitForAutomationIdle();
  const later = await recoveringRuntime.waitForRequest(2);
  assert.equal(later.activationId, queuedActivationId);
  assert.deepEqual(later.attempt, {
    number: 1,
    precedingOutcome: null,
    thread: "fresh",
    continuationMessage: null,
  });

  const task = recovered.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (task.available) {
    assert.deepEqual(
      task.task.activations[0]?.attempts.map((attempt) => ({
        status: attempt.status,
        outcome: attempt.outcome,
        threadId: attempt.threadId,
      })),
      [
        {
          status: "failed",
          outcome: {
            status: "failed",
            summary: "The previous host stopped while this attempt was active.",
          },
          threadId: "thread-before-restart",
        },
        {
          status: "completed",
          outcome: { status: "completed", summary: "Recovered work completed." },
          threadId: "thread-before-restart",
        },
      ],
    );
    assert.equal(task.task.activations[1]?.status, "completed");
  }
  const idleAfterRestart = recovered.queryTask(idle.task.id);
  assert.equal(idleAfterRestart.available, true);
  if (idleAfterRestart.available) assert.deepEqual(idleAfterRestart.task.activations, []);
});

test("restart interruptions exhaust the same bounded retry cycle", async (t) => {
  const fixture = await createFixture();
  const activationId = await startInterruptedHost(
    fixture,
    new ControlledClock("2026-01-01T12:00:00.000Z"),
    true,
  );
  await startInterruptedHost(
    fixture,
    new ControlledClock("2026-01-01T12:00:00.000Z"),
    false,
    "2026-01-01T12:00:05.000Z",
  );
  await startInterruptedHost(
    fixture,
    new ControlledClock("2026-01-01T12:00:05.000Z"),
    false,
    "2026-01-01T12:00:15.000Z",
  );

  const finalRuntime = new RecordingRuntime(true);
  const final = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: new ControlledClock("2026-01-01T12:00:15.000Z"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: finalRuntime,
    },
  });
  t.after(() => final.close());
  assert.equal((await final.resumeAutomation()).accepted, true);
  assert.equal(finalRuntime.requestCount, 0);
  const attention = final.queryNeedsAttention();
  assert.equal(attention.available, true);
  if (attention.available) {
    assert.equal(attention.tasks[0]?.reasons[0]?.sourceEventId, activationId);
    assert.equal(attention.tasks[0]?.reasons[0]?.recovery?.kind, "technical-failure");
  }
});

test("startup reports every durable workspace mismatch before allowing mutation", async (t) => {
  const fixture = await createFixture();
  const runtime = new RecordingRuntime(true);
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Validate this workspace",
    description: "Startup must diagnose its missing worktree as a project-level inconsistency.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-workspace-validation",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  await first.resumeAutomation();
  await first.waitForAutomationIdle();
  const task = first.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (!task.available) return;
  const workspacePath = task.task.activations[0]?.attempts[0]?.workspacePath;
  assert.ok(workspacePath);
  first.close();
  await execFileAsync("git", ["-C", fixture.repositoryPath, "worktree", "remove", "--force", workspacePath]);

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: new RecordingRuntime(true),
    },
  });
  t.after(() => restarted.close());
  const startup = restarted.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.equal(startup.automation.state, "blocked");
    assert.match(
      startup.diagnostics.map((entry) => entry.rule).join("\n"),
      /workspace directory[\s\S]*Git worktree registration/i,
    );
    assert.match(JSON.stringify(startup.diagnostics), new RegExp(created.task.id));
  }
  const rejected = restarted.editTask({
    taskId: created.task.id,
    title: "Must remain unchanged",
    description: "Configuration-error mode rejects board mutation.",
    expectedRevision: created.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "reject-mutation-during-workspace-error",
  });
  assert.deepEqual(
    { accepted: rejected.accepted, reason: rejected.accepted ? undefined : rejected.reason },
    { accepted: false, reason: "configuration-error" },
  );
});

test("startup backs up and verifies durable storage before schema migration", async () => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  first.close();
  const before = new DatabaseSync(fixture.databasePath);
  before.exec("PRAGMA user_version = 0");
  before.close();

  const migrated = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  migrated.close();
  const backupPath = `${fixture.databasePath}.pre-migration-v0.backup`;
  await access(backupPath);
  const backup = new DatabaseSync(backupPath, { readOnly: true });
  assert.equal((backup.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check, "ok");
  assert.equal((backup.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 0);
  backup.close();
  const current = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal((current.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 2);
  current.close();
});

test("startup rejects a future schema without changing its version", async () => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  first.close();
  const future = new DatabaseSync(fixture.databasePath);
  future.exec("PRAGMA user_version = 3");
  future.close();

  const rejected = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  const startup = rejected.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.match(JSON.stringify(startup.diagnostics), /schema version 3 is newer than supported version 2/i);
  }
  rejected.close();
  const unchanged = new DatabaseSync(fixture.databasePath, { readOnly: true });
  assert.equal((unchanged.prepare("PRAGMA user_version").get() as { user_version: number }).user_version, 3);
  unchanged.close();
});

test("migration backup includes committed data still present in the WAL", async () => {
  const fixture = await createFixture();
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  first.close();
  const writer = new DatabaseSync(fixture.databasePath);
  writer.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA wal_autocheckpoint = 0;
    CREATE TABLE migration_wal_marker (value TEXT NOT NULL);
    INSERT INTO migration_wal_marker VALUES ('committed-before-migration');
    PRAGMA user_version = 0;
  `);

  const migrated = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  migrated.close();
  writer.close();
  const backup = new DatabaseSync(`${fixture.databasePath}.pre-migration-v0.backup`, { readOnly: true });
  assert.equal(
    (backup.prepare("SELECT value FROM migration_wal_marker").get() as { value: string }).value,
    "committed-before-migration",
  );
  backup.close();
});

test("startup distinguishes a missing registration from a present workspace directory", async (t) => {
  const fixture = await createFixture();
  const { application, taskId, workspacePath } = await provisionCompletedTask(fixture);
  application.close();
  const parkedPath = `${workspacePath}-parked`;
  await rename(workspacePath, parkedPath);
  await execFileAsync("git", ["-C", fixture.repositoryPath, "worktree", "remove", "--force", workspacePath]);
  await rename(parkedPath, workspacePath);

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: new RecordingRuntime(true),
    },
  });
  t.after(() => restarted.close());
  const startup = restarted.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.deepEqual(
      startup.diagnostics.map((entry) => entry.rule),
      ["Every database workspace record must have a Git worktree registration"],
    );
    assert.match(JSON.stringify(startup.diagnostics), new RegExp(taskId));
  }
});

test("startup reports a registered workspace that has no database record", async (t) => {
  const fixture = await createFixture();
  const { application, taskId } = await provisionCompletedTask(fixture);
  application.close();
  const database = new DatabaseSync(fixture.databasePath);
  database.prepare("DELETE FROM task_workspaces WHERE task_id = ?").run(taskId);
  database.close();

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: new RecordingRuntime(true),
    },
  });
  t.after(() => restarted.close());
  const startup = restarted.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.match(
      startup.diagnostics.map((entry) => entry.rule).join("\n"),
      /directory must have a database workspace record[\s\S]*registration must have a database workspace record/i,
    );
  }
});

test("a complete state-root backup restores task state at the registered absolute paths", async (t) => {
  const fixture = await createFixture();
  const { application, taskId, workspacePath } = await provisionCompletedTask(fixture);
  application.close();
  const registrationsBefore = await execFileAsync("git", [
    "-C", fixture.repositoryPath, "worktree", "list", "--porcelain",
  ]);
  const backupRoot = `${fixture.stateRoot}-backup`;
  await cp(fixture.stateRoot, backupRoot, { recursive: true, force: false });
  await rename(fixture.stateRoot, `${fixture.stateRoot}-unavailable`);
  await cp(backupRoot, fixture.stateRoot, { recursive: true, force: false });

  const restored = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: new RecordingRuntime(true),
    },
  });
  t.after(() => restored.close());
  assert.equal(restored.queryStartup().mode, "paused");
  const task = restored.queryTask(taskId);
  assert.equal(task.available, true);
  if (task.available) {
    assert.equal(task.task.activations[0]?.attempts[0]?.workspacePath, workspacePath);
  }
  const registrationsAfter = await execFileAsync("git", [
    "-C", fixture.repositoryPath, "worktree", "list", "--porcelain",
  ]);
  assert.equal(registrationsAfter.stdout, registrationsBefore.stdout);
});

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

async function startInterruptedHost(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  clock: ControlledClock,
  createTask: boolean,
  advanceTo?: string,
): Promise<string> {
  const runtime = new RecordingRuntime(false);
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
  let activationId: string;
  if (createTask) {
    const created = application.createTask({
      boardId: "delivery",
      columnId: "implementation",
      title: "Exhaust interrupted attempts",
      description: "Every host interruption counts toward the bounded retry cycle.",
      actor: { kind: "user", id: "paul" },
      idempotencyKey: "create-interruption-exhaustion",
    });
    assert.equal(created.accepted, true);
    if (!created.accepted) throw new Error("Expected task creation");
    activationId = created.task.activations[0]!.id;
  } else {
    const task = application.queryTask("T-0001");
    assert.equal(task.available, true);
    if (!task.available) throw new Error("Expected retained task");
    activationId = task.task.activations[0]!.id;
  }
  const resume = application.resumeAutomation();
  if (advanceTo !== undefined) clock.advanceTo(advanceTo);
  assert.equal((await resume).accepted, true);
  await runtime.waitForRequest();
  application.close();
  return activationId;
}

class RecordingRuntime implements AgentRuntime {
  readonly #complete: boolean;
  readonly #requests: AgentRunRequest[] = [];
  readonly #waiters: Array<{ count: number; resolve(request: AgentRunRequest): void }> = [];

  constructor(complete: boolean) {
    this.#complete = complete;
  }

  get requestCount(): number {
    return this.#requests.length;
  }

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.#requests.push(request);
    for (const waiter of this.#waiters.splice(0)) {
      const matching = this.#requests[waiter.count - 1];
      if (matching === undefined) this.#waiters.push(waiter);
      else waiter.resolve(matching);
    }
    lifecycle.started("thread-before-restart");
    return this.#complete
      ? Promise.resolve({
          status: "completed",
          summary: "Recovered work completed.",
          threadId: "thread-before-restart",
        })
      : new Promise(() => {});
  }

  waitForRequest(count = 1): Promise<AgentRunRequest> {
    const existing = this.#requests[count - 1];
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolvePromise) => this.#waiters.push({ count, resolve: resolvePromise }));
  }
}

async function provisionCompletedTask(fixture: Awaited<ReturnType<typeof createFixture>>): Promise<{
  application: CoordinationApplication;
  taskId: string;
  workspacePath: string;
}> {
  const runtime = new RecordingRuntime(true);
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
    title: "Provision retained workspace",
    description: "Create one durable database record, directory, and Git registration.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "provision-retained-workspace",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Fixture task creation failed");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const task = application.queryTask(created.task.id);
  assert.equal(task.available, true);
  if (!task.available) throw new Error("Fixture task disappeared");
  const workspacePath = task.task.activations[0]?.attempts[0]?.workspacePath;
  assert.ok(workspacePath);
  return { application, taskId: created.task.id, workspacePath };
}

async function createFixture(): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
  stateRoot: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-restart-recovery-"));
  const stateRoot = join(directory, "project-state");
  await mkdir(stateRoot);
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Restart recovery fixture\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C", repositoryPath, "-c", "user.name=Restart Test",
    "-c", "user.email=coordination@example.invalid", "commit", "-m", "Initial fixture",
  ]);
  await writeFile(join(directory, "agent.md"), "Recover interrupted work.\n");
  const definitionPath = join(directory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: Restart recovery
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve activation order.
agents:
  - id: implementer
    name: Implementer
    role: Recovers work
    summary: Completes interrupted tasks.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Delivery
    guidance: Recover before advancing.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: implementer
`);
  return {
    definitionPath,
    databasePath: join(stateRoot, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(stateRoot, "task-worktrees"),
    stateRoot,
  };
}

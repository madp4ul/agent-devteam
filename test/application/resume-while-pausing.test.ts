import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { CompletingAgentRuntime, ConcurrentAgentRuntime, createActivationFixture } from "../support/activation-fixture.ts";
import { startWebServer } from "../../src/web/web-server.ts";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("Resume at empty pump settlement does not lose the queued task wakeup", { timeout: 15_000 }, async (t) => {
  const fixture = await createActivationFixture("resume-settlement");
  const runtime = new CompletingAgentRuntime();
  const app = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  t.after(() => app.close());
  runtime.onCompletion = () => app.pauseAutomation();
  const initial = app.resumeAutomation();
  app.pauseAutomation();
  let resumed: ReturnType<typeof app.resumeAutomation> | undefined;
  queueMicrotask(() => {
    assert.ok(app.createTask({ boardId: "delivery", columnId: "implementation", title: "Settlement wakeup", description: "Must start", actor: { kind: "user", id: "user" }, idempotencyKey: "settle" }).accepted);
    resumed = app.resumeAutomation();
  });
  await initial;
  assert.ok((await resumed)?.accepted);
  await app.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
  assert.equal(app.queryAutomation().state, "paused");
});

test("resume while draining starts unrelated work before the original agent finishes", { timeout: 15_000 }, async (t) => {
  const fixture = await createActivationFixture("resume-draining");
  const runtime = new ConcurrentAgentRuntime();
  const app = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  t.after(() => app.close());
  const create = (title: string) => {
    const result = app.createTask({ boardId: "delivery", columnId: "implementation", title, description: "Controlled drain", actor: { kind: "user", id: "user" }, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task;
  };
  const firstTask = create("Original");
  await app.resumeAutomation();
  const [first] = await runtime.waitForRequests(1);
  assert.ok(first);
  assert.equal(app.pauseAutomation().automation.state, "pausing");
  await new Promise<void>((resolve) => setImmediate(resolve));
  const secondTask = create("Queued during drain");
  assert.deepEqual(await app.resumeAutomation(), { accepted: true, automation: { state: "running", attemptsMayStart: true } });
  const requests = await runtime.waitForRequests(2);
  assert.equal(requests[1]?.task.id, secondTask.id);
  assert.equal(app.queryActiveRuns().find((run) => run.taskId === firstTask.id)?.attemptId, first.attemptId);
  assert.equal(runtime.requests.length, 2);
  app.pauseAutomation();
  for (const request of requests) runtime.complete(request.activationId, { status: "completed", summary: "Finished" });
  await app.waitForAutomationIdle();
  assert.equal(app.queryAutomation().state, "paused");
});

test("preparation finishing across pause and resume obeys the latest intent and keeps one workspace", { timeout: 15_000 }, async (t) => {
  const fixture = await createActivationFixture("preparation-resume-intent");
  const directory = dirname(fixture.definitionPath);
  const enteredPath = join(directory, "checkout-entered");
  const releasePath = join(directory, "checkout-release");
  const filterPath = join(directory, "hold-checkout.mjs");
  // Hold the real Git subprocess at its external smudge-filter boundary.
  await writeFile(filterPath, `import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
const input = readFileSync(0);
writeFileSync(${JSON.stringify(enteredPath)}, 'entered');
while (!existsSync(${JSON.stringify(releasePath)})) await delay(10);
process.stdout.write(input);
`);
  await writeFile(join(fixture.repositoryPath, ".gitattributes"), "held.txt filter=hold\n");
  await writeFile(join(fixture.repositoryPath, "held.txt"), "Retained fixture content\n");
  await execFileAsync("git", ["-C", fixture.repositoryPath, "add", ".gitattributes", "held.txt"]);
  await execFileAsync("git", ["-C", fixture.repositoryPath, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "checkout filter fixture"]);
  await execFileAsync("git", ["-C", fixture.repositoryPath, "config", "filter.hold.smudge", `"${process.execPath.replaceAll("\\", "/")}" "${filterPath.replaceAll("\\", "/")}"`]);
  t.after(() => writeFile(releasePath, "release"));
  const runtime = new ConcurrentAgentRuntime();
  const app = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  t.after(() => app.close());
  const task = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Preparing", description: "Latest intent", actor: { kind: "user", id: "user" }, idempotencyKey: "prepare" });
  assert.ok(task.accepted);
  const initialResume = app.resumeAutomation();
  for (let index = 0; index < 250 && !existsSync(enteredPath); index += 1) await delay(20);
  assert.ok(existsSync(enteredPath), "Git reached the controlled checkout filter");
  assert.equal(app.pauseAutomation().automation.state, "pausing");
  assert.ok((await app.resumeAutomation()).accepted);
  assert.equal(app.pauseAutomation().automation.state, "pausing");
  await writeFile(releasePath, "release");
  await initialResume;
  await app.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 0);
  const retained = app.queryUserTaskDetail(task.task.id);
  assert.ok(retained.available);
  assert.ok(retained.inspection.workspace);
  assert.equal(retained.task.activations[0]?.attempts.length, 0);
  await app.resumeAutomation();
  const [request] = await runtime.waitForRequests(1);
  assert.equal(request?.workspace.path, retained.inspection.workspace.path);
  app.pauseAutomation();
  runtime.complete(request!.activationId, { status: "completed", summary: "Done" });
  await app.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
});

test("HTTP resume and repeated toggles preserve current runs and win a final-completion race", { timeout: 15_000 }, async (t) => {
  const fixture = await createActivationFixture("resume-drain-race");
  const runtime = new ConcurrentAgentRuntime();
  const app = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  t.after(() => app.close());
  const server = await startWebServer(app, { host: "127.0.0.1", port: 0, assetDirectory: "dist/web" });
  t.after(() => server.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Drain race", description: "Keep current run", actor: { kind: "user", id: "user" }, idempotencyKey: "race" });
  assert.ok(created.accepted);
  await app.resumeAutomation();
  const [request] = await runtime.waitForRequests(1);
  assert.ok(request);
  for (let index = 0; index < 3; index += 1) {
    app.pauseAutomation();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const response = await fetch(`${server.baseUrl}/api/automation/resume`, { method: "POST" });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accepted: true, automation: { state: "running", attemptsMayStart: true } });
    assert.equal(app.queryActiveRuns()[0]?.attemptId, request.attemptId);
    assert.equal(runtime.requests.length, 1);
  }
  assert.ok(app.moveTask({ taskId: created.task.id, expectedRevision: created.task.revision, destinationColumnId: "completion", actor: { kind: "user", id: "user" }, idempotencyKey: "finish-race" }).accepted);
  app.pauseAutomation();
  runtime.complete(request.activationId, { status: "completed", summary: "Finished" });
  assert.ok((await app.resumeAutomation()).accepted);
  await app.waitForAutomationIdle();
  assert.equal(app.queryAutomation().state, "running");
  assert.equal(runtime.requests.length, 1);
  // A kick after the previous pump settles must still start new work.
  const next = app.createTask({ boardId: "delivery", columnId: "implementation", title: "After race", description: "No lost wakeup", actor: { kind: "user", id: "user" }, idempotencyKey: "after-race" });
  assert.ok(next.accepted);
  const requests = await runtime.waitForRequests(2);
  assert.equal(requests[1]?.task.id, next.task.id);
  app.pauseAutomation();
  runtime.complete(requests[1]!.activationId, { status: "completed", summary: "Finished" });
  await app.waitForAutomationIdle();
  assert.equal(app.queryAutomation().state, "paused");
});

test("resuming a drain leaves an interrupted task suspended while other work starts", { timeout: 15_000 }, async (t) => {
  const fixture = await createActivationFixture("drain-suspension");
  const runtime = new ConcurrentAgentRuntime();
  const app = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: { run(request, lifecycle, signal) {
        const completion = runtime.run(request, lifecycle);
        signal?.addEventListener("abort", () => runtime.complete(request.activationId, { status: "failed", summary: "Interrupted" }), { once: true });
        return completion;
      } },
    },
  });
  t.after(() => app.close());
  const create = (title: string) => {
    const result = app.createTask({ boardId: "delivery", columnId: "implementation", title, description: "Preserve task guard", actor: { kind: "user", id: "user" }, idempotencyKey: title });
    assert.ok(result.accepted);
    return result.task;
  };
  const original = create("Original running work");
  await app.resumeAutomation();
  await runtime.waitForRequests(1);
  const suspended = create("Interrupted task");
  await runtime.waitForRequests(2);
  const interruption = app.interruptTask({ taskId: suspended.id, actor: { kind: "user", id: "user" }, idempotencyKey: "interrupt" });
  assert.ok(interruption.accepted);
  await interruption.confirmed;
  assert.equal(app.pauseAutomation().automation.state, "pausing");
  const queued = create("Independent queued work");
  assert.ok((await app.resumeAutomation()).accepted);
  const requests = await runtime.waitForRequests(3);
  assert.equal(requests[2]?.task.id, queued.id);
  const inspection = app.queryTaskInspection(suspended.id);
  assert.ok(inspection.available);
  assert.equal(inspection.task.automationSuspended, true);
  assert.equal(runtime.requests.filter(({ task }) => task.id === suspended.id).length, 1);
  app.pauseAutomation();
  for (const request of requests.filter(({ task }) => task.id === original.id || task.id === queued.id)) {
    runtime.complete(request.activationId, { status: "completed", summary: "Done" });
  }
  await app.waitForAutomationIdle();
});

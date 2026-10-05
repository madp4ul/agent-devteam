import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AgentRuntime, AgentRunRequest, ReviewerPolicyConfiguration } from "../../src/application/runtime-contract.ts";
import { writeProcessEvolutionDefinition } from "../support/process-evolution-fixture.ts";
import { createActivationFixture, createResponsibilityActivationFixture, CompletingAgentRuntime } from "../support/activation-fixture.ts";

test("launch guidance reaches every role without changing the process and is snapshotted at claim", async (t) => {
  const fixture = await createResponsibilityActivationFixture("project-allowances");
  const runtime = new CompletingAgentRuntime();
  const launchText = '  Validate the project in the approved browser.\nKeep "private" data local.  ';
  const dispatch = { projectRepositoryPath: fixture.repositoryPath,
    taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime, additionalAllowances: launchText };
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: dispatch });
  t.after(() => application.close());
  // Mutating the caller's options after startup must not change standing guidance.
  dispatch.additionalAllowances = "Not selected at launch.";
  runtime.onCompletion = () => application.pauseAutomation();
  for (const columnId of ["implementation", "review"]) {
    const created = application.createTask({ boardId: "delivery", columnId, title: columnId,
      description: "Project-only guidance.", actor: { kind: "user", id: "paul" }, idempotencyKey: columnId });
    assert.ok(created.accepted);
    await application.resumeAutomation();
    await application.waitForAutomationIdle();
    const request = runtime.requests.at(-1)!;
    assert.equal(request.agent.allowances, undefined);
    assert.equal(request.projectAllowances?.text, launchText);
    assert.equal(request.projectAllowances?.projectRepositoryPath, fixture.repositoryPath);
    const inspected = application.queryTask(created.task.id);
    assert.ok(inspected.available);
    assert.deepEqual(inspected.task.activations[0]?.attempts[0]?.reviewerAllowances?.projectAllowances,
      request.projectAllowances);
    assert.equal(inspected.task.activations[0]?.attempts[0]?.reviewerAllowances?.agentId, request.agent.id);
  }
  assert.equal(runtime.requests[0]?.projectAllowances?.launchId, runtime.requests[1]?.projectAllowances?.launchId);
  const validation = await CoordinationApplication.validateProcessDefinition(fixture.definitionPath);
  assert.ok(validation.valid);
  assert.equal(runtime.requests[0]?.process.definitionVersion, validation.processDefinitionVersion);
});

for (const recovery of ["automatic-retry", "permission-continuation", "interruption-continuation"] as const) {
  test(`restart selects changed launch text for ${recovery}, then omission removes it for queued work`, async (t) => {
    const fixture = await createActivationFixture(`launch-${recovery}`, "main", '    allowances: ["Inspect scoped work."]\n');
    let application: CoordinationApplication;
    t.after(() => application.close());
    const requests: AgentRunRequest[] = [];
    const firstRuntime: AgentRuntime = { run(request, lifecycle, signal) {
      requests.push(request);
      lifecycle.started("retained-thread");
      if (recovery === "interruption-continuation") return new Promise((resolve) => {
        signal!.addEventListener("abort", () => resolve({ status: "failed", summary: "Stopped." }), { once: true });
      });
      application.pauseAutomation();
      return Promise.resolve({ status: recovery === "automatic-retry" ? "failed" : "permission-blocked",
        summary: "Requires recovery.", threadId: "retained-thread" });
    } };
    const start = (agentRuntime: AgentRuntime, additionalAllowances: string | undefined, now: string) =>
      CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
        automationClock: { now: () => new Date(now), waitUntil: async () => { throw new Error("Unexpected backoff wait"); } },
        runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
          agentRuntime, ...(additionalAllowances === undefined ? {} : { additionalAllowances }) } });
    application = await start(firstRuntime, "Original project text.", "2026-10-05T12:00:00Z");
    const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: recovery,
      description: "Retain history while refreshing launch guidance.", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
    assert.ok(created.accepted);
    await application.resumeAutomation();
    if (recovery === "interruption-continuation") {
      const interrupted = application.interruptTask({ taskId: created.task.id,
        actor: { kind: "user", id: "paul" }, idempotencyKey: "interrupt" });
      assert.ok(interrupted.accepted);
      await interrupted.confirmed;
      application.pauseAutomation();
    }
    await application.waitForAutomationIdle();
    const firstRequest = requests[0]!;
    application.close();
    const nextRuntime: AgentRuntime = { async run(request, lifecycle) {
      requests.push(request);
      lifecycle.started("retained-thread");
      application.pauseAutomation();
      return { status: "completed", summary: "Recovered.", threadId: "retained-thread" };
    } };
    application = await start(nextRuntime, "Changed project text.", "2026-10-05T13:00:00Z");
    const startup = application.queryStartup();
    assert.equal(startup.mode, "paused");
    if (startup.mode === "paused") assert.equal(startup.processImpact, undefined);
    if (recovery === "permission-continuation") {
      const attention = application.queryNeedsAttention();
      assert.ok(attention.available);
      const reason = attention.tasks.find(({ task }) => task.id === created.task.id)?.reasons[0];
      assert.ok(reason);
      assert.ok(application.continuePermissionBlockedActivation({
        attentionReasonId: reason.id, message: "Continue under current launch guidance.",
        actor: { kind: "user", id: "paul" }, idempotencyKey: "continue-permission" }).accepted);
    }
    if (recovery === "interruption-continuation") assert.ok(application.continueInterruptedTask({
      taskId: created.task.id, message: "Continue under current launch guidance.",
      actor: { kind: "user", id: "paul" }, idempotencyKey: "continue-interrupted" }).accepted);
    await application.resumeAutomation();
    await application.waitForAutomationIdle();
    const changedRequest = requests[1]!;
    assert.equal(changedRequest.activationId, firstRequest.activationId);
    assert.equal(changedRequest.resumeThreadId, "retained-thread");
    assert.equal(changedRequest.projectAllowances?.text, "Changed project text.");
    assert.notEqual(changedRequest.projectAllowances?.launchId, firstRequest.projectAllowances?.launchId);
    assert.equal(changedRequest.process.definitionVersion, firstRequest.process.definitionVersion);
    const queued = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Queued before omission",
      description: "Do not reload authorization from history.", actor: { kind: "user", id: "paul" }, idempotencyKey: "queued" });
    assert.ok(queued.accepted);
    application.close();
    application = await start(nextRuntime, undefined, "2026-10-05T14:00:00Z");
    await application.resumeAutomation();
    await application.waitForAutomationIdle();
    assert.equal(requests[2]?.projectAllowances, undefined);
    assert.deepEqual(requests[2]?.agent.allowances, ["Inspect scoped work."]);
    const history = application.queryTask(created.task.id);
    assert.ok(history.available);
    assert.deepEqual(history.task.activations[0]?.attempts.map((attempt) => attempt.reviewerAllowances?.projectAllowances?.text),
      ["Original project text.", "Changed project text."]);
  });
}

test("project sources remain isolated with a shared runtime, and whitespace supplies no guidance", async (t) => {
  const sharedRuntime = new CompletingAgentRuntime();
  const applications: CoordinationApplication[] = [];
  const taskIds: string[] = [];
  t.after(() => applications.forEach((application) => application.close()));
  for (const [index, text] of ["Project A.", "Project B.", " \r\n\t"].entries()) {
    const fixture = await createActivationFixture(`isolated-launch-${index}`);
    const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath, runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath,
        taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: sharedRuntime, additionalAllowances: text } });
    applications.push(application);
    const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: `Project ${index}`,
      description: "Use only this project launch source.", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
    assert.ok(created.accepted);
    taskIds.push(created.task.id);
  }
  // Start all hosts before dispatching, so another project's launch cannot
  // overwrite the first host's source even when their runtime is shared.
  for (const [index, application] of applications.entries()) {
    sharedRuntime.onCompletion = () => application.pauseAutomation();
    await application.resumeAutomation();
    await application.waitForAutomationIdle();
    assert.equal(sharedRuntime.requests[index]?.projectAllowances?.text, ["Project A.", "Project B.", undefined][index]);
    const history = application.queryTask(taskIds[index]!);
    assert.ok(history.available);
    if (index === 2) assert.equal(history.task.activations[0]?.attempts[0]?.reviewerAllowances, undefined);
  }
});

test("delivery status changes preserve exact prepared guidance and selected launch source across restart", async (t) => {
  const fixture = await createActivationFixture("launch-evidence");
  const configured: ReviewerPolicyConfiguration = { status: "active", policyHash: "prepared-hash", templateHash: "template-hash",
    preparedPolicy: { nativeVersion: "0.160.0", workspacePath: "native-workspace",
      inheritedExtraPolicy: "Keep inherited restrictions.", extraPolicy: "Exact composed optional policy." } };
  const fallback: ReviewerPolicyConfiguration = { status: "unavailable", reason: "Optional config rejected before execution." };
  let application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      additionalAllowances: "Project validation.", agentRuntime: { async run(_request, lifecycle) {
        lifecycle.reviewerPolicyConfigured?.(configured);
        lifecycle.reviewerPolicyConfigured?.(fallback);
        return { status: "completed", summary: "Baseline completed." };
      } } } });
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Evidence",
    description: "Keep rejected selection distinct from baseline delivery.", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.close();
  application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => application.close());
  const history = application.queryTask(created.task.id);
  assert.ok(history.available);
  const evidence = history.task.activations[0]?.attempts[0]?.reviewerAllowances;
  assert.equal(evidence?.projectAllowances?.text, "Project validation.");
  assert.equal(evidence?.status, "unavailable");
  assert.deepEqual(evidence?.configurations, [configured, fallback]);
});

test("only applied selected-agent guidance is dispatched and revocation requires stale-work rebase", async (t) => {
  const fixture = await createResponsibilityActivationFixture("allowance-revocation");
  const original = (await readFile(fixture.definitionPath, "utf8"))
    .replace("    instructions: ./implementer.md", '    instructions: ./implementer.md\n    allowances: ["Run scoped tests."]');
  await writeFile(fixture.definitionPath, original);
  const firstRuntime = new CompletingAgentRuntime();
  const dispatch = (agentRuntime: CompletingAgentRuntime) => ({ projectRepositoryPath: fixture.repositoryPath,
    taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime });
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: dispatch(firstRuntime) });
  firstRuntime.onCompletion = () => application.pauseAutomation();
  const create = (columnId: string, idempotencyKey: string) => application.createTask({ boardId: "delivery", columnId,
    title: idempotencyKey, description: "Apply only authoritative selected-agent guidance.",
    actor: { kind: "user" as const, id: "paul" }, idempotencyKey });
  const implement = create("implementation", "implement-with-allowance");
  assert.ok(implement.accepted);
  // An on-disk edit is not an applied process change in the running host.
  const revoked = original.replace('    allowances: ["Run scoped tests."]', "    allowances: []");
  await writeFile(fixture.definitionPath, revoked);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.deepEqual(firstRuntime.requests[0]?.agent.allowances, ["Run scoped tests."]);
  const review = create("review", "review-without-allowance");
  assert.ok(review.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  assert.equal(firstRuntime.requests[1]?.agent.id, "reviewer");
  assert.equal(firstRuntime.requests[1]?.agent.allowances, undefined);
  const queued = create("implementation", "queued-before-revocation");
  assert.ok(queued.accepted);
  application.close();
  const nextRuntime = new CompletingAgentRuntime();
  const changed = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath, runtimeDispatch: dispatch(nextRuntime) });
  t.after(() => changed.close());
  nextRuntime.onCompletion = () => changed.pauseAutomation();
  const startup = changed.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode !== "paused") return;
  assert.ok(startup.processImpact?.staleActivations.some((activation) => activation.taskId === queued.task.id));
  assert.equal((await changed.resumeAutomation()).accepted, false);
  assert.equal((await changed.resumeWithCurrentProcess()).accepted, true);
  await changed.waitForAutomationIdle();
  assert.equal(nextRuntime.requests[0]?.agent.allowances, undefined);
  assert.notEqual(nextRuntime.requests[0]?.process.definitionVersion, firstRuntime.requests[0]?.process.definitionVersion);
  const history = changed.queryTask(implement.task.id);
  assert.ok(history.available);
  assert.deepEqual(history.task.activations[0]?.attempts[0]?.reviewerAllowances?.allowances, ["Run scoped tests."]);
});

test("dispatch snapshots applied agent allowances and retains runtime fallback across restart", async (t) => {
  const fixture = await createActivationFixture("allowance-dispatch", "main",
    '    allowances: ["Run scoped tests."]\n');
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: { async run(request, lifecycle) {
        assert.deepEqual(request.agent.allowances, ["Run scoped tests."]);
        lifecycle.reviewerPolicyConfigured?.({ status: "unavailable", reason: "Unsupported reviewer template." });
        return runtime.run(request, lifecycle);
      } },
    },
  });
  const created = application.createTask({ boardId: "delivery", columnId: "implementation",
    title: "Scoped authorization", description: "Retain native policy availability.",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create-allowances" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.close();
  const reopened = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath });
  t.after(() => reopened.close());
  const inspected = reopened.queryTask(created.task.id);
  assert.ok(inspected.available);
  assert.deepEqual(inspected.task.activations[0]?.attempts[0]?.reviewerAllowances, {
    definitionVersion: runtime.requests[0]!.process.definitionVersion,
    agentId: "implementer",
    allowances: ["Run scoped tests."], status: "unavailable", reason: "Unsupported reviewer template.",
    configurations: [{ status: "unavailable", reason: "Unsupported reviewer template." }],
  });
});

test("agent allowances validate and changing authorization changes the process version", async () => {
  const root = await mkdtemp(join(tmpdir(), "reviewer-allowances-definition-"));
  const path = join(root, "process.yaml");
  await writeFile(join(root, "implementer.md"), "Implement scoped work.");
  await writeProcessEvolutionDefinition(path, { includeImplementation: true });
  const source = await readFile(path, "utf8");
  const original = await CoordinationApplication.validateProcessDefinition(path);
  assert.ok(original.valid);
  const withAllowance = (value: string) => source.replace("    instructions:", `    allowances: ${value}\n    instructions:`);
  await writeFile(path, withAllowance('["Run the project test suite."]'));
  const changed = await CoordinationApplication.validateProcessDefinition(path);
  assert.ok(changed.valid, JSON.stringify(changed));
  assert.notEqual(changed.processDefinitionVersion, original.processDefinitionVersion);
  for (const invalid of ['["   "]', '[42]', '"Run tests"']) {
    await writeFile(path, withAllowance(invalid));
    assert.equal((await CoordinationApplication.validateProcessDefinition(path)).valid, false);
  }
  await writeFile(path, withAllowance('[]'));
  assert.equal((await CoordinationApplication.validateProcessDefinition(path)).valid, true);
});

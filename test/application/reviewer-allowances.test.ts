import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { writeProcessEvolutionDefinition } from "../support/process-evolution-fixture.ts";
import { createActivationFixture, createResponsibilityActivationFixture, CompletingAgentRuntime } from "../support/activation-fixture.ts";

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
    allowances: ["Run scoped tests."], status: "unavailable", reason: "Unsupported reviewer template.",
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

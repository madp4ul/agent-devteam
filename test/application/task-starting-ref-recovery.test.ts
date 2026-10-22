import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { createActivationFixture, CompletingAgentRuntime } from "../support/activation-fixture.ts";

const execFileAsync = promisify(execFile);

test("correcting an unprovisioned starting ref requires user retry and provisions the corrected commit", async (t) => {
  const fixture = await createActivationFixture("correct-starting-ref", "mistyped-commit");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  t.after(() => application.close());
  runtime.onCompletion = () => application.pauseAutomation();
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Fix base ref",
    description: "Recover without recreating work", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  assert.equal((await application.resumeAutomation()).accepted, false);
  const failed = application.queryTaskInspection(created.task.id);
  assert.ok(failed.available);
  assert.deepEqual(failed.task.workspaceStatus, { state: "unprovisioned", startingRef: "mistyped-commit", startingRefEditable: true });
  const { stdout } = await execFileAsync("git", ["-C", fixture.repositoryPath, "rev-parse", "main"]);
  const commit = stdout.trim();
  const correction = { taskId: created.task.id, startingRef: ` ${commit} `, expectedRevision: 1,
    actor: { kind: "user" as const, id: "paul" }, idempotencyKey: "correct" };
  const edited = application.editTask(correction);
  assert.ok(edited.accepted);
  assert.equal(edited.task.revision, 2);
  assert.equal(edited.task.description, "Recover without recreating work");
  assert.deepEqual(application.editTask(correction), edited);
  assert.deepEqual(application.editTask({ ...correction, startingRef: "main" }), { accepted: false, reason: "idempotency-conflict" });
  const corrected = application.queryTaskInspection(created.task.id);
  assert.ok(corrected.available);
  assert.equal(corrected.task.workspaceStatus.startingRef, commit);
  assert.equal(corrected.task.run.status, "failed");
  assert.equal(runtime.requests.length, 0);
  assert.ok(application.retryFailedActivation({ attentionReasonId: failed.task.unresolvedAttention[0]!.id,
    actor: { kind: "user", id: "paul" }, idempotencyKey: "retry" }).accepted);
  assert.ok((await application.resumeAutomation()).accepted);
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests.length, 1);
  assert.equal(runtime.requests[0]!.workspace.commit, commit);
  const { stdout: head } = await execFileAsync("git", ["-C", runtime.requests[0]!.workspace.path, "rev-parse", "HEAD"]);
  assert.equal(head.trim(), commit);
  const provisioned = application.queryTaskInspection(created.task.id);
  assert.ok(provisioned.available);
  assert.deepEqual(provisioned.task.workspaceStatus, { state: "provisioned", startingRef: commit, startingRefEditable: false });
  assert.deepEqual(application.editTask({ ...correction, expectedRevision: 2, idempotencyKey: "after-provision" }),
    { accepted: false, reason: "workspace-already-provisioned" });
  assert.ok(application.editTask({ taskId: created.task.id, description: "Updated content", expectedRevision: 2,
    actor: { kind: "user", id: "paul" }, idempotencyKey: "content-only" }).accepted);
});


test("dispatch preparation atomically closes ref editing while content editing stays available", async (t) => {
  const fixture = await createActivationFixture("starting-ref-preparation", "main");
  const runtime = new CompletingAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
  });
  t.after(() => application.close());
  runtime.onCompletion = () => application.pauseAutomation();
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Prepare atomically",
    description: "Keep base stable during Git I/O", actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  const resume = application.resumeAutomation();
  // Claiming is synchronous; Git provisioning yields before recording a workspace.
  const preparing = application.queryTaskInspection(created.task.id);
  assert.ok(preparing.available);
  assert.deepEqual(preparing.task.workspaceStatus, { state: "preparing", startingRef: "main", startingRefEditable: false });
  assert.equal(runtime.requests.length, 0);
  assert.deepEqual(application.editTask({ taskId: created.task.id, startingRef: "another-ref", expectedRevision: 1,
    actor: { kind: "user", id: "paul" }, idempotencyKey: "racing-ref" }), { accepted: false, reason: "workspace-preparing" });
  assert.ok(application.editTask({ taskId: created.task.id, title: "Content remains editable", expectedRevision: 1,
    actor: { kind: "user", id: "paul" }, idempotencyKey: "content" }).accepted);
  assert.ok((await resume).accepted);
  await application.waitForAutomationIdle();
  assert.equal(runtime.requests[0]!.workspace.startingRef, "main");
  assert.equal(runtime.requests[0]!.task.title, "Content remains editable");
});

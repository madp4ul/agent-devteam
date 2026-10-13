import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { performance } from "node:perf_hooks";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { ControlledAgentRuntime, createHandoffFixture } from "../support/handoff-fixture.ts";

test("a ten thousand item attempt pages newest first without reading retained transcripts", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime },
    transcriptAccess: runtime,
  });
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Large history", description: "Page whole evidence.", actor: { kind: "user", id: "paul" }, idempotencyKey: "large-history" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  runtime.setTranscript(request.attemptId, Array.from({ length: 10_000 }, (_, index) => ({ kind: "message" as const, id: `item-${index}`, role: "agent" as const, text: `Evidence ${index}` })), false);
  application.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Done", threadId: "large-thread" });
  await application.waitForAutomationIdle();
  const task = application.queryTask(created.task.id);
  assert.ok(task.available);
  assert.equal(task.task.activations[0]!.status, "completed");
  let transcriptReads = 0;
  runtime.read = async () => { transcriptReads++; throw new Error("Browser read must use indexed items"); };
  const started = performance.now();
  const conversationId = created.task.activations[0]!.conversationId!;
  const latest = await application.queryAgentConversation(created.task.id, conversationId);
  assert.ok(latest.available);
  assert.equal(latest.conversation.history.length, 50);
  assert.equal(latest.conversation.history.at(-1)?.kind, "item");
  assert.ok(latest.conversation.page?.olderCursor);
  const older = await application.queryAgentConversation(created.task.id, conversationId, { cursor: latest.conversation.page.olderCursor });
  assert.ok(older.available);
  assert.equal(older.conversation.history.length, 50);
  assert.equal(new Set([...latest.conversation.page.recordIds, ...older.conversation.page!.recordIds]).size, 100);
  const target = await application.queryAgentConversation(created.task.id, conversationId, { attemptId: request.attemptId });
  assert.ok(target.available);
  assert.equal(target.conversation.history[0]?.kind, "activation");
  const invalid = await application.queryAgentConversation(created.task.id, conversationId, { cursor: latest.conversation.page.olderCursor + "x" });
  assert.deepEqual(invalid, { available: false, reason: "invalid-page" });
  assert.equal(transcriptReads, 0);
  const inspection = new DatabaseSync(fixture.databasePath, { readOnly: true });
  t.after(() => inspection.close());
  t.diagnostic(`four bounded application queries over 10,000 items: ${(performance.now() - started).toFixed(2)}ms; full transcript reads: ${transcriptReads}`);
  const plan = inspection.prepare("EXPLAIN QUERY PLAN SELECT item_json FROM conversation_history_items INDEXED BY conversation_history_position WHERE conversation_id = ? AND sequence <= ? AND position < ? ORDER BY position DESC LIMIT 50").all(conversationId, 10_001, "z");
  t.diagnostic(JSON.stringify(plan));
  assert.match(JSON.stringify(plan), /conversation_history_position/);
  assert.doesNotMatch(JSON.stringify(plan), /SCAN conversation_history_items|TEMP B-TREE/);
  const newestPlan = inspection.prepare("EXPLAIN QUERY PLAN SELECT item_json FROM conversation_history_items INDEXED BY conversation_history_position WHERE conversation_id = ? AND sequence <= ? ORDER BY position DESC LIMIT 50").all(conversationId, 10_001);
  t.diagnostic(JSON.stringify(newestPlan));
  assert.doesNotMatch(JSON.stringify(newestPlan), /SCAN conversation_history_items|TEMP B-TREE/);
  const oversized = await application.queryAgentConversation(created.task.id, conversationId, { pageSize: 151 });
  assert.deepEqual(oversized, { available: false, reason: "invalid-page" });
  const other = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Other", description: "Cursor scope", actor: { kind: "user", id: "paul" }, idempotencyKey: "other" });
  assert.ok(other.accepted);
  assert.deepEqual(await application.queryAgentConversation(other.task.id, other.task.activations[0]!.conversationId!, { cursor: latest.conversation.page.olderCursor }), { available: false, reason: "invalid-page" });
  assert.deepEqual(await application.queryAgentConversation(other.task.id, conversationId), { available: false, reason: "not-found" });
  const end = await application.queryAgentConversation(created.task.id, conversationId, { activationId: request.activationId, pageSize: 150 });
  assert.ok(end.available);
  assert.equal(end.conversation.page!.olderCursor, null);
});

test("backward pages keep their watermark while latest refresh updates live items and discovers new content", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime("live-thread");
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime }, transcriptAccess: runtime });
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Live", description: "Streaming items", actor: { kind: "user", id: "paul" }, idempotencyKey: "live" });
  assert.ok(created.accepted);
  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  const emptyAttempt = await application.queryAgentConversation(created.task.id, created.task.activations[0]!.conversationId!, { attemptId: request.attemptId });
  assert.ok(emptyAttempt.available);
  assert.equal(emptyAttempt.conversation.history[0]?.kind, "activation");
  runtime.setTranscript(request.attemptId, [{ id: "command", kind: "command", command: "test", status: "running" }, { id: "answer", kind: "message", role: "agent", text: "Partial" }]);
  const first = await application.queryAgentConversation(created.task.id, created.task.activations[0]!.conversationId!, { pageSize: 1 });
  assert.ok(first.available);
  runtime.setTranscript(request.attemptId, [{ id: "command", kind: "command", command: "test", status: "completed", output: "Passed" }, { id: "answer", kind: "message", role: "agent", text: "Complete" }, { id: "new", kind: "message", role: "agent", text: "New evidence" }]);
  const older = await application.queryAgentConversation(created.task.id, first.conversation.id, { cursor: first.conversation.page!.olderCursor! });
  assert.ok(older.available);
  assert.equal(older.conversation.history[0]?.kind, "item");
  if (older.conversation.history[0]?.kind === "item") assert.equal(older.conversation.history[0].item.kind === "command" && older.conversation.history[0].item.status, "completed");
  const refresh = await application.queryAgentConversation(created.task.id, first.conversation.id, { cursor: first.conversation.page!.refreshCursor, pageSize: 50 });
  assert.ok(refresh.available);
  assert.equal(refresh.conversation.history.length, 2);
  const last = refresh.conversation.history.at(-1);
  assert.equal(last?.kind === "item" && last.item.id, "new");
  application.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Done", threadId: "live-thread" });
  await application.waitForAutomationIdle();
  const settled = await application.queryAgentConversation(created.task.id, first.conversation.id);
  assert.ok(settled.available);
  assert.equal(settled.conversation.history.length, 4);
  assert.equal(new Set(settled.conversation.page!.recordIds).size, 4);
});

test("equal timestamp activation pages hydrate only selected causes while full costs remain authoritative", async (t) => {
  const fixture = await createHandoffFixture();
  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => application.close());
  const created = application.createTask({ boardId: "delivery", columnId: "implementation", title: "Many activations", description: "Equal timestamps", actor: { kind: "user", id: "paul" }, idempotencyKey: "many-activations" });
  assert.ok(created.accepted);
  const first = created.task.activations[0]!;
  const writer = new DatabaseSync(fixture.databasePath);
  const cause = writer.prepare(`INSERT INTO activations(id, task_id, target_agent_id, reason_type, source_event_id, status, created_at, definition_version, conversation_id)
    SELECT ?, task_id, target_agent_id, reason_type, source_event_id, 'completed', created_at, definition_version, conversation_id FROM activations WHERE id = ?`);
  const attempt = writer.prepare("INSERT INTO attempts(id, activation_id, status, workspace_path, started_at, completed_at) VALUES (?, ?, 'completed', 'fixture', '2026-01-01', '2026-01-02')");
  const transcript = writer.prepare("INSERT INTO attempt_transcripts(attempt_id, items_json, usage_json) VALUES (?, '[]', '{\"estimatedCostUsd\":0.01}')");
  const seed = (start: number, end: number): void => {
    writer.exec("BEGIN IMMEDIATE");
    for (let index = start; index < end; index++) { cause.run(`cause-${index}`, first.id); attempt.run(`cost-${index}`, `cause-${index}`); transcript.run(`cost-${index}`); }
    writer.exec("COMMIT");
  };
  seed(0, 100);
  const smallStarted = performance.now();
  const small = await application.queryAgentConversation(created.task.id, first.conversationId!);
  assert.ok(small.available);
  const smallElapsed = performance.now() - smallStarted;
  seed(100, 10_000);
  const largeStarted = performance.now();
  const latest = await application.queryAgentConversation(created.task.id, first.conversationId!);
  assert.ok(latest.available);
  const largeElapsed = performance.now() - largeStarted;
  assert.equal(latest.conversation.history.length, 50);
  assert.equal(latest.conversation.history[0]?.kind === "activation" && latest.conversation.history[0].activationId, "cause-9950");
  assert.ok(Math.abs(latest.conversation.costEstimate!.amount - 100) < 0.000001);
  const previous = await application.queryAgentConversation(created.task.id, first.conversationId!, { cursor: latest.conversation.page!.olderCursor! });
  assert.ok(previous.available);
  assert.equal(previous.conversation.history[0]?.kind === "activation" && previous.conversation.history[0].activationId, "cause-9900");
  const direct = await application.queryAgentConversation(created.task.id, first.conversationId!, { activationId: "cause-1" });
  assert.ok(direct.available);
  assert.equal(direct.conversation.history[0]?.kind === "activation" && direct.conversation.history[0].activationId, "cause-1");
  const plan = writer.prepare("EXPLAIN QUERY PLAN SELECT id FROM activations WHERE task_id = ? AND id = ? ORDER BY sequence").all(created.task.id, "cause-1");
  assert.doesNotMatch(JSON.stringify(plan), /SCAN activations/);
  t.diagnostic(`50-cause page: 100 attempts ${smallElapsed.toFixed(2)}ms; 10,000 attempts ${largeElapsed.toFixed(2)}ms. Remaining linear aggregate reads 10,000 compact usage rows for authoritative $100, never transcript item arrays; cause hydration capped at50.`);
  t.diagnostic(JSON.stringify(plan));
  writer.close();
});

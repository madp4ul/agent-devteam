import assert from "node:assert/strict";
import test from "node:test";
import { readFile, writeFile } from "node:fs/promises";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { TaskHistoryQuery } from "../../src/application/history-contract.ts";
import { createHandoffFixture, ControlledAgentRuntime } from "../support/handoff-fixture.ts";

test("whole-record history pages select newest, render chronologically and keep stable restart cursors", async (t) => {
  const fixture = await createHandoffFixture();
  const options = { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath };
  let app = await CoordinationApplication.start(options);
  t.after(() => app.close());
  const result = app.createTask({ boardId: "delivery", columnId: "implementation", title: "History", description: "Work",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(result.accepted);
  const taskId = result.task.id;
  const ids = [800, 600, 700].map((words, index) => {
    const comment = app.addTaskComment({ taskId, body: Array(words - 4).fill(`word${index}`).join(" "),
      actor: { kind: "user", id: "paul" }, idempotencyKey: `comment-${index}` });
    assert.ok(comment.accepted); return comment.comment.id;
  });
  const page = app.queryTaskHistory({ taskId, targetWords: 1000 });
  assert.ok(page.available);
  assert.deepEqual(page.history.records.map((entry) => entry.id), ids.slice(1));
  assert.equal(page.history.returned.words, 1300);
  assert.ok(page.history.nextCursor);
  const cursor = page.history.nextCursor;
  const older = app.queryTaskHistory({ taskId, cursor, targetWords: 1 });
  assert.ok(older.available);
  assert.equal(older.history.records[0]?.id, ids[0]);
  assert.equal(older.history.returned.words, 800);
  app.addTaskComment({ taskId, body: "Later arrival", actor: { kind: "user", id: "paul" }, idempotencyKey: "later" });
  assert.deepEqual(app.queryTaskHistory({ taskId, cursor, targetWords: 1 }), older);
  assert.deepEqual(app.queryTaskHistory({ taskId, cursor: "broken" }), { available: false, reason: "invalid-cursor" });
  await app.close(); app = await CoordinationApplication.start(options);
  assert.deepEqual(app.queryTaskHistory({ taskId, cursor, targetWords: 1 }), older);
  const inspected = app.queryTaskInspection(taskId, 1);
  assert.ok(inspected.available);
  assert.equal("comments" in inspected.task, false);
  assert.ok(inspected.task.history);
  assert.equal(inspected.task.history.records.length, 1);
  const continuation = inspected.task.history.nextCursor;
  if (continuation !== null) {
    const continued = app.queryTaskHistory({ taskId, cursor: continuation });
    assert.ok(continued.available);
    assert.ok(continued.history.records.every(({ id }) => !inspected.task.history.records.some((record) => record.id === id)));
  }
  const other = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Other", description: "Work",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "other" });
  assert.ok(other.accepted);
  assert.deepEqual(app.queryTaskHistory({ taskId: other.task.id, cursor }), { available: false, reason: "invalid-cursor" });
  assert.deepEqual(app.queryTaskHistory({ taskId, targetWords: 0 }), { available: false, reason: "invalid-target-words" });
  const anotherProject = await createHandoffFixture();
  const otherApp = await CoordinationApplication.start({ processDefinitionPath: anotherProject.definitionPath,
    databasePath: anotherProject.databasePath });
  t.after(() => otherApp.close());
  const sameId = otherApp.createTask({ boardId: "delivery", columnId: "implementation", title: "Separate project", description: "Work",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(sameId.accepted);
  assert.equal(sameId.task.id, taskId);
  assert.deepEqual(otherApp.queryTaskHistory({ taskId, cursor }), { available: false, reason: "invalid-cursor" });
});

test("substantive history reports compact completed and failed attempt outcomes", async (t) => {
  for (const status of ["completed", "failed"] as const) {
    const fixture = await createHandoffFixture();
    const runtime = new ControlledAgentRuntime();
    const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
      runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
    t.after(() => app.close());
    const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: status, description: "Work",
      actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
    assert.ok(created.accepted);
    await app.resumeAutomation();
    const request = await runtime.waitForRequest(1);
    await app.pauseAutomation();
    runtime.complete({ status, summary: `${status} compact outcome`, threadId: "history-thread" });
    await app.waitForAutomationIdle();
    const history = app.queryTaskHistory({ taskId: created.task.id });
    assert.ok(history.available);
    const outcome = history.history.records.find(({ type }) => type === "attempt.completed");
    assert.equal(outcome?.details?.outcome, status);
    assert.equal(outcome?.details?.summary, `${status} compact outcome`);
    assert.equal(outcome?.details?.attemptId, request.attemptId);
    assert.ok(!history.history.records.some(({ type }) => type === "attempt.started" || type === "activation.created"));
  }
});

test("equal timestamps retain cross-kind chronology and exhaust without gaps or duplication", async (t) => {
  const fixture = await createHandoffFixture();
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => app.close());
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-01T12:00:00Z") });
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Ties", description: "Work",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  for (const index of [1, 2, 3]) {
    assert.ok(app.addTaskComment({ taskId: created.task.id, body: `Comment ${index}`, actor: { kind: "user", id: "paul" },
      idempotencyKey: `comment-${index}` }).accepted);
  }
  const complete = app.queryTaskHistory({ taskId: created.task.id, targetWords: 10000 });
  assert.ok(complete.available);
  assert.equal(new Set(complete.history.records.map(({ at }) => at)).size, 1);
  assert.deepEqual(complete.history.records.map(({ type }) => type), ["comment", "comment", "comment", "task.created"]);
  const collected: string[] = [];
  let cursor: string | undefined;
  do {
    const query: TaskHistoryQuery = { taskId: created.task.id, targetWords: 1, ...(cursor === undefined ? {} : { cursor }) };
    const page = app.queryTaskHistory(query);
    assert.ok(page.available);
    assert.deepEqual(app.queryTaskHistory(query), page);
    collected.unshift(...page.history.records.map(({ id }) => id));
    cursor = page.history.nextCursor ?? undefined;
    if (cursor === undefined) assert.equal(page.history.remaining.records, 0);
  } while (cursor !== undefined);
  assert.deepEqual(collected, complete.history.records.map(({ id }) => id));
});

test("agent archive metadata defaults to twenty, continues and rejects excessive page sizes", async (t) => {
  const fixture = await createHandoffFixture();
  const definition = await readFile(fixture.definitionPath, "utf8");
  await writeFile(fixture.definitionPath, definition.replace("    columns:\n", "    columns:\n      - id: backlog\n        name: Backlog\n"));
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath });
  t.after(() => app.close());
  for (let index = 0; index < 21; index++) {
    const created = app.createTask({ boardId: "delivery", columnId: "backlog", title: `Archive ${index}`, description: "Work",
      actor: { kind: "user", id: "paul" }, idempotencyKey: `create-${index}` });
    assert.ok(created.accepted);
    assert.ok(app.moveTask({ taskId: created.task.id, destinationColumnId: "completion", expectedRevision: 1,
      actor: { kind: "user", id: "paul" }, idempotencyKey: `complete-${index}` }).accepted);
    assert.ok((await app.archiveTask({ taskId: created.task.id, actor: { kind: "user", id: "paul" },
      idempotencyKey: `archive-${index}` })).accepted);
  }
  const first = app.queryArchivedTaskOverviews({});
  assert.ok(first.available);
  assert.equal(first.tasks.length, 20);
  assert.ok(first.nextCursor);
  const last = app.queryArchivedTaskOverviews({ cursor: first.nextCursor });
  assert.ok(last.available);
  assert.equal(last.tasks.length, 1);
  assert.equal(last.nextCursor, null);
  assert.ok(!first.tasks.some(({ id }) => id === last.tasks[0]?.id));
  assert.deepEqual(app.queryArchivedTaskOverviews({ pageSize: 51 }), { available: false, reason: "invalid-page-size" });
});


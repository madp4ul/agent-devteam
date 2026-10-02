import assert from "node:assert/strict";
import test from "node:test";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { composeActivationPrompt } from "../../src/application/activation-prompt.ts";
import { createHandoffFixture, ControlledAgentRuntime } from "../support/handoff-fixture.ts";

test("activation composition bounds updates, stops once at 100 words, preserves exact source and resets omissions", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Boundary", description: "Work",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  const taskId = created.task.id;
  const add = (body: string, key: string, pinned = false) => {
    const result = app.addTaskComment({ taskId, body, pinned, actor: { kind: "user", id: "paul" }, idempotencyKey: key });
    assert.ok(result.accepted); return result.comment.id;
  };
  const olderId = add("Older complete discussion", "older", true);
  await app.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  await app.pauseAutomation();
  runtime.complete({ status: "completed", summary: "Initial outcome", threadId: "boundary-thread" });
  await app.waitForAutomationIdle();
  // Consume the completion event in a quiet activation before the measured interval.
  add("@implementer Prepare checkpoint", "prepare");
  await app.resumeAutomation(); await runtime.waitForRequest(2);
  // Queue updates while running; composition, not queue time, captures their boundary.
  const sourceId = add(Array(96).fill("@implementer").join(" "), "source");
  const newestId = add(Array(4996).fill("large").join(" "), "newest");
  runtime.complete({ status: "completed", summary: "Checkpoint outcome", threadId: "boundary-thread" });
  const next = await runtime.waitForRequest(3);
  assert.ok(next.activationContext.history);
  assert.equal(next.activationContext.history.returned.words >= 5000, true);
  assert.ok(next.activationContext.history.records.some(({ id }) => id === newestId));
  assert.ok(!next.activationContext.history.records.some(({ id }) => id === sourceId));
  assert.ok(next.activationContext.history.nextCursor);
  const cursor = next.activationContext.history.nextCursor;
  assert.equal(next.activationContext.history.remaining.words, 100);
  assert.deepEqual(next.activationContext.fullHistory?.included, next.activationContext.history.returned);
  assert.equal(next.activationContext.fullHistory!.total.words,
    next.activationContext.fullHistory!.included.words + next.activationContext.fullHistory!.omitted.words);
  const updates = app.queryTaskHistory({ taskId, cursor, targetWords: 1000 });
  assert.ok(updates.available);
  assert.ok(updates.history.records.some(({ id }) => id === sourceId));
  assert.equal(updates.history.returned.words, 100);
  assert.equal(updates.history.checkpointReached, true);
  assert.equal(updates.history.continuation, "older-history");
  assert.ok(updates.history.nextCursor);
  const older = app.queryTaskHistory({ taskId, cursor: updates.history.nextCursor });
  assert.ok(older.available);
  assert.ok(older.history.records.some(({ id }) => id === olderId));
  assert.ok(!older.history.records.some(({ id }) => id === newestId || id === sourceId));
  assert.deepEqual(app.queryTaskHistory({ taskId, cursor, targetWords: 1000 }), updates);
  const prompt = composeActivationPrompt(next);
  assert.equal(prompt.split(Array(96).fill("@implementer").join(" ")).length - 1, 1);
  assert.doesNotMatch(prompt, /Older complete discussion/);
  add("@implementer New interval only", "following");
  runtime.complete({ status: "completed", summary: "Done", threadId: "boundary-thread" });
  const following = await runtime.waitForRequest(4);
  assert.ok(!following.activationContext.history?.records.some(({ id }) => id === sourceId || id === newestId));
  await app.pauseAutomation(); runtime.complete({ status: "completed", summary: "Done", threadId: "boundary-thread" });
  await app.waitForAutomationIdle();
});

test("activation pin delivery compares net membership, includes old guidance and deduplicates history overlap", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Pin matrix", description: "Stable description",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  const taskId = created.task.id;
  const add = (body: string, key: string, pinned = false) => {
    const result = app.addTaskComment({ taskId, body, pinned, actor: { kind: "user", id: "paul" }, idempotencyKey: key });
    assert.ok(result.accepted); return result.comment.id;
  };
  const absent = add("Transient guidance", "absent");
  const removed = add("Removed emphasis", "removed", true);
  const added = add("Old newly important guidance", "added");
  const stable = add("Stable pinned guidance", "stable", true);
  await app.resumeAutomation();
  const first = await runtime.waitForRequest(1);
  assert.deepEqual(first.activationContext.pinChanges?.pinned.map(({ id }) => id), [removed, stable]);
  let key = 0;
  const pin = (commentId: string, pinned: boolean) => assert.ok(app.setTaskCommentPin({ taskId, commentId, pinned,
    actor: { kind: "user", id: "paul" }, idempotencyKey: `pin-${key++}` }).accepted);
  pin(absent, true); pin(absent, false);
  pin(removed, false);
  pin(added, true);
  pin(stable, false); pin(stable, true);
  add(Array(5000).fill("recent").join(" "), "recent");
  const overlapBody = "@implementer Current pinned request";
  const overlap = add(overlapBody, "overlap", true);
  runtime.complete({ status: "completed", summary: "First outcome", threadId: "pins-thread" });
  const next = await runtime.waitForRequest(2);
  assert.deepEqual(next.activationContext.pinChanges?.pinned.map(({ id }) => id), [added, overlap]);
  assert.deepEqual(next.activationContext.pinChanges?.unpinned, [removed]);
  assert.ok(!next.activationContext.history?.records.some(({ type }) => type === "comment.pinned" || type === "comment.unpinned"));
  const prompt = composeActivationPrompt(next);
  assert.equal(prompt.split("Old newly important guidance").length - 1, 1);
  assert.equal(prompt.split(overlapBody).length - 1, 1);
  assert.doesNotMatch(prompt, /Stable pinned guidance|Transient guidance|Removed emphasis/);
  assert.ok(next.activationContext.replacement?.pinnedComments.some(({ id }) => id === stable));
  add("@implementer Quick follow-up", "quick");
  runtime.complete({ status: "completed", summary: "Second outcome", threadId: "pins-thread" });
  const quick = await runtime.waitForRequest(3);
  assert.deepEqual(quick.activationContext.pinChanges, { pinned: [], unpinned: [] });
  assert.equal(quick.activationContext.description, undefined);
  assert.equal(quick.activationContext.history?.remaining.records, 0);
  assert.equal(quick.activationContext.history?.continuation, "older-history");
  assert.ok(quick.activationContext.history?.nextCursor);
  const earlier = app.queryTaskHistory({ taskId, cursor: quick.activationContext.history.nextCursor });
  assert.ok(earlier.available);
  assert.ok(earlier.history.records.length > 0);
  assert.doesNotMatch(composeActivationPrompt(quick), /Stable description|Old newly important guidance|Stable pinned guidance|# Coordination framework/);
  await app.pauseAutomation(); runtime.complete({ status: "completed", summary: "Done", threadId: "pins-thread" });
  await app.waitForAutomationIdle();
});

test("a long-lived task gives a fresh conversation all pins but only recent bounded discussion", async (t) => {
  const fixture = await createHandoffFixture();
  const runtime = new ControlledAgentRuntime();
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
    runtimeDispatch: { projectRepositoryPath: fixture.repositoryPath, taskWorkspaceRoot: fixture.workspaceRoot, agentRuntime: runtime } });
  t.after(() => app.close());
  const created = app.createTask({ boardId: "delivery", columnId: "implementation", title: "Long-lived", description: "Current authoritative facts",
    actor: { kind: "user", id: "paul" }, idempotencyKey: "create" });
  assert.ok(created.accepted);
  const taskId = created.task.id;
  const ids: string[] = [];
  for (let index = 0; index < 12; index++) {
    const comment = app.addTaskComment({ taskId, body: Array(596).fill(`discussion-${index}`).join(" "), pinned: index === 0,
      actor: { kind: "user", id: "paul" }, idempotencyKey: `comment-${index}` });
    assert.ok(comment.accepted); ids.push(comment.comment.id);
  }
  await app.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  assert.deepEqual(request.activationContext.history?.records.map(({ id }) => id), ids.slice(-4));
  assert.equal(request.activationContext.history?.returned.words, 2400);
  assert.equal(request.activationContext.history?.remaining.comments, 8);
  assert.deepEqual(request.activationContext.pinChanges?.pinned.map(({ id }) => id), ids.slice(0, 1));
  const blocks = [...composeActivationPrompt(request).matchAll(/```json\n([\s\S]*?)\n```/gu)]
    .map((match) => JSON.parse(match[1]!));
  assert.equal(blocks[0].task.description, "Current authoritative facts");
  assert.equal(blocks[0].pins.pinned[0].id, ids[0]);
  assert.ok(blocks[0].history.remaining.words > 0);
  await app.pauseAutomation(); runtime.complete({ status: "completed", summary: "Done", threadId: "fresh-long-lived" });
  await app.waitForAutomationIdle();
});

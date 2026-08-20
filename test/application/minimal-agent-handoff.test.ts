import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
  AttemptTokenUsage,
} from "../../src/application/runtime-contract.ts";

const execFileAsync = promisify(execFile);
import {
  ControlledAgentRuntime,
  createHandoffFixture,
  PausedRetryClock,
} from "../support/handoff-fixture.ts";

test("an agent comment and move hand work to the next watched-column agent", async (t) => {
  const fixture = await createHandoffFixture();
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
    title: "Complete the handoff",
    description: "Leave an implementation note and move the task to review.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-handoff-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  const implementation = await runtime.waitForRequest(1);
  assert.equal(implementation.agent.id, "implementer");
  assert.deepEqual(
    { model: implementation.agent.model, reasoningEffort: implementation.agent.reasoningEffort },
    { model: "gpt-5.6-sol", reasoningEffort: "medium" },
  );
  assert.equal(implementation.process.guidance, "Keep every handoff explicit.");
  assert.equal(implementation.board.guidance, "Move completed work to review.");
  assert.deepEqual(
    implementation.collaborators.map((agent) => ({ id: agent.id, summary: agent.summary })),
    [
      { id: "implementer", summary: "Builds the requested change." },
      { id: "reviewer", summary: "Reviews completed changes." },
    ],
  );
  assert.deepEqual(implementation.task.comments, []);
  assert.deepEqual(implementation.task.relationships, []);
  assert.deepEqual(implementation.attempt, {
    number: 1,
    precedingOutcome: null,
    thread: "fresh",
    continuationMessage: null,
  });

  const comment = application.addTaskComment({
    taskId: created.task.id,
    body: "Implementation is complete and the focused tests pass.",
    actor: { kind: "agent", id: "implementer" },
    attemptId: implementation.attemptId,
    idempotencyKey: "implementation-comment",
  });
  assert.equal(comment.accepted, true);
  if (!comment.accepted) return;
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: comment.task.revision,
    actor: { kind: "agent", id: "implementer" },
    attemptId: implementation.attemptId,
    idempotencyKey: "implementation-to-review",
  });
  assert.equal(moved.accepted, true);

  runtime.complete({
    status: "completed",
    summary: "Commented and handed the task to review.",
    threadId: "thread-implementation",
  });
  const review = await runtime.waitForRequest(2);
  assert.equal(review.agent.id, "reviewer");
  assert.deepEqual(
    { model: review.agent.model, reasoningEffort: review.agent.reasoningEffort },
    { model: "gpt-5.6-terra", reasoningEffort: "high" },
  );
  assert.equal(review.task.columnId, "review");
  assert.equal(review.task.comments[0]?.attemptId, implementation.attemptId);
  assert.equal(
    review.task.activity.find((event) => event.type === "task.moved")?.details.attemptId,
    implementation.attemptId,
  );
  assert.deepEqual(
    review.task.comments.map((entry) => ({ body: entry.body, actor: entry.actor })),
    [
      {
        body: "Implementation is complete and the focused tests pass.",
        actor: { kind: "agent", id: "implementer" },
      },
    ],
  );
  assert.doesNotMatch(
    review.task.activity.map((event) => event.type).join(" "),
    /comment/,
  );
  const duringReview = application.queryTask(created.task.id);
  assert.equal(duringReview.available, true);
  if (duringReview.available) {
    assert.equal(duringReview.task.activations[0]?.status, "completed");
    assert.equal(duringReview.task.activations[0]?.attempts[0]?.threadId, "thread-implementation");
    assert.equal(duringReview.task.activations[1]?.status, "running");
    assert.ok(duringReview.task.activations[0]?.conversationId);
    assert.ok(duringReview.task.activations[1]?.conversationId);
    assert.notEqual(
      duringReview.task.activations[0]?.conversationId,
      duringReview.task.activations[1]?.conversationId,
    );
  }

  runtime.complete({
    status: "completed",
    summary: "Review complete.",
    threadId: "thread-review",
  });
  await application.waitForAutomationIdle();
});

test("agent command idempotency replays stay scoped to the current task", async (t) => {
  const fixture = await createHandoffFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(() => application.close());
  const first = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "First scoped task",
    description: "Never expose this task through another task's replay.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-first-scoped-task",
  });
  const second = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Second scoped task",
    description: "Reuse the agent's natural idempotency key safely.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-second-scoped-task",
  });
  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  if (!first.accepted || !second.accepted) return;

  const firstComment = application.addTaskComment({
    taskId: first.task.id,
    body: "First task comment",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "comment-on-current-task",
  });
  const secondComment = application.addTaskComment({
    taskId: second.task.id,
    body: "Second task comment",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "comment-on-current-task",
  });
  assert.equal(firstComment.accepted, true);
  assert.equal(secondComment.accepted, true);
  if (firstComment.accepted && secondComment.accepted) {
    assert.equal(firstComment.task.id, first.task.id);
    assert.equal(secondComment.task.id, second.task.id);
  }

  const firstMove = application.moveTask({
    taskId: first.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "move-current-task-to-review",
  });
  const secondMove = application.moveTask({
    taskId: second.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "move-current-task-to-review",
  });
  assert.equal(firstMove.accepted, true);
  assert.equal(secondMove.accepted, true);
  if (firstMove.accepted && secondMove.accepted) {
    assert.equal(firstMove.task.id, first.task.id);
    assert.equal(secondMove.task.id, second.task.id);
  }
});

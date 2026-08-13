import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("one comment activates each mentioned agent once in textual mention order", async (t) => {
  const fixture = await createFixture("mention-order");
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Consult both specialists",
    description: "Keep primary responsibility in backlog.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-consultation",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const commented = application.addTaskComment({
    taskId: created.task.id,
    body: "Please review the boundary @reviewer, then check the design @architect. @reviewer can use the design response.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "request-consultation",
  });

  assert.equal(commented.accepted, true);
  if (!commented.accepted) return;
  assert.equal(commented.task.columnId, "backlog");
  assert.equal(commented.task.revision, 1);
  assert.deepEqual(
    commented.task.activations.map((activation) => ({
      targetAgentId: activation.targetAgentId,
      reason: activation.reason,
    })),
    [
      {
        targetAgentId: "reviewer",
        reason: { type: "agent-mention", sourceEventId: commented.comment.id },
      },
      {
        targetAgentId: "architect",
        reason: { type: "agent-mention", sourceEventId: commented.comment.id },
      },
    ],
  );
});

test("a controlled consultation distinguishes prose from deliberate executable requests", async (t) => {
  const fixture = await createFixture("controlled-consultation");
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Consult without duplicate expectations",
    description: "Keep primary responsibility visible while specialists exchange bounded requests.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-controlled-consultation",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const prose = application.addTaskComment({
    taskId: created.task.id,
    body: "No implementation defect requires return to Implementation Agent; Code Reviewer is only being discussed.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "non-executable-prose",
  });
  assert.equal(prose.accepted, true);
  if (!prose.accepted) return;
  assert.deepEqual(prose.task.activations, []);

  const request = application.addTaskComment({
    taskId: created.task.id,
    body: "Please inspect the revised boundary @reviewer.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "one-deliberate-request",
  });
  assert.equal(request.accepted, true);
  if (!request.accepted) return;
  assert.deepEqual(request.task.activations.map((activation) => activation.targetAgentId), ["reviewer"]);

  const satisfied = application.addTaskComment({
    taskId: created.task.id,
    body: "The boundary is sound. Implementation Agent does not need another response.",
    actor: { kind: "agent", id: "reviewer" },
    idempotencyKey: "consultation-satisfied-inertly",
  });
  assert.equal(satisfied.accepted, true);
  if (!satisfied.accepted) return;
  assert.deepEqual(satisfied.task.activations.map((activation) => activation.targetAgentId), ["reviewer"]);
  assert.equal(satisfied.task.comments.at(-1)?.body.includes("@reviewer"), false);

  const revisionRequest = application.addTaskComment({
    taskId: created.task.id,
    body: "A separate validation gap now needs correction. @implementer please revise it.",
    actor: { kind: "agent", id: "reviewer" },
    idempotencyKey: "canonical-reply-when-needed",
  });
  assert.equal(revisionRequest.accepted, true);
  if (!revisionRequest.accepted) return;
  const pendingStatus = application.addTaskComment({
    taskId: created.task.id,
    body: "The revision request for Implementation Agent remains pending.",
    actor: { kind: "agent", id: "reviewer" },
    idempotencyKey: "do-not-repeat-pending-request",
  });
  assert.equal(pendingStatus.accepted, true);
  if (!pendingStatus.accepted) return;
  assert.deepEqual(
    pendingStatus.task.activations.map((activation) => activation.targetAgentId),
    ["reviewer", "implementer"],
  );
  assert.equal(
    pendingStatus.task.comments
      .filter((comment) => comment.actor.kind === "agent" && comment.actor.id === "reviewer")
      .some((comment) => comment.body.includes("@reviewer")),
    false,
  );
});

test("email-like text, inline code, and unknown identities do not address participants", async (t) => {
  const fixture = await createFixture("non-executable-mention-text");
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Describe mentions without invoking them",
    description: "Only canonical requests outside code activate participants.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-non-executable-text",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const commented = application.addTaskComment({
    taskId: created.task.id,
    body: "Email reviewer@example.test, document `@reviewer`, and ignore @removed. @architect please decide.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "comment-non-executable-text",
  });

  assert.equal(commented.accepted, true);
  if (!commented.accepted) return;
  assert.deepEqual(commented.task.activations.map((activation) => activation.targetAgentId), ["architect"]);
});

test("a user mention creates one durable attention reason that only mark-addressed resolves", async (t) => {
  const fixture = await createFixture("user-attention");
  const first = await CoordinationApplication.start(fixture);
  const created = first.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Choose a compatibility policy",
    description: "The user must make the final decision.",
    actor: { kind: "agent", id: "architect" },
    idempotencyKey: "create-decision",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const commented = first.addTaskComment({
    taskId: created.task.id,
    body: "@user please choose strict or permissive compatibility. Repeating @user must not duplicate this request.",
    actor: { kind: "agent", id: "architect" },
    idempotencyKey: "request-user-decision",
  });
  assert.equal(commented.accepted, true);
  if (!commented.accepted) return;
  assert.deepEqual(commented.task.activations, []);
  first.close();

  const restarted = await CoordinationApplication.start(fixture);
  t.after(() => restarted.close());
  const attention = restarted.queryNeedsAttention();
  assert.equal(attention.available, true);
  if (!attention.available) return;
  assert.deepEqual(attention.tasks, [
    {
      task: {
        id: created.task.id,
        title: "Choose a compatibility policy",
        boardId: "delivery",
        boardName: "Delivery",
        columnId: "backlog",
      },
      reasons: [
        {
          id: attention.tasks[0]?.reasons[0]?.id,
          type: "user-mention",
          sourceEventId: commented.comment.id,
          createdAt: attention.tasks[0]?.reasons[0]?.createdAt,
        },
      ],
    },
  ]);

  const reasonId = attention.tasks[0]?.reasons[0]?.id;
  assert.ok(reasonId);
  restarted.addTaskComment({
    taskId: created.task.id,
    body: "I am investigating this request without resolving it yet.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "investigate-request",
  });
  const moved = restarted.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-unresolved-request",
  });
  assert.equal(moved.accepted, true);
  const stillUnresolved = restarted.queryNeedsAttention();
  assert.equal(stillUnresolved.available, true);
  if (stillUnresolved.available) {
    assert.deepEqual(stillUnresolved.tasks[0]?.reasons.map((reason) => reason.id), [reasonId]);
  }
  const addressed = restarted.markUserMentionAddressed({
    attentionReasonId: reasonId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "address-user-mention",
  });
  assert.equal(addressed.accepted, true);
  assert.deepEqual(restarted.markUserMentionAddressed({
    attentionReasonId: reasonId,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "address-user-mention",
  }), addressed);
  const resolved = restarted.queryNeedsAttention();
  assert.equal(resolved.available, true);
  if (resolved.available) assert.deepEqual(resolved.tasks, []);
  const history = restarted.queryTask(created.task.id);
  assert.equal(history.available, true);
  if (history.available) {
    assert.deepEqual(
      history.task.activity
        .filter((event) => event.type.startsWith("attention."))
        .map((event) => ({ type: event.type, attentionReasonId: event.details.attentionReasonId })),
      [
        { type: "attention.created", attentionReasonId: reasonId },
        { type: "attention.resolved", attentionReasonId: reasonId },
      ],
    );
  }
});

test("an agent ID beginning with user is an agent mention rather than a user mention", async (t) => {
  const fixture = await createFixture("user-prefix-agent");
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Consult the user-experience reviewer",
    description: "Stable agent IDs must be tokenized exactly.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-user-prefix-agent",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const commented = application.addTaskComment({
    taskId: created.task.id,
    body: "@user-reviewer please inspect the interaction.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "mention-user-prefix-agent",
  });
  assert.equal(commented.accepted, true);
  if (!commented.accepted) return;
  assert.deepEqual(commented.task.activations.map((activation) => activation.targetAgentId), [
    "user-reviewer",
  ]);
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) assert.deepEqual(inspection.task.unresolvedAttention, []);
});

test("agent consultation can round-trip in watched and Completion columns without moving the task", async (t) => {
  const fixture = await createFixture("consultation-round-trip");
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const watched = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Review during implementation",
    description: "The consultation must not change primary responsibility.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-watched-consultation",
  });
  const completed = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Review completed evidence",
    description: "Completed work remains available for consultation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-completed-consultation",
  });
  assert.equal(watched.accepted, true);
  assert.equal(completed.accepted, true);
  if (!watched.accepted || !completed.accepted) return;
  const movedToCompletion = application.moveTask({
    taskId: completed.task.id,
    destinationColumnId: "completion",
    expectedRevision: completed.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-consultation-task",
  });
  assert.equal(movedToCompletion.accepted, true);
  if (!movedToCompletion.accepted) return;

  const request = application.addTaskComment({
    taskId: watched.task.id,
    body: "@reviewer please check this boundary.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "watched-request",
  });
  assert.equal(request.accepted, true);
  if (!request.accepted) return;
  const response = application.addTaskComment({
    taskId: watched.task.id,
    body: "The boundary is sound. @implementer can continue.",
    actor: { kind: "agent", id: "reviewer" },
    idempotencyKey: "watched-response",
  });
  const completedRequest = application.addTaskComment({
    taskId: movedToCompletion.task.id,
    body: "@architect please verify the completed design evidence.",
    actor: { kind: "agent", id: "reviewer" },
    idempotencyKey: "completed-request",
  });
  assert.equal(response.accepted, true);
  assert.equal(completedRequest.accepted, true);
  if (!response.accepted || !completedRequest.accepted) return;
  assert.equal(response.task.columnId, "implementation");
  assert.deepEqual(
    response.task.activations.map((activation) => activation.targetAgentId),
    ["implementer", "reviewer", "implementer"],
  );
  assert.equal(completedRequest.task.columnId, "completion");
  assert.deepEqual(
    completedRequest.task.activations.map((activation) => activation.targetAgentId),
    ["architect"],
  );
});

test("an agent mention on an unmapped task remains authored text without creating an activation", async (t) => {
  const fixture = await createFixture("unmapped-mention");
  const first = await CoordinationApplication.start(fixture);
  const created = first.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve an unmapped consultation",
    description: "Removing the saved column must prevent new agent runs.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-unmapping",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  first.close();
  await writeFile(
    fixture.processDefinitionPath,
    `schemaVersion: 1
name: Consultation process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Make consultations visible.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements work
    summary: Builds changes.
    instructions: ./implementer.md
  - id: reviewer
    name: Code Reviewer
    role: Reviews code
    summary: Reviews implementation quality.
    instructions: ./reviewer.md
  - id: architect
    name: Architecture Designer
    role: Reviews architecture
    summary: Reviews design boundaries.
    instructions: ./architect.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep responsibility explicit.
    columns:
      - id: backlog
        name: Backlog
`,
  );
  const restarted = await CoordinationApplication.start(fixture);
  t.after(() => restarted.close());

  const commented = restarted.addTaskComment({
    taskId: created.task.id,
    body: "@reviewer this request must remain visible but inert.",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "comment-on-unmapped-task",
  });
  assert.equal(commented.accepted, true);
  if (!commented.accepted) return;
  assert.equal(commented.task.comments.at(-1)?.body, "@reviewer this request must remain visible but inert.");
  assert.deepEqual(
    commented.task.activations.map((activation) => activation.targetAgentId),
    ["implementer"],
  );
});

async function createFixture(name: string): Promise<{
  processDefinitionPath: string;
  databasePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `coordination-${name}-`));
  await Promise.all([
    writeFile(join(directory, "implementer.md"), "Implement work.\n"),
    writeFile(join(directory, "reviewer.md"), "Review work.\n"),
    writeFile(join(directory, "architect.md"), "Review architecture.\n"),
    writeFile(join(directory, "user-reviewer.md"), "Review user experience.\n"),
  ]);
  const processDefinitionPath = join(directory, "process.yaml");
  await writeFile(
    processDefinitionPath,
    `schemaVersion: 1
name: Consultation process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Make consultations visible.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements work
    summary: Builds changes.
    instructions: ./implementer.md
  - id: reviewer
    name: Code Reviewer
    role: Reviews code
    summary: Reviews implementation quality.
    instructions: ./reviewer.md
  - id: architect
    name: Architecture Designer
    role: Reviews architecture
    summary: Reviews design boundaries.
    instructions: ./architect.md
  - id: user-reviewer
    name: User Experience Reviewer
    role: Reviews user experience
    summary: Reviews interaction quality.
    instructions: ./user-reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep responsibility explicit.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );
  return {
    processDefinitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  };
}

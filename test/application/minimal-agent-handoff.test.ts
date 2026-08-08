import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRunLifecycle,
  type AgentRuntime,
  type AutomationClock,
  CoordinationApplication,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);

test("an agent comment and move hand work to the next watched-column agent", async (t) => {
  const fixture = await createFixture();
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
    idempotencyKey: "implementation-comment",
  });
  assert.equal(comment.accepted, true);
  if (!comment.accepted) return;
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: comment.task.revision,
    actor: { kind: "agent", id: "implementer" },
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
  }

  runtime.complete({
    status: "completed",
    summary: "Review complete.",
    threadId: "thread-review",
  });
  await application.waitForAutomationIdle();
});

test("a streamed Codex failure remains inspectable while its retry waits at the queue head", async (t) => {
  const fixture = await createFixture();
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    automationClock: new PausedRetryClock(),
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
    title: "Retain the failed handoff",
    description: "The failed Codex stream must remain inspectable.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-failed-handoff",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  await application.resumeAutomation();
  await runtime.waitForRequest(1);
  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "queue-review-behind-failing-implementation",
  });
  assert.equal(moved.accepted, true);
  runtime.complete({
    status: "failed",
    summary: "Codex could not complete the activation: model stream disconnected",
    threadId: "thread-failed-handoff",
  });
  await new Promise<void>((resolve) => setImmediate(resolve));

  const failed = application.queryTask(created.task.id);
  assert.equal(failed.available, true);
  if (!failed.available) return;
  assert.equal(failed.task.activations[0]?.status, "queued");
  assert.equal(failed.task.activations[0]?.recovery?.state, "scheduled");
  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.deepEqual(inspection.task.currentActivation, {
      targetAgentId: "implementer",
      model: "gpt-5.6-sol",
      reasoningEffort: "medium",
    });
  }
  assert.deepEqual(failed.task.activations[0]?.attempts[0], {
    id: failed.task.activations[0]?.attempts[0]?.id,
    status: "failed",
    workspacePath: join(fixture.workspaceRoot, created.task.id),
    startedAt: failed.task.activations[0]?.attempts[0]?.startedAt,
    completedAt: failed.task.activations[0]?.attempts[0]?.completedAt,
    outcome: {
      status: "failed",
      summary: "Codex could not complete the activation: model stream disconnected",
    },
    threadId: "thread-failed-handoff",
    model: "gpt-5.6-sol",
    reasoningEffort: "medium",
  });
});

test("agent command idempotency replays stay scoped to the current task", async (t) => {
  const fixture = await createFixture();
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

class ControlledAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];
  #complete: ((outcome: AgentRunOutcome) => void) | undefined;
  readonly #waiters: Array<{
    count: number;
    resolve: (request: AgentRunRequest) => void;
  }> = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started();
    for (const waiter of this.#waiters.splice(0)) {
      const matching = this.requests[waiter.count - 1];
      if (matching !== undefined) waiter.resolve(matching);
      else this.#waiters.push(waiter);
    }
    return new Promise((resolve) => {
      this.#complete = resolve;
    });
  }

  waitForRequest(count: number): Promise<AgentRunRequest> {
    const existing = this.requests[count - 1];
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve) => this.#waiters.push({ count, resolve }));
  }

  complete(outcome: AgentRunOutcome): void {
    assert.ok(this.#complete);
    this.#complete(outcome);
    this.#complete = undefined;
  }
}

class PausedRetryClock implements AutomationClock {
  now(): Date {
    return new Date("2026-01-01T12:00:00.000Z");
  }

  waitUntil(): Promise<void> {
    return new Promise(() => {});
  }
}

async function createFixture(): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-handoff-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Test project\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Coordination Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Initial commit",
  ]);
  await writeFile(join(directory, "implementer.md"), "Implement and hand off the task.\n");
  await writeFile(join(directory, "reviewer.md"), "Review the completed implementation.\n");
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Handoff process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep every handoff explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tasks
    summary: Builds the requested change.
    instructions: ./implementer.md
    model: gpt-5.6-sol
    reasoningEffort: medium
  - id: reviewer
    name: Code Reviewer
    role: Reviews implementations
    summary: Reviews completed changes.
    instructions: ./reviewer.md
    model: gpt-5.6-terra
    reasoningEffort: high
boards:
  - id: delivery
    name: Delivery
    guidance: Move completed work to review.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

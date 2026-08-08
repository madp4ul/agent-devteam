import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { Worker } from "node:worker_threads";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type {
  AddTaskCommentResult,
  BoardMutationResult,
  TaskRelationshipMutationResult,
} from "../../src/application/coordination-contract.ts";
import {
  READY_COUNT_INDEX,
  RELEASED,
  RELEASE_INDEX,
  type ConcurrentApplicationOperation,
} from "../support/concurrent-application-operation.ts";

test("competing application instances preserve conflicts, additive comments, and idempotent commands", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-concurrency-"));
  const definitionPath = join(directory, "process.yaml");
  const databasePath = join(directory, "coordination.sqlite3");
  await writeFile(join(directory, "implementer.md"), "Implement the requested task.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Concurrency process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Coordinate changes without overwriting other participants.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements tasks
    summary: Builds changes.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );
  const firstApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  t.after(() => firstApplication.close());

  const source = firstApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Coordinate this task",
    description: "Competing mutable commands must not overwrite one another.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-concurrency-source",
  });
  const target = firstApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Related task",
    description: "Relationship retries must remain singular.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-concurrency-target",
  });
  const retriedMoveTask = firstApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Move exactly once",
    description: "A concurrent transport retry must create one move and activation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-retried-move-task",
  });
  assert.equal(source.accepted, true);
  assert.equal(target.accepted, true);
  assert.equal(retriedMoveTask.accepted, true);
  if (!source.accepted || !target.accepted || !retriedMoveTask.accepted) return;

  const [move, edit] = (await runConcurrently(definitionPath, databasePath, [
    {
      method: "moveTask",
      command: {
        taskId: source.task.id,
        destinationColumnId: "implementation",
        expectedRevision: source.task.revision,
        actor: { kind: "user", id: "paul" },
        idempotencyKey: "competing-move",
      },
    },
    {
      method: "editTask",
      command: {
        taskId: source.task.id,
        title: "Overlapping edit",
        description: "This stale edit must return the winning current state.",
        expectedRevision: source.task.revision,
        actor: { kind: "user", id: "alex" },
        idempotencyKey: "competing-edit",
      },
    },
  ])) as [BoardMutationResult, BoardMutationResult];
  assert.equal([move, edit].filter(({ accepted }) => accepted).length, 1);
  const conflict = [move, edit].find(({ accepted }) => !accepted);
  assert.ok(conflict && !conflict.accepted && conflict.reason === "revision-conflict");
  if (conflict.accepted || conflict.reason !== "revision-conflict") return;
  assert.equal(conflict.currentTask.revision, 2);
  if (move.accepted) {
    assert.equal(conflict.currentTask.columnId, "implementation");
    assert.equal(conflict.currentTask.title, "Coordinate this task");
    assert.deepEqual(
      conflict.currentTask.activity.map(({ type }) => type),
      ["task.created", "task.moved", "activation.created"],
    );
  } else {
    assert.equal(edit.accepted, true);
    assert.equal(conflict.currentTask.columnId, "backlog");
    assert.equal(conflict.currentTask.title, "Overlapping edit");
    assert.deepEqual(
      conflict.currentTask.activity.map(({ type }) => type),
      ["task.created", "task.edited"],
    );
  }

  const repeatedComment = {
    taskId: source.task.id,
    body: "One retried transport comment.",
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "repeated-comment",
  };
  const [firstReplay, secondReplay] = (await runConcurrently(definitionPath, databasePath, [
    { method: "addTaskComment", command: repeatedComment },
    { method: "addTaskComment", command: repeatedComment },
  ])) as [AddTaskCommentResult, AddTaskCommentResult];
  assert.deepEqual(secondReplay, firstReplay);

  const distinctComments = (await runConcurrently(definitionPath, databasePath, [
    {
      method: "addTaskComment",
      command: {
        ...repeatedComment,
        body: "A distinct concurrent observation.",
        idempotencyKey: "distinct-comment-one",
      },
    },
    {
      method: "addTaskComment",
      command: {
        ...repeatedComment,
        body: "Another distinct concurrent observation.",
        actor: { kind: "user" as const, id: "alex" },
        idempotencyKey: "distinct-comment-two",
      },
    },
  ])) as AddTaskCommentResult[];
  assert.ok(distinctComments.every((result) => result.accepted));
  const commented = firstApplication.queryTask(source.task.id);
  assert.equal(commented.available, true);
  if (!commented.available) return;
  assert.equal(commented.task.comments[0]?.body, "One retried transport comment.");
  assert.deepEqual(
    new Set(commented.task.comments.slice(1).map(({ body }) => body)),
    new Set([
      "A distinct concurrent observation.",
      "Another distinct concurrent observation.",
    ]),
  );
  assert.equal(commented.task.revision, 2, "additive comments do not consume task revisions");

  const retriedMove = {
    method: "moveTask" as const,
    command: {
      taskId: retriedMoveTask.task.id,
      destinationColumnId: "implementation",
      expectedRevision: retriedMoveTask.task.revision,
      actor: { kind: "user" as const, id: "paul" },
      idempotencyKey: "concurrently-retried-move",
    },
  };
  const [firstMoveReplay, secondMoveReplay] = (await runConcurrently(
    definitionPath,
    databasePath,
    [retriedMove, retriedMove],
  )) as [BoardMutationResult, BoardMutationResult];
  assert.deepEqual(secondMoveReplay, firstMoveReplay);
  assert.equal(firstMoveReplay.accepted, true);
  const movedOnce = firstApplication.queryTask(retriedMoveTask.task.id);
  assert.equal(movedOnce.available, true);
  if (movedOnce.available) {
    assert.equal(movedOnce.task.revision, 2);
    assert.equal(movedOnce.task.activity.filter(({ type }) => type === "task.moved").length, 1);
    assert.equal(
      movedOnce.task.activity.filter(({ type }) => type === "activation.created").length,
      1,
    );
    assert.equal(movedOnce.task.activations.length, 1);
  }

  const relationshipCommand = {
    type: "dependency" as const,
    sourceTaskId: source.task.id,
    targetTaskId: target.task.id,
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "concurrent-relationship-one",
  };
  const [firstRelationship, competingRelationship] = (await runConcurrently(
    definitionPath,
    databasePath,
    [
      { method: "createTaskRelationship", command: relationshipCommand },
      {
        method: "createTaskRelationship",
        command: {
          ...relationshipCommand,
          actor: { kind: "user", id: "alex" },
          idempotencyKey: "concurrent-relationship-two",
        },
      },
    ],
  )) as [TaskRelationshipMutationResult, TaskRelationshipMutationResult];
  assert.equal(
    [firstRelationship, competingRelationship].filter(({ accepted }) => accepted).length,
    1,
  );
  assert.deepEqual(
    [firstRelationship, competingRelationship].find(({ accepted }) => !accepted),
    { accepted: false, reason: "duplicate-relationship" },
  );
  const related = firstApplication.queryTask(source.task.id);
  assert.equal(related.available, true);
  if (related.available) {
    assert.equal(related.task.relationships.length, 1);
    assert.equal(
      related.task.activity.filter(({ type }) => type === "relationship.created").length,
      1,
    );
  }
});

async function runConcurrently(
  processDefinitionPath: string,
  databasePath: string,
  operations: [ConcurrentApplicationOperation, ConcurrentApplicationOperation],
): Promise<unknown[]> {
  const barrier = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const state = new Int32Array(barrier);
  const workers = operations.map(
    (operation) =>
      new Worker(new URL("../support/concurrent-application-command.ts", import.meta.url), {
        execArgv: ["--experimental-strip-types"],
        workerData: { processDefinitionPath, databasePath, barrier, operation },
      }),
  );
  try {
    const results = workers.map((worker) => resultFrom(worker));
    while (Atomics.load(state, READY_COUNT_INDEX) < workers.length) {
      const observed = Atomics.load(state, READY_COUNT_INDEX);
      await Atomics.waitAsync(state, READY_COUNT_INDEX, observed, 1_000).value;
    }
    Atomics.store(state, RELEASE_INDEX, RELEASED);
    Atomics.notify(state, RELEASE_INDEX, workers.length);
    return await Promise.all(results);
  } finally {
    await Promise.all(workers.map((worker) => worker.terminate()));
  }
}

function resultFrom(worker: Worker): Promise<unknown> {
  return new Promise((resolve, reject) => {
    worker.on("message", (message: { type: string; result?: unknown }) => {
      if (message.type === "result") resolve(message.result);
    });
    worker.on("error", reject);
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`Concurrent command worker exited with code ${code}`));
    });
  });
}

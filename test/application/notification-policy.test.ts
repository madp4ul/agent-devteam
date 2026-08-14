import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("notification policy defaults once per stable column identity and persists immediately", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-notification-policy-"));
  const definitionPath = join(directory, "process.yaml");
  const databasePath = join(directory, "coordination.sqlite3");
  await writeFile(join(directory, "agent.md"), "Handle work.\n");
  await writeDefinition(definitionPath, false);

  let application = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  assert.deepEqual(simplify(application.queryNotificationPolicy()), {
    enabled: true,
    userMention: true,
    failedRun: true,
    subscriptions: [
      ["delivery", "backlog", true],
      ["delivery", "implementation", false],
      ["delivery", "completion", true],
    ],
  });

  assert.equal(application.updateNotificationPolicy({
    change: { type: "global", enabled: false },
  }).accepted, true);
  assert.equal(application.updateNotificationPolicy({
    change: { type: "cause", cause: "user-mention", enabled: false },
  }).accepted, true);
  assert.equal(application.updateNotificationPolicy({
    change: { type: "column", boardId: "delivery", columnId: "implementation", enabled: true },
  }).accepted, true);
  application.close();

  await writeDefinition(definitionPath, true);
  application = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  t.after(() => application.close());
  assert.deepEqual(simplify(application.queryNotificationPolicy()), {
    enabled: false,
    userMention: false,
    failedRun: true,
    subscriptions: [
      ["delivery", "backlog", true],
      ["delivery", "implementation", true],
      ["delivery", "verification", false],
      ["delivery", "completion", true],
    ],
  });
});

test("eligible agent-authored occurrences are durable, independent, and prospective", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-notification-occurrences-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "agent.md"), "Handle work.\n");
  await writeDefinition(definitionPath, false);
  const databasePath = join(directory, "coordination.sqlite3");
  let application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });

  const userTask = application.createTask({
    boardId: "delivery", columnId: "backlog", title: "User task", description: "Silent.",
    actor: { kind: "user", id: "local-user" }, idempotencyKey: "user-task",
  });
  assert.equal(userTask.accepted, true);
  const agentTask = application.createTask({
    boardId: "delivery", columnId: "backlog", title: "Agent task", description: "Notify.",
    actor: { kind: "agent", id: "implementer" }, idempotencyKey: "agent-task",
  });
  assert.equal(agentTask.accepted, true);
  if (!agentTask.accepted) return;

  application.addTaskComment({
    taskId: agentTask.task.id,
    body: "@user please review",
    actor: { kind: "agent", id: "implementer" },
    idempotencyKey: "agent-mention",
  });
  application.addTaskComment({
    taskId: agentTask.task.id,
    body: "@user note to self",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "user-self-mention",
  });
  const movedByUser = application.moveTask({
    taskId: agentTask.task.id, destinationColumnId: "implementation", expectedRevision: 1,
    actor: { kind: "user", id: "local-user" }, idempotencyKey: "user-move",
  });
  assert.equal(movedByUser.accepted, true);
  if (!movedByUser.accepted) return;
  const movedByAgent = application.moveTask({
    taskId: agentTask.task.id, destinationColumnId: "backlog", expectedRevision: 2,
    actor: { kind: "agent", id: "implementer" }, idempotencyKey: "agent-move",
  });
  assert.equal(movedByAgent.accepted, true);

  application.updateNotificationPolicy({
    change: { type: "cause", cause: "user-mention", enabled: false },
  });
  application.addTaskComment({
    taskId: agentTask.task.id, body: "@user silenced cause",
    actor: { kind: "agent", id: "implementer" }, idempotencyKey: "silenced-cause",
  });
  application.updateNotificationPolicy({
    change: { type: "cause", cause: "user-mention", enabled: true },
  });

  assert.equal(application.updateNotificationPolicy({
    change: { type: "global", enabled: false },
  }).accepted, true);
  application.createTask({
    boardId: "delivery", columnId: "backlog", title: "Silenced", description: "Never replay.",
    actor: { kind: "agent", id: "implementer" }, idempotencyKey: "silenced-agent-task",
  });
  application.updateNotificationPolicy({ change: { type: "global", enabled: true } });

  const batch = application.queryNotificationOccurrences(0);
  assert.deepEqual(batch.occurrences.map((occurrence) => occurrence.type), [
    "column-entry",
    "user-mention",
    "column-entry",
  ]);
  assert.equal(new Set(batch.occurrences.map((occurrence) => occurrence.id)).size, 3);
  assert.deepEqual(batch.occurrences[0]?.destination, {
    boardId: "delivery", boardName: "Delivery", columnId: "backlog", columnName: "Backlog",
  });
  const inspection = application.queryTaskInspection(agentTask.task.id);
  assert.equal(inspection.available, true);
  if (inspection.available) {
    assert.equal(inspection.task.unresolvedAttention.filter((reason) => reason.type === "user-mention").length, 2);
  }
  application.close();
  application = await CoordinationApplication.start({ processDefinitionPath: definitionPath, databasePath });
  t.after(() => application.close());
  assert.deepEqual(application.queryNotificationOccurrences(), { cursor: batch.cursor, occurrences: [] });
});

function simplify(policy: ReturnType<CoordinationApplication["queryNotificationPolicy"]>) {
  return {
    enabled: policy.enabled,
    userMention: policy.causes.userMention,
    failedRun: policy.causes.failedRun,
    subscriptions: policy.boards.flatMap((board) =>
      board.columns.map((column) => [board.id, column.id, column.enabled]),
    ),
  };
}

async function writeDefinition(path: string, changed: boolean): Promise<void> {
  await writeFile(path, `schemaVersion: 1
name: Delivery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep handoffs explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tickets
    summary: Builds changes.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
${changed ? `      - id: verification
        name: Verification
        watchingAgent: implementer
` : ""}${changed ? "" : "        watchingAgent: implementer\n"}`);
}

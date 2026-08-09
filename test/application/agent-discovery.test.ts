import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("board summaries orient agents without returning task payloads", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "First task",
    description: "Description that must not leak into a board summary.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-first-task",
  });
  application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Second task",
    description: "Another description that must stay out of the summary.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-second-task",
  });

  const result = application.queryBoardSummaries();

  assert.deepEqual(result, {
    available: true,
    boards: [
      {
        id: "delivery",
        name: "Delivery",
        columns: [
          {
            id: "backlog",
            name: "Backlog",
            watchingAgent: null,
            frameworkOwned: false,
            taskCreationAllowed: true,
            taskCount: 1,
          },
          {
            id: "implementation",
            name: "Implementation",
            watchingAgent: {
              id: "implementer",
              name: "Implementation Agent",
              summary: "Builds scoped changes.",
            },
            frameworkOwned: false,
            taskCreationAllowed: true,
            taskCount: 1,
          },
          {
            id: "review",
            name: "Review",
            watchingAgent: {
              id: "reviewer",
              name: "Code Reviewer",
              summary: "Reviews completed changes.",
            },
            frameworkOwned: false,
            taskCreationAllowed: true,
            taskCount: 0,
          },
          {
            id: "completion",
            name: "Completion",
            watchingAgent: null,
            frameworkOwned: true,
            taskCreationAllowed: false,
            taskCount: 0,
          },
        ],
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(result), /Description that must|Another description/);
});

test("task overview listing requires explicit valid columns", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  assert.deepEqual(
    application.queryTaskOverviews({ boardId: "delivery", columnIds: [] }),
    { available: false, reason: "columns-required" },
  );
  assert.deepEqual(
    application.queryTaskOverviews({ boardId: "delivery", columnIds: ["missing"] }),
    { available: false, reason: "column-not-found", columnId: "missing" },
  );
  assert.deepEqual(
    application.queryTaskOverviews({
      boardId: "delivery",
      columnIds: ["backlog"],
      pageSize: 51,
    }),
    { available: false, reason: "invalid-page-size" },
  );
  assert.deepEqual(
    application.queryTaskOverviews({
      boardId: "delivery",
      columnIds: ["backlog"],
      cursor: "not-a-continuation-cursor",
    }),
    { available: false, reason: "invalid-cursor" },
  );
});

test("task overview cursors remain stable when an earlier task moves within selected columns", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  const tasks = Array.from({ length: 5 }, (_, index) =>
    application.createTask({
      boardId: "delivery",
      columnId: "backlog",
      title: `Task ${index + 1}`,
      description: `Full description ${index + 1} must not appear in an overview.`,
      actor: { kind: "user" as const, id: "paul" },
      idempotencyKey: `create-page-task-${index + 1}`,
    }),
  );
  assert.equal(tasks.every((task) => task.accepted), true);

  const firstPage = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog", "review"],
    pageSize: 2,
  });
  assert.equal(firstPage.available, true);
  if (!firstPage.available) return;
  assert.deepEqual(firstPage.tasks, [
    {
      id: "T-0001",
      title: "Task 1",
      boardId: "delivery",
      column: { id: "backlog", name: "Backlog" },
      revision: 1,
      blocking: { blocked: false, blockerTaskIds: [] },
        relationships: [],
        unresolvedAttention: [],
        automationSuspended: false,
        run: {
        status: "idle",
        activeAgentId: null,
        queuedActivationCount: 0,
        failedActivationCount: 0,
      },
    },
    {
      id: "T-0002",
      title: "Task 2",
      boardId: "delivery",
      column: { id: "backlog", name: "Backlog" },
      revision: 1,
      blocking: { blocked: false, blockerTaskIds: [] },
        relationships: [],
        unresolvedAttention: [],
        automationSuspended: false,
        run: {
        status: "idle",
        activeAgentId: null,
        queuedActivationCount: 0,
        failedActivationCount: 0,
      },
    },
  ]);
  assert.ok(firstPage.nextCursor);
  assert.doesNotMatch(JSON.stringify(firstPage), /Full description/);

  const moved = application.moveTask({
    taskId: "T-0001",
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-earlier-task",
  });
  assert.equal(moved.accepted, true);

  const secondPage = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog", "review"],
    pageSize: 2,
    cursor: firstPage.nextCursor,
  });
  assert.equal(secondPage.available, true);
  if (!secondPage.available) return;
  assert.deepEqual(secondPage.tasks.map((task) => task.id), ["T-0003", "T-0004"]);
  assert.ok(secondPage.nextCursor);

  const finalPage = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog", "review"],
    pageSize: 2,
    cursor: secondPage.nextCursor,
  });
  assert.equal(finalPage.available, true);
  if (!finalPage.available) return;
  assert.deepEqual(finalPage.tasks.map((task) => task.id), ["T-0005"]);
  assert.equal(finalPage.nextCursor, null);
});

test("task overviews can order cards by their most recent current-column entry", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  for (const title of ["Oldest", "Middle", "Newest"]) {
    const created = application.createTask({
      boardId: "delivery",
      columnId: "backlog",
      title,
      description: `${title} task description.`,
      actor: { kind: "user", id: "paul" },
      idempotencyKey: `create-${title.toLocaleLowerCase()}`,
    });
    assert.equal(created.accepted, true);
  }

  const initiallyOrdered = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog"],
    order: "recent-column-entry",
  });
  assert.equal(initiallyOrdered.available, true);
  if (!initiallyOrdered.available) return;
  assert.deepEqual(initiallyOrdered.tasks.map((task) => task.title), ["Newest", "Middle", "Oldest"]);

  const left = application.moveTask({
    taskId: "T-0001",
    destinationColumnId: "review",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "oldest-leaves-backlog",
  });
  assert.equal(left.accepted, true);
  const returned = application.moveTask({
    taskId: "T-0001",
    destinationColumnId: "backlog",
    expectedRevision: 2,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "oldest-returns-to-backlog",
  });
  assert.equal(returned.accepted, true);
  const edited = application.editTask({
    taskId: "T-0002",
    title: "Middle after an unrelated edit",
    description: "Editing must not count as entering the current column.",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "edit-middle-without-reordering",
  });
  assert.equal(edited.accepted, true);
  const inertMove = application.moveTask({
    taskId: "T-0002",
    destinationColumnId: "backlog",
    expectedRevision: 2,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "same-column-move-is-inert",
  });
  assert.deepEqual(inertMove, { accepted: false, reason: "invalid-destination" });

  const reordered = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog"],
    order: "recent-column-entry",
  });
  assert.equal(reordered.available, true);
  if (!reordered.available) return;
  assert.deepEqual(reordered.tasks.map((task) => task.title), [
    "Oldest",
    "Newest",
    "Middle after an unrelated edit",
  ]);
});

test("Completion is listed only when agents select it explicitly", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Completed work",
    description: "Inspect this only through a deliberate Completion query.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-completed-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  const completed = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "completion",
    expectedRevision: created.task.revision,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-task",
  });
  assert.equal(completed.accepted, true);

  const backlog = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog"],
  });
  const completion = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["completion"],
  });
  assert.equal(backlog.available, true);
  assert.equal(completion.available, true);
  if (!backlog.available || !completion.available) return;
  assert.deepEqual(backlog.tasks, []);
  assert.deepEqual(completion.tasks.map((task) => task.id), ["T-0001"]);
});

test("full task inspection keeps history and attachments behind on-demand queries", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Inspect complete context",
    description: "The complete description remains available to every agent.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-inspection-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  application.addTaskComment({
    taskId: created.task.id,
    body: "Keep this authored comment distinct from framework activity.",
    actor: { kind: "agent", id: "reviewer" },
    idempotencyKey: "inspection-comment",
  });
  application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "inspection-move",
  });

  const inspection = application.queryTaskInspection(created.task.id);
  assert.equal(inspection.available, true);
  if (!inspection.available) return;
  assert.deepEqual(inspection.task, {
    id: "T-0001",
    title: "Inspect complete context",
    description: "The complete description remains available to every agent.",
    boardId: "delivery",
    column: { id: "implementation", name: "Implementation" },
    revision: 2,
    comments: [
      {
        id: inspection.task.comments[0]?.id,
        body: "Keep this authored comment distinct from framework activity.",
        actor: { kind: "agent", id: "reviewer" },
        occurredAt: inspection.task.comments[0]?.occurredAt,
      },
    ],
    relationships: [],
    blocking: { blocked: false, blockerTaskIds: [] },
    run: {
      status: "queued",
      activeAgentId: null,
      queuedActivationCount: 1,
      failedActivationCount: 0,
    },
    unresolvedAttention: [],
    currentActivation: {
      targetAgentId: "implementer",
      model: null,
      reasoningEffort: null,
    },
    automationSuspended: false,
    onDemand: { activity: true, attachments: true },
  });
  assert.equal("activity" in inspection.task, false);
  assert.equal("attachments" in inspection.task, false);

  const activity = application.queryTaskActivity(created.task.id);
  const attachments = application.queryTaskAttachments(created.task.id);
  assert.equal(activity.available, true);
  assert.equal(attachments.available, true);
  if (!activity.available || !attachments.available) return;
  assert.deepEqual(
    activity.activity.map((event) => event.type),
    ["task.created", "task.moved", "activation.created"],
  );
  assert.deepEqual(attachments.attachments, []);
});

test("discovery projects durable relationships, blockers, attention, and attachments", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());
  for (const [index, title] of ["Blocked task", "Prerequisite task"].entries()) {
    const created = application.createTask({
      boardId: "delivery",
      columnId: "backlog",
      title,
      description: `${title} full description.`,
      actor: { kind: "user", id: "paul" },
      idempotencyKey: `create-state-task-${index}`,
    });
    assert.equal(created.accepted, true);
  }
  const fixtureDatabase = new DatabaseSync(fixture.databasePath);
  fixtureDatabase.exec("PRAGMA foreign_keys = ON");
  fixtureDatabase
    .prepare("INSERT INTO task_relationships VALUES (?, ?, ?, ?)")
    .run("R-1", "dependency", "T-0001", "T-0002");
  fixtureDatabase
    .prepare(
      `INSERT INTO attention_reasons
        (id, task_id, type, source_event_id, created_at, resolved_at)
       VALUES (?, ?, ?, NULL, ?, NULL)`,
    )
    .run("A-1", "T-0001", "user-mention", "2026-08-08T12:00:00.000Z");
  fixtureDatabase
    .prepare("INSERT INTO task_attachments VALUES (?, ?, ?, ?, ?)")
    .run("F-1", "T-0001", "architecture.md", "text/markdown", 512);
  fixtureDatabase.close();

  const overview = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog"],
  });
  const inspection = application.queryTaskInspection("T-0001");
  const attachments = application.queryTaskAttachments("T-0001");
  assert.equal(overview.available, true);
  assert.equal(inspection.available, true);
  assert.equal(attachments.available, true);
  if (!overview.available || !inspection.available || !attachments.available) return;
  assert.deepEqual(overview.tasks[0]?.blocking, {
    blocked: true,
    blockerTaskIds: ["T-0002"],
  });
  assert.deepEqual(overview.tasks[0]?.relationships, [
    {
      id: "R-1",
      type: "dependency",
      sourceTaskId: "T-0001",
      targetTaskId: "T-0002",
    },
  ]);
  assert.deepEqual(inspection.task.unresolvedAttention, [
    {
      id: "A-1",
      type: "user-mention",
      sourceEventId: null,
      createdAt: "2026-08-08T12:00:00.000Z",
    },
  ]);
  assert.deepEqual(attachments.attachments, [
    {
      id: "F-1",
      fileName: "architecture.md",
      mediaType: "text/markdown",
      sizeBytes: 512,
    },
  ]);

  const completed = application.moveTask({
    taskId: "T-0002",
    destinationColumnId: "completion",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "complete-prerequisite",
  });
  assert.equal(completed.accepted, true);
  const unblocked = application.queryTaskOverviews({
    boardId: "delivery",
    columnIds: ["backlog"],
  });
  assert.equal(unblocked.available, true);
  if (unblocked.available) {
    assert.deepEqual(unblocked.tasks[0]?.blocking, {
      blocked: false,
      blockerTaskIds: [],
    });
  }
});

test("collaborator discovery exposes names and summaries without instructions", async (t) => {
  const fixture = await createDiscoveryFixture();
  const application = await CoordinationApplication.start(fixture);
  t.after(() => application.close());

  const result = application.queryCollaborators();

  assert.deepEqual(result, {
    available: true,
    collaborators: [
      {
        id: "implementer",
        name: "Implementation Agent",
        summary: "Builds scoped changes.",
      },
      {
        id: "reviewer",
        name: "Code Reviewer",
        summary: "Reviews completed changes.",
      },
    ],
  });
  assert.doesNotMatch(JSON.stringify(result), /Implement the current|Review the current/);
});

async function createDiscoveryFixture(): Promise<{
  processDefinitionPath: string;
  databasePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-discovery-"));
  await writeFile(join(directory, "implementer.md"), "Implement the current task.\n");
  await writeFile(join(directory, "reviewer.md"), "Review the current task.\n");
  const processDefinitionPath = join(directory, "process.yaml");
  await writeFile(
    processDefinitionPath,
    `schemaVersion: 1
name: Discovery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Discover only the work you need.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements tasks
    summary: Builds scoped changes.
    instructions: ./implementer.md
  - id: reviewer
    name: Code Reviewer
    role: Reviews tasks
    summary: Reviews completed changes.
    instructions: ./reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep work bounded.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  return {
    processDefinitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  };
}

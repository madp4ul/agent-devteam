import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("a valid process starts paused with ordered boards and a final Completion column", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-valid-startup-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the requested change.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Delivery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep handoffs explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tickets
    summary: Builds and verifies product changes.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Move work through independent review.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );

  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());

  const startup = application.queryStartup();
  assert.equal(startup.mode, "paused");
  if (startup.mode !== "paused") return;
  assert.equal(startup.automation.attemptsMayStart, false);
  assert.match(startup.processDefinitionVersion, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    startup.boards.map((board) => ({
      id: board.id,
      columns: board.columns.map((column) => ({
        id: column.id,
        watchingAgentId: column.watchingAgentId,
        frameworkOwned: column.frameworkOwned,
      })),
    })),
    [
      {
        id: "delivery",
        columns: [
          { id: "backlog", watchingAgentId: null, frameworkOwned: false },
          { id: "implementation", watchingAgentId: "implementer", frameworkOwned: false },
          { id: "completion", watchingAgentId: null, frameworkOwned: true },
        ],
      },
    ],
  );
});

test("an invalid process starts in configuration-error mode with actionable source diagnostics", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-invalid-startup-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the requested change.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Delivery process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep handoffs explicit.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tickets
    summary: Builds and verifies product changes.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Move work through independent review.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: missing-agent
`,
  );

  const validation = await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(validation.valid, false);
  if (validation.valid) return;
  assert.deepEqual(validation.diagnostics, [
    {
      file: definitionPath,
      line: 18,
      column: 24,
      invalidValue: "missing-agent",
      rule: "watchingAgent must reference a declared agent ID",
      consequence:
        'Column "implementation" has no resolvable watching agent, so startup cannot safely determine responsibility.',
      correction:
        'Declare agent "missing-agent" or change watchingAgent to an existing agent ID.',
    },
  ]);

  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());
  assert.deepEqual(application.queryStartup(), {
    mode: "configuration-error",
    diagnostics: validation.diagnostics,
    automation: { state: "blocked", attemptsMayStart: false },
  });
});

test("duplicate stable board identities are rejected before relational state is applied", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-duplicate-id-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Duplicate process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep handoffs explicit.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: First board.
    columns:
      - id: backlog
        name: Backlog
  - id: delivery
    name: Renamed delivery
    guidance: Accidental duplicate.
    columns:
      - id: planned
        name: Planned
`,
  );

  const validation = await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(validation.valid, false);
  if (validation.valid) return;
  assert.equal(validation.diagnostics.length, 1);
  assert.deepEqual(validation.diagnostics[0], {
    file: definitionPath,
    line: 13,
    column: 9,
    invalidValue: "delivery",
    rule: "board IDs must be unique and stable within a process",
    consequence:
      'Board "delivery" cannot be identified unambiguously, so the process cannot be applied safely.',
    correction: 'Give this board a unique stable ID; keep "delivery" on only one board.',
  });
});

test("process authors cannot declare the framework-owned Completion column", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-reserved-completion-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Invalid completion
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Let the framework own completion.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: completion
        name: Done
`,
  );

  const validation = await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(validation.valid, false);
  if (validation.valid) return;
  assert.equal(validation.diagnostics[0]?.invalidValue, "completion");
  assert.match(
    validation.diagnostics[0]?.correction ?? "",
    /framework-reserved "completion" ID/,
  );
});

test("agent IDs and workflow-column IDs are unique in their identity scopes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-duplicate-entities-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "agent.md"), "Act within the configured role.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Duplicate entities
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep handoffs explicit.
agents:
  - id: reviewer
    name: Reviewer
    role: Reviews
    summary: Reviews work.
    instructions: ./agent.md
  - id: reviewer
    name: Another reviewer
    role: Also reviews
    summary: Duplicates an identity.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: review
        name: Review
      - id: review
        name: Review again
`,
  );

  const validation = await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(validation.valid, false);
  if (validation.valid) return;
  assert.deepEqual(
    validation.diagnostics.map((diagnostic) => diagnostic.rule),
    [
      "agent IDs must be unique and stable within a process",
      "column IDs must be unique and stable within their board",
    ],
  );
});

test("semantic fingerprints ignore YAML presentation and include referenced instructions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-fingerprint-"));
  const definitionPath = join(directory, "process.yaml");
  const instructionsPath = join(directory, "reviewer.md");
  await writeFile(instructionsPath, "Review for correctness.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Review process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep review independent.
agents:
  - id: reviewer
    name: Reviewer
    role: Reviews changes
    summary: Checks correctness.
    instructions: reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Review before completion.
    columns:
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  const first = await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(first.valid, true);
  if (!first.valid) return;

  await writeFile(
    definitionPath,
    `# The same effective process with mappings in another order.
name: Review process
schemaVersion: 1
coordinationGuidance: Keep review independent.
defaultTaskWorkspaceStartingRef: main
boards:
  - name: Delivery
    id: delivery
    columns:
      - name: Review
        watchingAgent: reviewer
        id: review
    guidance: Review before completion.
agents:
  - summary: Checks correctness.
    role: Reviews changes
    name: Reviewer
    instructions: ./reviewer.md
    id: reviewer
`,
  );
  const reformatted = await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(reformatted.valid, true);
  if (!reformatted.valid) return;
  assert.equal(reformatted.processDefinitionVersion, first.processDefinitionVersion);

  await writeFile(instructionsPath, "Review for correctness and security.\n");
  const changedInstructions =
    await CoordinationApplication.validateProcessDefinition(definitionPath);
  assert.equal(changedInstructions.valid, true);
  if (!changedInstructions.valid) return;
  assert.notEqual(
    changedInstructions.processDefinitionVersion,
    first.processDefinitionVersion,
  );
});

test("resume is explicit and every later application startup returns to paused", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-resume-"));
  const definitionPath = join(directory, "process.yaml");
  const databasePath = join(directory, "coordination.sqlite3");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Manual start process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Start only after inspection.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
`,
  );

  const firstApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  assert.deepEqual(firstApplication.queryAutomation(), {
    state: "paused",
    attemptsMayStart: false,
  });
  assert.deepEqual(firstApplication.resumeAutomation(), {
    accepted: true,
    automation: { state: "running", attemptsMayStart: true },
  });
  assert.deepEqual(firstApplication.queryAutomation(), {
    state: "running",
    attemptsMayStart: true,
  });
  firstApplication.close();

  const restartedApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  t.after(() => restartedApplication.close());
  assert.deepEqual(restartedApplication.queryAutomation(), {
    state: "paused",
    attemptsMayStart: false,
  });
});

test("board commands preserve idempotent, revision-checked accessible movement through the application seam", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-board-commands-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the requested change.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Movement process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Move tasks explicitly.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements tickets
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
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());

  const createCommand = {
    boardId: "delivery",
    columnId: "backlog",
    title: "Move without dragging",
    description: "Use the accessible movement control.",
    actor: { kind: "user" as const, id: "paul" },
    idempotencyKey: "create-task-1",
  };
  const created = application.createTask(createCommand);
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  assert.deepEqual(application.createTask(createCommand), created);

  const moved = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "implementation",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-task-1",
  });
  assert.equal(moved.accepted, true);
  if (!moved.accepted) return;
  assert.equal(moved.task.columnId, "implementation");
  assert.equal(moved.task.revision, 2);
  const staleMove = application.moveTask({
    taskId: created.task.id,
    destinationColumnId: "completion",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "stale-move",
  });
  assert.equal(staleMove.accepted, false);
  if (!staleMove.accepted && staleMove.reason === "revision-conflict") {
    assert.equal(staleMove.currentTask.columnId, "implementation");
    assert.equal(staleMove.currentTask.revision, 2);
  }

  const boards = application.queryBoards();
  assert.equal(boards.available, true);
  if (!boards.available) return;
  assert.equal(
    boards.boards
      .flatMap((board) => board.columns)
      .flatMap((column) => column.tasks).length,
    1,
  );
  assert.deepEqual(
    moved.task.activity.map((event) => ({
      type: event.type,
      actor: event.actor,
    })),
    [
      { type: "task.created", actor: { kind: "user", id: "paul" } },
      { type: "task.moved", actor: { kind: "user", id: "paul" } },
    ],
  );
});

test("configuration-error mode hides prior boards and rejects every board mutation", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-mutation-gate-"));
  const definitionPath = join(directory, "process.yaml");
  const databasePath = join(directory, "coordination.sqlite3");
  const validDefinition = `schemaVersion: 1
name: Gated process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Fail closed.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
`;
  await writeFile(definitionPath, validDefinition);
  const validApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  const created = validApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Must not move under invalid configuration",
    description: "Prior live state remains untouched.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-before-error",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;
  validApplication.close();

  await writeFile(definitionPath, validDefinition.replace("schemaVersion: 1", "schemaVersion: 99"));
  const invalidApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  const invalidStartup = invalidApplication.queryStartup();
  assert.deepEqual(invalidApplication.queryBoards(), {
    available: false,
    diagnostics:
      invalidStartup.mode === "configuration-error" ? invalidStartup.diagnostics : [],
  });
  const rejectedMove = invalidApplication.moveTask({
    taskId: created.task.id,
    destinationColumnId: "completion",
    expectedRevision: 1,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "move-during-error",
  });
  assert.equal(rejectedMove.accepted, false);
  if (!rejectedMove.accepted) assert.equal(rejectedMove.reason, "configuration-error");
  const rejectedCreate = invalidApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Must not be created",
    description: "Configuration errors reject mutation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-during-error",
  });
  assert.equal(rejectedCreate.accepted, false);
  if (!rejectedCreate.accepted) assert.equal(rejectedCreate.reason, "configuration-error");
  assert.equal(invalidApplication.resumeAutomation().accepted, false);
  invalidApplication.close();

  await writeFile(definitionPath, validDefinition);
  const recoveredApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  t.after(() => recoveredApplication.close());
  const recoveredBoards = recoveredApplication.queryBoards();
  assert.equal(recoveredBoards.available, true);
  if (!recoveredBoards.available) return;
  const tasks = recoveredBoards.boards.flatMap((board) =>
    board.columns.flatMap((column) => column.tasks),
  );
  assert.deepEqual(
    tasks.map((task) => ({ id: task.id, columnId: task.columnId, revision: task.revision })),
    [{ id: created.task.id, columnId: "backlog", revision: 1 }],
  );
});

test("renaming and reordering preserve stable identities and keep Completion final", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-stable-identities-"));
  const definitionPath = join(directory, "process.yaml");
  const databasePath = join(directory, "coordination.sqlite3");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Stable process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep identities stable.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
      - id: review
        name: Review
`,
  );
  const firstApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  const created = firstApplication.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Preserve mapped work",
    description: "Identity is independent from display order and names.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "stable-task",
  });
  assert.equal(created.accepted, true);
  firstApplication.close();

  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Stable process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep identities stable.
agents: []
boards:
  - id: delivery
    name: Product Delivery
    guidance: Deliver changes.
    columns:
      - id: review
        name: Independent Review
      - id: backlog
        name: Ideas
`,
  );
  const renamedApplication = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath,
  });
  t.after(() => renamedApplication.close());
  const boards = renamedApplication.queryBoards();
  assert.equal(boards.available, true);
  if (!boards.available) return;
  assert.equal(boards.boards[0]?.name, "Product Delivery");
  assert.deepEqual(
    boards.boards[0]?.columns.map((column) => ({
      id: column.id,
      name: column.name,
      frameworkOwned: column.frameworkOwned,
      taskIds: column.tasks.map((task) => task.id),
    })),
    [
      { id: "review", name: "Independent Review", frameworkOwned: false, taskIds: [] },
      {
        id: "backlog",
        name: "Ideas",
        frameworkOwned: false,
        taskIds: created.accepted ? [created.task.id] : [],
      },
      { id: "completion", name: "Completion", frameworkOwned: true, taskIds: [] },
    ],
  );
});

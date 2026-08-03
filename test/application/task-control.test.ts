import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";

test("task authoring validates complete outcomes and edits through an idempotent revision check", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-task-control-"));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Task control
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep changes explicit.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver useful outcomes.
    columns:
      - id: backlog
        name: Backlog
`,
  );
  const application = await CoordinationApplication.start({
    processDefinitionPath: definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  });
  t.after(() => application.close());

  const missingTitle = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "   ",
    description: "A complete description.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "missing-title",
  });
  assert.deepEqual(missingTitle, { accepted: false, reason: "empty-title" });

  const missingDescription = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Ship a useful outcome",
    description: "  ",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "missing-description",
  });
  assert.deepEqual(missingDescription, { accepted: false, reason: "empty-description" });

  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Ship a useful outcome",
    description: "A complete initial description.",
    actor: { kind: "user", id: "local-user" },
    idempotencyKey: "create-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) return;

  const editCommand = {
    taskId: created.task.id,
    title: "Ship the inspected task experience",
    description: "Users can now understand and control the complete task.",
    expectedRevision: created.task.revision,
    actor: { kind: "user" as const, id: "local-user" },
    idempotencyKey: "edit-task",
  };
  const edited = application.editTask(editCommand);
  assert.equal(edited.accepted, true);
  if (!edited.accepted) return;
  assert.equal(edited.task.revision, 2);
  assert.equal(edited.task.title, editCommand.title);
  assert.equal(edited.task.description, editCommand.description);
  assert.equal(edited.task.activity.at(-1)?.type, "task.edited");
  assert.deepEqual(application.editTask(editCommand), edited);

  const conflict = application.editTask({
    ...editCommand,
    title: "Overwrite a newer revision",
    expectedRevision: 1,
    idempotencyKey: "stale-edit",
  });
  assert.equal(conflict.accepted, false);
  if (!conflict.accepted && conflict.reason === "revision-conflict") {
    assert.equal(conflict.currentTask.revision, 2);
    assert.equal(conflict.currentTask.title, editCommand.title);
  }
});

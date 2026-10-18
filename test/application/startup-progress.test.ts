import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";
import type { StartupProgressUpdate } from "../../src/application/startup-contract.ts";
import type { DatabaseSync } from "node:sqlite";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { coordinationMigrations } from "../../src/application/internal/migrations/registry.ts";
import { createCommittedTestRepository } from "../support/agent-runtime-fixture.ts";
import { CompletingAgentRuntime } from "../support/activation-fixture.ts";

test("current databases report only applicable verification work and known remaining steps", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-startup-progress-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  const updates: StartupProgressUpdate[] = [];
  const database = await CoordinationDatabase.open(path, (update) => updates.push(update));
  database.close();
  assert.match(updates.find(({ detail }) => detail !== undefined)?.detail ?? "", /copied \d+ \/ \d+ bytes/);
  assert.deepEqual(updates.filter(({ detail }) => detail === undefined).map(({ phase }) => phase), [
    "Copying database for migration inspection", "Inspecting migration history",
    "Opening coordination database", "Checking database schema", "Checking database integrity",
    "Checking database foreign keys",
  ]);
  assert.deepEqual(updates.filter(({ detail }) => detail === undefined).map(({ remainingSteps }) => remainingSteps), [
    undefined, undefined, 3, 2, 1, 0,
  ]);
});

test("application reports verification before readiness and blocks recovery and dispatch on failure", async (t) => {
  const repository = await createCommittedTestRepository("coordination-startup-progress-");
  t.after(() => rm(repository.directory, { recursive: true, force: true }));
  const definitionPath = join(repository.directory, "process.yaml");
  const databasePath = join(repository.directory, "coordination.sqlite3");
  await writeFile(definitionPath, `schemaVersion: 1
name: Startup progress test
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep startup paused.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Preserve state.
    columns:
      - id: backlog
        name: Backlog
`);
  const runtime = new CompletingAgentRuntime();
  const updates: StartupProgressUpdate[] = [];
  const options = {
    processDefinitionPath: definitionPath, databasePath,
    startupProgress: (update: StartupProgressUpdate) => updates.push(update),
    runtimeDispatch: { projectRepositoryPath: repository.repositoryPath,
      taskWorkspaceRoot: join(repository.directory, "task-worktrees"), agentRuntime: runtime },
  };
  const initial = await CoordinationApplication.start(options);
  assert.equal(initial.queryStartup().mode, "paused");
  initial.close();
  assert.deepEqual(updates.filter(({ phase }) => /attachments|archival|workspace|applying process/.test(phase))
    .map(({ phase, remainingSteps }) => [phase, remainingSteps]), [
    ["Checking retained attachments", 4], ["Recovering interrupted archival", 3],
    ["Checking workspace consistency", 2], ["Recovering interrupted attempts and applying process", 1],
  ]);
  updates.length = 0;
  const blocked = await CoordinationApplication.startForMigrationTest(options, {
    migrations: [...coordinationMigrations, { id: "test_failure", apply() {
      assert.equal(updates.at(-1)?.phase, "Applying migration test_failure");
      assert.equal(runtime.requests.length, 0);
      throw new Error("deliberate migration failure");
    } }],
  });
  try {
    assert.equal(blocked.queryStartup().mode, "configuration-error");
    assert.equal(runtime.requests.length, 0);
    assert.ok(!updates.some(({ phase }) => /attachments|archival|workspace|applying process/.test(phase)));
  } finally { blocked.close(); }
});

test("upgrade reporting includes the verified backup and only the pending migrations", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-upgrade-progress-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  const initial = { id: "test_initial", apply(db: DatabaseSync) {
    db.exec("CREATE TABLE coordination_migrations(position INTEGER PRIMARY KEY, migration_id TEXT); CREATE TABLE retained(value BLOB); INSERT INTO retained VALUES (zeroblob(1048576))");
  } };
  (await CoordinationDatabase.openForMigrationTest(path, {
    migrations: [initial], expectedSchemaIsComplete: () => true,
  })).close();
  const updates: StartupProgressUpdate[] = [];
  const database = await CoordinationDatabase.openForMigrationTest(path, {
    migrations: [initial, { id: "test_next", apply(db) { db.exec("CREATE TABLE example(value TEXT)"); } }],
    expectedSchemaIsComplete: () => true,
    startupProgress: (update) => updates.push(update),
  });
  database.close();
  const phases = updates.filter(({ detail }) => detail === undefined).slice(2);
  assert.deepEqual(phases.map(({ phase }) => phase), [
    "Opening coordination database", "Creating pre-upgrade recovery backup",
    "Checking recovery backup integrity", "Checking recovery backup foreign keys",
    "Checking recovery backup migration history", "Applying migration test_next",
    "Checking database schema", "Checking database integrity", "Checking database foreign keys",
  ]);
  assert.deepEqual(phases.map(({ remainingSteps }) => remainingSteps), [8, 7, 6, 5, 4, 3, 2, 1, 0]);
  assert.match(updates.find(({ detail }) => detail?.includes("pages"))?.detail ?? "", /Copied \d+ \/ \d+ database pages/);
});

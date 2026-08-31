import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { describeCoordinationSchema } from "../../src/application/internal/coordination-schema-snapshot.ts";
import { createCommittedTestRepository } from "../support/agent-runtime-fixture.ts";
import { CompletingAgentRuntime } from "../support/activation-fixture.ts";

const initialReleasedMigrationId = "0001_initial_released_schema";

test("fresh startup applies the released migration registry and matches the current schema snapshot", async (t) => {
  const fixture = await createStartupFixture("fresh");
  const repository = await createCommittedTestRepository("released-schema-fresh-repository-");
  const runtime = new CompletingAgentRuntime();

  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: repository.repositoryPath,
      taskWorkspaceRoot: join(repository.directory, "task-workspaces"),
      agentRuntime: runtime,
    },
  });

  assert.equal(application.queryStartup().mode, "paused");
  assert.equal(runtime.requests.length, 0);

  const inspection = new DatabaseSync(fixture.databasePath, { readOnly: true });
  t.after(async () => {
    inspection.close();
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
    await rm(repository.directory, { recursive: true, force: true });
  });
  assert.deepEqual(
    inspection.prepare("SELECT position, migration_id FROM coordination_migrations ORDER BY position").all()
      .map((row) => ({ ...row })),
    [{ position: 1, migration_id: initialReleasedMigrationId }],
  );
  assert.equal(
    (inspection.prepare("PRAGMA user_version").get() as { user_version: number }).user_version,
    0,
  );

  const checkedInSnapshot = await readFile(
    join(import.meta.dirname, "../../src/application/internal/migrations/current-schema.sql"),
    "utf8",
  );
  assert.equal(describeCoordinationSchema(inspection), checkedInSnapshot);
});

test("repeat startup opens an already-current released database without changing its history or schema", async (t) => {
  const fixture = await createStartupFixture("repeat");
  const first = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  assert.equal(first.queryStartup().mode, "paused");
  first.close();

  const before = inspectReleasedDatabase(fixture.databasePath);
  const second = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(async () => {
    second.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  assert.equal(second.queryStartup().mode, "paused");
  assert.deepEqual(inspectReleasedDatabase(fixture.databasePath), before);
});

test("startup refuses an unsupported pre-release database and leaves all SQLite files untouched", async (t) => {
  const fixture = await createStartupFixture("pre-release");
  const preRelease = new DatabaseSync(fixture.databasePath);
  preRelease.exec("CREATE TABLE retained_work (value TEXT NOT NULL); INSERT INTO retained_work VALUES ('keep me'); PRAGMA user_version = 21;");
  preRelease.close();
  await writeFile(`${fixture.databasePath}-wal`, "retained wal marker");
  await writeFile(`${fixture.databasePath}-shm`, "retained shm marker");
  const before = await readDatabaseFiles(fixture.databasePath);

  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  const startup = application.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.match(startup.diagnostics[0]?.rule ?? "", /released migration ledger/i);
    assert.equal(startup.automation.attemptsMayStart, false);
  }
  assert.deepEqual(await readDatabaseFiles(fixture.databasePath), before);
});

test("startup does not adopt an existing empty ledger-less database", async (t) => {
  const fixture = await createStartupFixture("empty-existing");
  await writeFile(fixture.databasePath, "");

  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  assert.equal(application.queryStartup().mode, "configuration-error");
  assert.equal((await readFile(fixture.databasePath)).byteLength, 0);
});

async function createStartupFixture(name: string): Promise<{
  directory: string;
  definitionPath: string;
  databasePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), `released-schema-${name}-`));
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Released schema process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep durable coordination state safe.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver work.
    columns:
      - id: backlog
        name: Backlog
`,
  );
  return {
    directory,
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
  };
}

function inspectReleasedDatabase(path: string): { history: unknown[]; schema: string } {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      history: database.prepare(
        "SELECT position, migration_id FROM coordination_migrations ORDER BY position",
      ).all().map((row) => ({ ...row })),
      schema: describeCoordinationSchema(database),
    };
  } finally {
    database.close();
  }
}

async function readDatabaseFiles(path: string): Promise<Record<string, Buffer>> {
  return {
    database: await readFile(path),
    wal: await readFile(`${path}-wal`),
    shm: await readFile(`${path}-shm`),
  };
}

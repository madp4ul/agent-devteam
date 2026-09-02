import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { describeCoordinationSchema } from "../../src/application/internal/coordination-schema-snapshot.ts";
import { coordinationMigrations } from "../../src/application/internal/migrations/registry.ts";
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

  assert.equal(application.queryStartup().mode, "paused", JSON.stringify(application.queryStartup()));
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

test("startup refuses divergent, gapped, reordered, future, and malformed released histories without changing SQLite files", async (t) => {
  const cases = [
    { name: "altered", rows: [[1, "0001_renamed"]] },
    { name: "gap", rows: [[2, initialReleasedMigrationId]] },
    { name: "future", rows: [[1, initialReleasedMigrationId], [2, "9999_future"]] },
    { name: "reordered", rows: [[1, "9999_future"], [2, initialReleasedMigrationId]] },
    { name: "malformed", rows: [[1, ""]] },
  ] as const;

  for (const scenario of cases) {
    const fixture = await createReleasedDatabase(`history-${scenario.name}`);
    t.after(async () => rm(fixture.directory, { recursive: true, force: true }));
    const database = new DatabaseSync(fixture.databasePath);
    database.exec("DELETE FROM coordination_migrations");
    const insert = database.prepare(
      "INSERT INTO coordination_migrations (position, migration_id) VALUES (?, ?)",
    );
    for (const row of scenario.rows) insert.run(...row);
    database.close();
    await writeFile(`${fixture.databasePath}-wal`, `wal-${scenario.name}`);
    await writeFile(`${fixture.databasePath}-shm`, `shm-${scenario.name}`);
    const before = await readDatabaseFiles(fixture.databasePath);

    const application = await CoordinationApplication.start({
      processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath,
    });
    const startup = application.queryStartup();
    application.close();

    assert.equal(startup.mode, "configuration-error", scenario.name);
    if (startup.mode === "configuration-error") {
      assert.match(startup.diagnostics[0]?.rule ?? "", /exact prefix/i, scenario.name);
      assert.equal(startup.automation.attemptsMayStart, false);
    }
    assert.deepEqual(await readDatabaseFiles(fixture.databasePath), before, scenario.name);
  }
});

test("a skipped-release upgrade preserves representative retained state and backs up committed WAL data", async (t) => {
  const fixture = await createReleasedDatabase("skipped-release");
  const backupPath = join(fixture.directory, "verified-recovery.sqlite3");
  const writer = new DatabaseSync(fixture.databasePath);
  writer.exec("PRAGMA journal_mode = WAL; PRAGMA wal_autocheckpoint = 0");
  writer.exec(await readFile(
    join(import.meta.dirname, "../fixtures/released-schema/0001-initial-released-schema-data.sql"),
    "utf8",
  ));
  const attachmentPath = join(
    fixture.directory,
    "conversation-attachments",
    "content",
    "released-task",
    "released-conversation",
  );
  await mkdir(attachmentPath, { recursive: true });
  await writeFile(join(attachmentPath, "released-conversation-attachment"), Buffer.alloc(17, "x"));
  assert.ok((await stat(`${fixture.databasePath}-wal`)).size > 32);
  const mainFileWithoutWal = join(fixture.directory, "main-file-without-wal.sqlite3");
  await copyFile(fixture.databasePath, mainFileWithoutWal);
  const mainOnly = new DatabaseSync(mainFileWithoutWal, { readOnly: true });
  try {
    assert.equal(mainOnly.prepare("SELECT 1 FROM tasks WHERE id = 'released-task'").get(), undefined);
    assert.notEqual(writer.prepare("SELECT 1 FROM tasks WHERE id = 'released-task'").get(), undefined);
  } finally {
    mainOnly.close();
  }

  const application = await CoordinationApplication.startForMigrationTest(
    {
      processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath,
    },
    {
      migrations: syntheticThreeVersionRegistry(),
      expectedSchema: await syntheticUpgradeSchema(),
      backupPath: () => backupPath,
    },
  );
  writer.close();
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  assert.equal(application.queryStartup().mode, "paused", JSON.stringify(application.queryStartup()));
  const task = application.queryTask("released-task");
  assert.equal(task.available, true);
  if (task.available) {
    assert.equal(task.task.title, "Retained released task");
    assert.equal(task.task.comments[0]?.body, "Retained comment");
    assert.equal(task.task.activations[0]?.attempts[0]?.threadId, "thread-released");
  }
  const inspection = application.queryTaskInspectionForUser("released-task");
  assert.equal(inspection.available, true);
  if (inspection.available) assert.equal(inspection.task.workspace?.path, "D:/retained/workspace");

  const upgraded = new DatabaseSync(fixture.databasePath, { readOnly: true });
  const recovery = new DatabaseSync(backupPath, { readOnly: true });
  try {
    assert.deepEqual(readMigrationHistory(upgraded), [
      initialReleasedMigrationId,
      "test_0002_add_upgrade_probe",
      "test_0003_transform_upgrade_probe",
    ]);
    assert.deepEqual(readMigrationHistory(recovery), [initialReleasedMigrationId]);
    assert.equal(
      (recovery.prepare("SELECT title FROM tasks WHERE id = 'released-task'").get() as { title: string }).title,
      "Retained released task",
    );
    assert.equal(
      (upgraded.prepare("SELECT value FROM migration_upgrade_probe").get() as { value: string }).value,
      "second migration transformed by third",
    );
    assertRepresentativeReleasedData(upgraded);
    assertRepresentativeReleasedData(recovery);
  } finally {
    upgraded.close();
    recovery.close();
  }
});

test("a direct one-step upgrade preserves released identities and values through application projections", async (t) => {
  const fixture = await createReleasedDatabase("direct-release");
  const database = new DatabaseSync(fixture.databasePath);
  database.exec(await readFile(
    join(import.meta.dirname, "../fixtures/released-schema/0001-initial-released-schema-data.sql"),
    "utf8",
  ));
  database.close();
  const attachmentPath = join(
    fixture.directory,
    "conversation-attachments",
    "content",
    "released-task",
    "released-conversation",
  );
  await mkdir(attachmentPath, { recursive: true });
  await writeFile(join(attachmentPath, "released-conversation-attachment"), Buffer.alloc(17, "x"));
  const backupPath = join(fixture.directory, "direct-recovery.sqlite3");

  const application = await CoordinationApplication.startForMigrationTest(
    { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath },
    {
      migrations: syntheticThreeVersionRegistry().slice(0, 2),
      expectedSchema: await syntheticUpgradeSchema(),
      backupPath: () => backupPath,
    },
  );
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });

  assert.equal(application.queryStartup().mode, "paused");
  const task = application.queryTask("released-task");
  assert.equal(task.available, true);
  if (task.available) {
    assert.equal(task.task.description, "Representative retained description");
    assert.deepEqual(task.task.relationships.map(({ id }) => id), ["released-relationship"]);
    assert.deepEqual(task.task.activity.map(({ id }) => id), ["released-activity"]);
    assert.equal(task.task.activations[0]?.id, "released-activation");
    assert.equal(task.task.activations[0]?.attempts[0]?.id, "released-attempt");
  }
  const conversation = await application.queryAgentConversation("released-task", "released-conversation");
  assert.equal(conversation.available, true);
  if (conversation.available) {
    assert.equal(conversation.conversation.currentThreadId, "thread-released");
    assert.equal(conversation.conversation.originatingActivationId, "released-activation");
    assert.equal(conversation.conversation.owningAgent.id, "released-agent");
    assert.ok(conversation.conversation.history.some((entry) =>
      entry.kind === "activation" && entry.activationId === "released-activation"
    ));
  }
  const upgraded = new DatabaseSync(fixture.databasePath, { readOnly: true });
  try {
    assertRepresentativeReleasedData(upgraded);
  } finally {
    upgraded.close();
  }
});

test("a late migration failure rolls back the whole pending sequence, reports its verified backup, and blocks dispatch", async (t) => {
  const fixture = await createReleasedDatabase("late-failure");
  const repository = await createCommittedTestRepository("released-schema-failure-repository-");
  const runtime = new CompletingAgentRuntime();
  const backupPath = join(fixture.directory, "late-failure-recovery.sqlite3");
  const retained = new DatabaseSync(fixture.databasePath);
  retained.exec(await readFile(
    join(import.meta.dirname, "../fixtures/released-schema/0001-initial-released-schema-data.sql"),
    "utf8",
  ));
  retained.exec(`
    UPDATE tasks
    SET archival_pending = 1, archival_actor_id = 'user', archival_idempotency_key = 'pending-archive'
    WHERE id = 'released-task';
    UPDATE activations SET status = 'running' WHERE id = 'released-activation';
    UPDATE attempts
    SET status = 'running', completed_at = NULL, outcome_status = NULL, outcome_summary = NULL, outcome_kind = NULL
    WHERE id = 'released-attempt';
  `);
  retained.close();
  const before = inspectReleasedDatabase(fixture.databasePath);
  const beforeRuntimeName = readRuntimeProcessName(fixture.databasePath);
  await writeFile(
    fixture.definitionPath,
    (await readFile(fixture.definitionPath, "utf8")).replace(
      "name: Released schema process",
      "name: Process that must not apply",
    ),
  );
  const failingRegistry = [
    ...coordinationMigrations,
    {
      id: "test_0002_early_pending_step",
      apply(database: DatabaseSync) {
        database.exec("CREATE TABLE early_pending_step (value TEXT NOT NULL); INSERT INTO early_pending_step VALUES ('must roll back')");
      },
    },
    {
      id: "test_0003_late_failure",
      apply() {
        throw new Error("deliberate late migration failure");
      },
    },
  ];

  const application = await CoordinationApplication.startForMigrationTest(
    {
      processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath,
      runtimeDispatch: {
        projectRepositoryPath: repository.repositoryPath,
        taskWorkspaceRoot: join(repository.directory, "task-workspaces"),
        agentRuntime: runtime,
      },
    },
    { migrations: failingRegistry, backupPath: () => backupPath },
  );
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
    await rm(repository.directory, { recursive: true, force: true });
  });

  const startup = application.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.match(startup.diagnostics[0]?.invalidValue as string, /deliberate late migration failure/);
    assert.match(startup.diagnostics[0]?.consequence ?? "", /test_0003_late_failure/);
    assert.match(startup.diagnostics[0]?.consequence ?? "", /late-failure-recovery\.sqlite3/);
  }
  assert.equal(runtime.requests.length, 0);
  const rejectedMutation = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Must remain blocked",
    description: "Migration failure must gate commands.",
    actor: { kind: "user", id: "user" },
    idempotencyKey: "blocked-during-migration-failure",
  });
  assert.equal(rejectedMutation.accepted, false);
  if (!rejectedMutation.accepted) assert.equal(rejectedMutation.reason, "configuration-error");
  assert.deepEqual(inspectReleasedDatabase(fixture.databasePath), before);
  assert.equal(readRuntimeProcessName(fixture.databasePath), beforeRuntimeName);
  const source = new DatabaseSync(fixture.databasePath, { readOnly: true });
  const recovery = new DatabaseSync(backupPath, { readOnly: true });
  try {
    assert.equal(source.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'early_pending_step'").get(), undefined);
    assert.equal(
      (source.prepare("SELECT archival_pending FROM tasks WHERE id = 'released-task'").get() as { archival_pending: number }).archival_pending,
      1,
    );
    assert.equal(
      (source.prepare("SELECT status FROM attempts WHERE id = 'released-attempt'").get() as { status: string }).status,
      "running",
    );
    assert.equal(source.prepare("SELECT 1 FROM tasks WHERE title = 'Must remain blocked'").get(), undefined);
    assert.deepEqual(readMigrationHistory(recovery), [initialReleasedMigrationId]);
  } finally {
    source.close();
    recovery.close();
  }
});

test("an upgrade that omits coordination-enforcing indexes and triggers rolls back before startup", async (t) => {
  const fixture = await createReleasedDatabase("omitted-invariants");
  const repository = await createCommittedTestRepository("released-schema-verification-repository-");
  const runtime = new CompletingAgentRuntime();
  const retained = new DatabaseSync(fixture.databasePath);
  retained.exec(await readFile(
    join(import.meta.dirname, "../fixtures/released-schema/0001-initial-released-schema-data.sql"),
    "utf8",
  ));
  retained.exec(`
    UPDATE tasks SET archival_pending = 1, archival_actor_id = 'user', archival_idempotency_key = 'pending-archive'
    WHERE id = 'released-task';
    UPDATE activations SET status = 'running' WHERE id = 'released-activation';
    UPDATE attempts SET status = 'running', completed_at = NULL WHERE id = 'released-attempt';
  `);
  retained.close();
  const before = inspectReleasedDatabase(fixture.databasePath);
  const beforeRuntimeName = readRuntimeProcessName(fixture.databasePath);
  await writeFile(fixture.definitionPath, (await readFile(fixture.definitionPath, "utf8"))
    .replace("name: Released schema process", "name: Must not apply before verification"));
  const backupPath = join(fixture.directory, "invariant-recovery.sqlite3");
  const application = await CoordinationApplication.startForMigrationTest(
    {
      processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath,
      runtimeDispatch: {
        projectRepositoryPath: repository.repositoryPath,
        taskWorkspaceRoot: join(repository.directory, "task-workspaces"),
        agentRuntime: runtime,
      },
    },
    {
      migrations: [...coordinationMigrations, {
        id: "test_0002_omitted_invariants",
        apply(database: DatabaseSync) {
          database.exec(`
            DROP INDEX one_running_activation_per_task;
            DROP INDEX one_current_agent_conversation_per_task_agent;
            DROP TRIGGER activations_start_in_task_order;
          `);
        },
      }],
      backupPath: () => backupPath,
    },
  );
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
    await rm(repository.directory, { recursive: true, force: true });
  });
  const startup = application.queryStartup();
  assert.equal(startup.mode, "configuration-error");
  if (startup.mode === "configuration-error") {
    assert.equal(startup.automation.attemptsMayStart, false);
    assert.match(startup.diagnostics[0]?.consequence ?? "", /invariant-recovery\.sqlite3/);
  }
  assert.deepEqual(inspectReleasedDatabase(fixture.databasePath), before);
  assert.deepEqual(inspectReleasedDatabase(backupPath), before);
  assert.equal(readRuntimeProcessName(fixture.databasePath), beforeRuntimeName);
  assert.equal(runtime.requests.length, 0);
  const rejected = application.createTask({
    boardId: "delivery", columnId: "backlog", title: "Must remain blocked", description: "",
    actor: { kind: "user", id: "user" }, idempotencyKey: "verification-blocks-mutation",
  });
  assert.equal(rejected.accepted, false);
  if (!rejected.accepted) assert.equal(rejected.reason, "configuration-error");
  for (const path of [fixture.databasePath, backupPath]) {
    const inspection = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(inspection.prepare("SELECT status FROM attempts WHERE id = 'released-attempt'").get()?.status, "running");
      assert.equal(inspection.prepare("SELECT archival_pending FROM tasks WHERE id = 'released-task'").get()?.archival_pending, 1);
      assert.equal(inspection.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
      assert.deepEqual(inspection.prepare("PRAGMA foreign_key_check").all(), []);
    } finally {
      inspection.close();
    }
  }
});

test("startup rejects changed schema behavior even when required object names still exist", async (t) => {
  const changes = [
    { object: "index one_running_activation_per_task", sql: "DROP INDEX one_running_activation_per_task; CREATE INDEX one_running_activation_per_task ON activations(task_id) WHERE status = 'running'" },
    { object: "index one_current_agent_conversation_per_task_agent", sql: "DROP INDEX one_current_agent_conversation_per_task_agent; CREATE UNIQUE INDEX one_current_agent_conversation_per_task_agent ON agent_conversations(task_id, owning_agent_id) WHERE retired_at IS NOT NULL" },
    { object: "trigger activations_start_in_task_order", sql: "DROP TRIGGER activations_start_in_task_order; CREATE TRIGGER activations_start_in_task_order BEFORE UPDATE OF status ON activations BEGIN SELECT RAISE(IGNORE); END" },
    { object: "table task_starting_refs", sql: "DROP TABLE task_starting_refs; CREATE TABLE task_starting_refs (task_id TEXT PRIMARY KEY, starting_ref TEXT)" },
    { object: "table task_relationships", sql: "DROP TABLE task_relationships; CREATE TABLE task_relationships (id TEXT PRIMARY KEY, type TEXT NOT NULL CHECK (type IN ('parent-child', 'dependency')), source_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, target_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE)" },
    { object: "view mapped_tasks", sql: "DROP VIEW mapped_tasks; CREATE VIEW mapped_tasks AS SELECT id FROM tasks" },
    { object: "table forgotten_probe", sql: "CREATE TABLE forgotten_probe (value TEXT)" },
    { object: "table sqliteProbe", sql: "CREATE TABLE sqliteProbe (value TEXT)" },
  ];
  for (const [index, change] of changes.entries()) {
    await t.test(change.object, async (t) => {
      const fixture = await createReleasedDatabase(`changed-object-${index}`);
      const before = inspectReleasedDatabase(fixture.databasePath);
      const application = await CoordinationApplication.startForMigrationTest(
        { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath },
        { migrations: [...coordinationMigrations, {
          id: "test_0002_changed_schema",
          apply(database: DatabaseSync) { database.exec(change.sql); },
        }] },
      );
      t.after(async () => {
        application.close();
        await rm(fixture.directory, { recursive: true, force: true });
      });
      const startup = application.queryStartup();
      assert.equal(startup.mode, "configuration-error");
      if (startup.mode === "configuration-error") {
        assert.ok(String(startup.diagnostics[0]?.invalidValue).includes(change.object));
      }
      assert.deepEqual(inspectReleasedDatabase(fixture.databasePath), before);
    });
  }
});

test("an already-current database with an omitted invariant does not bypass verification", async (t) => {
  const fixture = await createReleasedDatabase("current-drift");
  const database = new DatabaseSync(fixture.databasePath);
  database.exec("DROP INDEX one_running_activation_per_task");
  database.close();
  const before = inspectReleasedDatabase(fixture.databasePath);
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
  });
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });
  assert.equal(application.queryStartup().mode, "configuration-error");
  assert.deepEqual(inspectReleasedDatabase(fixture.databasePath), before);
});

test("schema verification preserves exact string literals even when they contain line endings", async (t) => {
  const fixture = await createReleasedDatabase("literal-line-endings");
  const reviewedSchema = await readFile(
    join(import.meta.dirname, "../../src/application/internal/migrations/current-schema.sql"), "utf8",
  );
  const expected = reviewedSchema.replace(
    /starting_ref TEXT NOT NULL\r?\n    \);/,
    "starting_ref TEXT NOT NULL CHECK (starting_ref <> 'line one\nline two')\n    );",
  );
  assert.notEqual(expected, reviewedSchema, "The independent expected CHECK must be present regardless of checkout line endings.");
  const before = inspectReleasedDatabase(fixture.databasePath);
  const application = await CoordinationApplication.startForMigrationTest(
    { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath },
    {
      expectedSchema: expected,
      migrations: [...coordinationMigrations, {
        id: "test_0002_wrong_literal",
        apply(database: DatabaseSync) {
          database.exec("DROP TABLE task_starting_refs; CREATE TABLE task_starting_refs (task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE, starting_ref TEXT NOT NULL CHECK (starting_ref <> 'line one\r\nline two'))");
        },
      }],
    },
  );
  t.after(async () => {
    application.close();
    await rm(fixture.directory, { recursive: true, force: true });
  });
  assert.equal(application.queryStartup().mode, "configuration-error");
  assert.deepEqual(inspectReleasedDatabase(fixture.databasePath), before);
});

test("harmless SQLite ALTER TABLE quoting and DDL formatting remain valid on upgrade and restart", async (t) => {
  const fixture = await createReleasedDatabase("schema-formatting");
  const migrations = [...coordinationMigrations, {
    id: "test_0002_equivalent_schema",
    apply(database: DatabaseSync) {
      database.exec(`
        ALTER TABLE runtime ADD COLUMN review_probe TEXT;
        ALTER TABLE runtime DROP COLUMN review_probe;
        ALTER TABLE runtime RENAME TO temporary_runtime;
        ALTER TABLE temporary_runtime RENAME TO runtime;
        DROP TABLE task_starting_refs;
        create table "task_starting_refs" (
          task_id text primary key references "tasks" (id) on delete cascade,
          starting_ref text /* harmless formatting */ not null
        );
        DROP INDEX one_running_activation_per_task;
        create unique index if not exists "one_running_activation_per_task"
          on "activations" (task_id) where status='running';
      `);
    },
  }];
  t.after(async () => rm(fixture.directory, { recursive: true, force: true }));
  for (const stage of ["upgrade", "restart"]) {
    const application = await CoordinationApplication.startForMigrationTest(
      { processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath },
      { migrations },
    );
    try {
      assert.equal(application.queryStartup().mode, "paused", `${stage}: ${JSON.stringify(application.queryStartup())}`);
    } finally {
      application.close();
    }
  }
});

test("an unavailable reviewed snapshot produces a blocking diagnostic without recursively failing the error shell", async (t) => {
  const fixture = await createStartupFixture("snapshot-unavailable");
  t.after(async () => rm(fixture.directory, { recursive: true, force: true }));
  // Inject only external file unavailability in a subprocess. Never move or edit
  // the shared checkout's artifact while other tests/agents can be reading it.
  const { stdout } = await promisify(execFile)(process.execPath, [
    "--experimental-strip-types", "--input-type=module", "--eval", `
      import fs from 'node:fs';
      import { syncBuiltinESMExports } from 'node:module';
      const originalRead = fs.readFileSync;
      fs.readFileSync = (...args) => {
        if (String(args[0]).replaceAll('\\\\', '/').endsWith('/migrations/current-schema.sql')) {
          throw new Error('Reviewed schema artifact is unavailable');
        }
        return originalRead(...args);
      };
      syncBuiltinESMExports();
      const { CoordinationApplication } = await import(${JSON.stringify(new URL("../../src/application/coordination-application.ts", import.meta.url).href)});
      const application = await CoordinationApplication.start(${JSON.stringify({
        processDefinitionPath: fixture.definitionPath, databasePath: fixture.databasePath,
      })});
      console.log(JSON.stringify(application.queryStartup()));
      application.close();
    `,
  ]);
  const startup = JSON.parse(stdout);
  assert.equal(startup.mode, "configuration-error");
  assert.equal(startup.automation.attemptsMayStart, false);
  assert.match(startup.diagnostics[0].invalidValue, /Reviewed schema artifact is unavailable/);
  assert.match(startup.diagnostics[0].correction, /application.*snapshot/i);
  const inspection = new DatabaseSync(fixture.databasePath, { readOnly: true });
  try {
    assert.equal(inspection.prepare("SELECT 1 FROM sqlite_schema WHERE name = 'coordination_migrations'").get(), undefined);
  } finally {
    inspection.close();
  }
});

test("backup and post-migration verification failures block startup before accepting an upgrade", async (t) => {
  const backupFailure = await createReleasedDatabase("backup-failure");
  const verificationFailure = await createReleasedDatabase("verification-failure");
  t.after(async () => {
    await rm(backupFailure.directory, { recursive: true, force: true });
    await rm(verificationFailure.directory, { recursive: true, force: true });
  });
  const registry = syntheticThreeVersionRegistry();
  const backupFailureBefore = inspectReleasedDatabase(backupFailure.databasePath);
  const failedBackupPath = join(backupFailure.directory, "unverified.sqlite3");
  const backupBlocked = await CoordinationApplication.startForMigrationTest(
    { processDefinitionPath: backupFailure.definitionPath, databasePath: backupFailure.databasePath },
    {
      migrations: registry,
      backupPath: () => failedBackupPath,
      createBackup: async () => { throw new Error("deliberate backup failure"); },
    },
  );
  const backupStartup = backupBlocked.queryStartup();
  assert.equal(backupStartup.mode, "configuration-error");
  if (backupStartup.mode === "configuration-error") {
    assert.match(backupStartup.diagnostics[0]?.rule ?? "", /online backup/i);
  }
  backupBlocked.close();
  assert.deepEqual(inspectReleasedDatabase(backupFailure.databasePath), backupFailureBefore);
  await assert.rejects(readFile(failedBackupPath), /ENOENT/);

  const verificationBackupPath = join(verificationFailure.directory, "verification-recovery.sqlite3");
  const verificationBefore = inspectReleasedDatabase(verificationFailure.databasePath);
  const verificationBlocked = await CoordinationApplication.startForMigrationTest(
    { processDefinitionPath: verificationFailure.definitionPath, databasePath: verificationFailure.databasePath },
    {
      migrations: registry,
      backupPath: () => verificationBackupPath,
      expectedSchemaIsComplete: () => false,
    },
  );
  const verificationStartup = verificationBlocked.queryStartup();
  assert.equal(verificationStartup.mode, "configuration-error");
  if (verificationStartup.mode === "configuration-error") {
    assert.match(verificationStartup.diagnostics[0]?.rule ?? "", /integrity.*foreign keys/i);
    assert.match(verificationStartup.diagnostics[0]?.consequence ?? "", /verification-recovery\.sqlite3/);
  }
  verificationBlocked.close();
  assert.deepEqual(inspectReleasedDatabase(verificationFailure.databasePath), verificationBefore);
  const verifiedRecovery = new DatabaseSync(verificationBackupPath, { readOnly: true });
  try {
    assert.deepEqual(readMigrationHistory(verifiedRecovery), [initialReleasedMigrationId]);
  } finally {
    verifiedRecovery.close();
  }
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
modelPricing:
  - model: gpt-test
    usdPerMillionTokens:
      input: 1
      cachedInput: 0.5
      cacheWriteInput: 0.75
      output: 2
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

async function createReleasedDatabase(name: string): Promise<Awaited<ReturnType<typeof createStartupFixture>>> {
  const fixture = await createStartupFixture(name);
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
  });
  assert.equal(application.queryStartup().mode, "paused");
  application.close();
  return fixture;
}

function syntheticThreeVersionRegistry() {
  return [
    ...coordinationMigrations,
    {
      id: "test_0002_add_upgrade_probe",
      apply(database: DatabaseSync) {
        database.exec("CREATE TABLE migration_upgrade_probe (value TEXT NOT NULL); INSERT INTO migration_upgrade_probe VALUES ('second migration')");
      },
    },
    {
      id: "test_0003_transform_upgrade_probe",
      apply(database: DatabaseSync) {
        database.exec("UPDATE migration_upgrade_probe SET value = value || ' transformed by third'");
      },
    },
  ] as const;
}

async function syntheticUpgradeSchema(): Promise<string> {
  const releasedSchema = await readFile(
    join(import.meta.dirname, "../../src/application/internal/migrations/current-schema.sql"),
    "utf8",
  );
  // Explicit independent expectation, never computed by running the tested chain.
  return releasedSchema + `
-- table migration_upgrade_probe on migration_upgrade_probe
CREATE TABLE migration_upgrade_probe (value TEXT NOT NULL);
`;
}

function assertRepresentativeReleasedData(database: DatabaseSync): void {
  for (const [table, id] of [
    ["tasks", "released-task"],
    ["activity_ledger", "released-activity"],
    ["activations", "released-activation"],
    ["agent_conversations", "released-conversation"],
    ["agent_conversation_messages", "released-message"],
    ["conversation_attachments", "released-conversation-attachment"],
    ["attempts", "released-attempt"],
    ["task_comments", "released-comment"],
    ["task_relationships", "released-relationship"],
    ["task_attachments", "released-task-attachment"],
  ] as const) {
    assert.notEqual(database.prepare(`SELECT 1 FROM ${table} WHERE id = ?`).get(id), undefined, table);
  }
  assert.notEqual(database.prepare("SELECT 1 FROM task_workspaces WHERE task_id = 'released-task'").get(), undefined);
  assert.deepEqual(
    { ...(database.prepare("SELECT * FROM model_pricing WHERE model = 'gpt-test'").get() as object) },
    {
      model: "gpt-test",
      input_usd_per_million: 1,
      cached_input_usd_per_million: 0.5,
      cache_write_input_usd_per_million: 0.75,
      output_usd_per_million: 2,
    },
  );
  assert.deepEqual(
    { ...(database.prepare("SELECT task_id, conversation_id, message_id, file_name, media_type, size_bytes, position FROM conversation_attachments WHERE id = 'released-conversation-attachment'").get() as object) },
    {
      task_id: "released-task",
      conversation_id: "released-conversation",
      message_id: "released-message",
      file_name: "evidence.txt",
      media_type: "text/plain",
      size_bytes: 17,
      position: 0,
    },
  );
  assert.deepEqual(
    { ...(database.prepare("SELECT activation_id, thread_id, model, reasoning_effort, outcome_summary FROM attempts WHERE id = 'released-attempt'").get() as object) },
    {
      activation_id: "released-activation",
      thread_id: "thread-released",
      model: "gpt-test",
      reasoning_effort: "high",
      outcome_summary: "Retained result",
    },
  );
}

function readMigrationHistory(database: DatabaseSync): string[] {
  return (database.prepare("SELECT migration_id FROM coordination_migrations ORDER BY position").all() as Array<{ migration_id: string }>)
    .map(({ migration_id }) => migration_id);
}

function readRuntimeProcessName(path: string): string {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return (database.prepare("SELECT process_name FROM runtime WHERE singleton = 1").get() as { process_name: string })
      .process_name;
  } finally {
    database.close();
  }
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

import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";
import { coordinationMigrations } from "../../src/application/internal/migrations/registry.ts";

test("released snapshot upgrade compacts historical results and preserves original replay, requests, keys and authoritative evidence", async (t) => {
  const fixture = await legacyFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const old = new DatabaseSync(fixture.path);
  const summary = { id: "released-task", title: "Historical title", boardId: "delivery", columnId: "backlog", revision: 7 };
  const snapshot = JSON.stringify({ accepted: true, task: {
    ...summary, description: "Historical description",
    comments: Array.from({ length: 40 }, (_, i) => ({ id: `old-${i}`, body: `${i}:` + "retained history ".repeat(500) })),
    activity: [], activations: [], relationships: [],
  } });
  const key = JSON.stringify(["edit-task", ["user", "user"], ["released-task"]]);
  const request = JSON.stringify({ taskId: "released-task", title: "Historical title", expectedRevision: 6 });
  old.prepare("INSERT INTO command_responses VALUES (?, 'historical-edit', ?, ?)").run(key, snapshot, request);
  old.prepare("INSERT INTO command_responses VALUES ('future-command:released-task', 'unknown', ?, NULL)")
    .run('{"futureShape":{"history":"do not interpret or delete"}}');
  old.prepare("INSERT INTO command_responses VALUES (?, 'malformed', ?, ?)").run(key, "not valid JSON", request);
  old.prepare("INSERT INTO command_responses VALUES (?, 'unsupported', ?, ?)").run(key, '{"accepted":true,"task":{"id":"released-task"}}', request);
  const keysBefore = responseKeys(old);
  const factsBefore = authoritativeFacts(old);
  old.close();

  const upgraded = await CoordinationDatabase.open(fixture.path);
  try {
    const row = upgraded.connection.prepare("SELECT response_json, request_json FROM command_responses WHERE idempotency_key = 'historical-edit'").get()!;
    assert.ok(Buffer.byteLength(row.response_json as string) < 512, "Historical task snapshots must be reduced before replay");
    assert.deepEqual(JSON.parse(row.response_json as string), { accepted: true, task: summary });
    assert.equal(row.request_json, request);
    assert.deepEqual(responseKeys(upgraded.connection), keysBefore);
    assert.deepEqual(authoritativeFacts(upgraded.connection), factsBefore);
    assert.equal(upgraded.connection.prepare("SELECT response_json FROM command_responses WHERE idempotency_key = 'unknown'").get()!.response_json,
      '{"futureShape":{"history":"do not interpret or delete"}}');
    assert.equal(upgraded.connection.prepare("SELECT response_json FROM command_responses WHERE idempotency_key = 'malformed'").get()!.response_json, "not valid JSON");
    assert.deepEqual(upgraded.connection.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(upgraded.connection.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { upgraded.close(); }

  const backupName = (await readdir(fixture.directory)).find((name) => name.includes(".pre-migration-"));
  assert.ok(backupName);
  const recovery = new DatabaseSync(join(fixture.directory, backupName), { readOnly: true });
  try {
    assert.equal(recovery.prepare("SELECT response_json FROM command_responses WHERE idempotency_key = 'historical-edit'").get()!.response_json, snapshot);
    assert.deepEqual(authoritativeFacts(recovery), factsBefore);
    assert.equal(recovery.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { recovery.close(); }

  const application = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.path });
  try {
    assert.equal(application.queryStartup().mode, "paused", JSON.stringify(application.queryStartup()));
    const command = { taskId: "released-task", expectedRevision: 6, title: "Historical title", actor: { kind: "user" as const, id: "user" }, idempotencyKey: "historical-edit" };
    assert.deepEqual(application.editTask(command), { accepted: true, task: summary });
    assert.deepEqual(application.editTask({ ...command, title: "Different request" }), { accepted: false, reason: "idempotency-conflict" });
    assert.throws(() => application.editTask({ ...command, idempotencyKey: "malformed" }), /retry protection is intact/i);
    assert.throws(() => application.editTask({ ...command, idempotencyKey: "unsupported" }), /retained retry protection is intact/i);
    const current = application.queryTask("released-task");
    assert.ok(current.available);
    assert.equal(current.task.title, "Retained released task");
  } finally { application.close(); }
});

test("pre-0013 upgrade preserves alias collisions, NULL requests, original outcomes and negative row identities", async (t) => {
  const fixture = await legacyFixture(12);
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const old = new DatabaseSync(fixture.path);
  const task = { id: "released-task", title: "Historical", boardId: "delivery", columnId: "backlog", revision: 3 };
  const rich = { ...task, description: "Historical description", comments: [{ body: "Old history" }], activity: [], activations: [], relationships: [] };
  const comment = { id: "original-comment", body: "Original @local-user text", occurredAt: "2026-01-01", actor: { kind: "user", id: "local-user" } };
  const legacy = JSON.stringify(["add-task-comment", ["user", "local-user"], [task.id]]);
  const canonical = JSON.stringify(["add-task-comment", ["user", "user"], [task.id]]);
  const insert = old.prepare("INSERT INTO command_responses(command_type,idempotency_key,response_json,request_json) VALUES (?, ?, ?, ?)");
  insert.run(legacy, "alias", JSON.stringify({ accepted: true, task: rich, comment }), "{}");
  insert.run(legacy, "collision", JSON.stringify({ accepted: true, task: rich, comment }), "{}");
  insert.run(canonical, "collision", JSON.stringify({ accepted: true, task: { ...rich, title: "Canonical wins" }, comment: { ...comment, actor: { kind: "user", id: "user" } } }), "{}");
  insert.run("edit-task:released-task", "conflict", JSON.stringify({ accepted: false, reason: "revision-conflict", currentTask: rich }), null);
  insert.run("move-task:released-task", "inert", JSON.stringify({ accepted: true, task: rich, outcome: "already-in-column", transition: { taskId: task.id, fromColumnId: "backlog", toColumnId: "backlog" } }), null);
  const relationship = { id: "historical-relationship", type: "dependency", sourceTaskId: task.id, targetTaskId: "released-related", resumeAgentId: null };
  insert.run("remove-task-relationship", "relationship", JSON.stringify({ accepted: true, relationship, sourceTask: rich, targetTask: { ...rich, id: "released-related", title: "Old target" } }), null);
  insert.run("archive-task:released-task", "archive", JSON.stringify({ accepted: true, task: { ...rich, archived: true } }), null);
  insert.run("unarchive-task:released-task", "unarchive", JSON.stringify({ accepted: true, task: rich }), null);
  const relationshipKey = JSON.stringify(["remove-task-relationship", ["user", "user", task.id], null]);
  insert.run(relationshipKey, "public-relationship", JSON.stringify({ accepted: true, relationship, sourceTask: rich, targetTask: { ...rich, id: "released-related", title: "Old target" } }), JSON.stringify({ taskId: task.id, relationshipId: relationship.id }));
  const moveKey = JSON.stringify(["move-task", ["user", "user"], [task.id]]);
  insert.run(moveKey, "public-move", JSON.stringify({ accepted: true, task: rich, transition: { taskId: task.id, fromColumnId: "old-column", toColumnId: "backlog" } }), JSON.stringify({ taskId: task.id, destinationColumnId: "backlog", expectedRevision: 2 }));
  const editKey = JSON.stringify(["edit-task", ["user", "user"], [task.id]]);
  insert.run(editKey, "public-conflict", JSON.stringify({ accepted: false, reason: "revision-conflict", currentTask: rich }), JSON.stringify({ taskId: task.id, title: "Attempted edit", expectedRevision: 2 }));
  const futureFailure = '{ "accepted": false, "reason": "future-failure", "currentTask": { "incomplete": true } }';
  insert.run("edit-task:released-task", "unknown-failure", futureFailure, null);
  old.prepare("INSERT INTO command_responses(rowid,command_type,idempotency_key,response_json) VALUES (-5,'create-task','negative',?)")
    .run(JSON.stringify({ accepted: true, task: rich }));
  const originalIds = new Map(responseKeys(old).map((row) => [JSON.stringify([row.command_type, row.idempotency_key]), row.retained_rowid]));
  old.close();

  const upgraded = await CoordinationDatabase.open(fixture.path);
  try {
    const read = (type: string, key: string) => upgraded.connection.prepare("SELECT response_json,request_json FROM command_responses WHERE command_type = ? AND idempotency_key = ?").get(type, key)!;
    for (const key of [legacy, canonical]) {
      const result = JSON.parse(read(key, "alias").response_json as string);
      assert.deepEqual(result, { accepted: true, task, comment: { ...comment, actor: { kind: "user", id: "user" } } });
    }
    assert.equal(JSON.parse(read(canonical, "collision").response_json as string).task.title, "Canonical wins");
    assert.equal(JSON.parse(read(legacy, "collision").response_json as string).task.title, "Historical");
    assert.deepEqual(JSON.parse(read("edit-task:released-task", "conflict").response_json as string), { accepted: false, reason: "revision-conflict", currentTask: task });
    assert.equal(read("edit-task:released-task", "conflict").request_json, null);
    assert.deepEqual(JSON.parse(read("move-task:released-task", "inert").response_json as string), { accepted: true, task, outcome: "already-in-column", transition: { taskId: task.id, fromColumnId: "backlog", toColumnId: "backlog" } });
    assert.deepEqual(JSON.parse(read("remove-task-relationship", "relationship").response_json as string), { accepted: true, relationship, sourceTask: task, targetTask: { ...task, id: "released-related", title: "Old target" } });
    assert.deepEqual(JSON.parse(read("archive-task:released-task", "archive").response_json as string), { accepted: true, task: { ...task, archived: true } });
    assert.deepEqual(JSON.parse(read("unarchive-task:released-task", "unarchive").response_json as string), { accepted: true, task });
    // Released 0013 already normalizes JSON whitespace while rewriting actors;
    // 0015 preserves that resulting unsupported record exactly.
    assert.equal(read("edit-task:released-task", "unknown-failure").response_json, JSON.stringify(JSON.parse(futureFailure)));
    assert.deepEqual(JSON.parse(read("create-task", "negative").response_json as string), { accepted: true, task });
    for (const row of responseKeys(upgraded.connection)) {
      const originalId = originalIds.get(JSON.stringify([row.command_type, row.idempotency_key]));
      if (originalId !== undefined) assert.equal(row.retained_rowid, originalId);
    }
    assert.equal(responseKeys(upgraded.connection).length, originalIds.size + 1, "Only the missing canonical alias is added");
  } finally { upgraded.close(); }
  const app = await CoordinationApplication.start({ processDefinitionPath: fixture.definitionPath, databasePath: fixture.path });
  try {
    assert.equal(app.queryStartup().mode, "paused");
    const before = app.queryTask(task.id);
    const actor = { kind: "user" as const, id: "user" };
    assert.deepEqual(app.removeTaskRelationship({ taskId: task.id, relationshipId: relationship.id, actor, idempotencyKey: "public-relationship" }),
      { accepted: true, relationship, sourceTask: task, targetTask: { ...task, id: "released-related", title: "Old target" } });
    assert.deepEqual(app.moveTask({ taskId: task.id, destinationColumnId: "backlog", expectedRevision: 2, actor, idempotencyKey: "public-move" }),
      { accepted: true, task, transition: { taskId: task.id, fromColumnId: "old-column", toColumnId: "backlog" } });
    assert.deepEqual(app.editTask({ taskId: task.id, title: "Attempted edit", expectedRevision: 2, actor, idempotencyKey: "public-conflict" }),
      { accepted: false, reason: "revision-conflict", currentTask: task });
    assert.deepEqual(await app.archiveTask({ taskId: task.id, actor, idempotencyKey: "archive" }), { accepted: true, task: { ...task, archived: true } });
    assert.deepEqual(app.unarchiveTask({ taskId: task.id, actor, idempotencyKey: "unarchive" }), { accepted: true, task });
    assert.deepEqual(app.queryTask(task.id), before, "Historical replay must not apply effects or today's mutable projections");
  } finally { app.close(); }
  const beforeOldReader = await readFile(fixture.path);
  await assert.rejects(CoordinationDatabase.openForMigrationTest(fixture.path, { migrations: coordinationMigrations.slice(0, 13) }), /Unsupported or malformed coordination migration history/);
  assert.deepEqual(await readFile(fixture.path), beforeOldReader);
});

test("a late conversion failure rolls back earlier receipt conversions and ledger changes with a verified original backup", async (t) => {
  const fixture = await legacyFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const old = new DatabaseSync(fixture.path);
  const snapshot = JSON.stringify({ accepted: true, task: { id: "released-task", title: "Old", boardId: "delivery", columnId: "backlog", revision: 1, comments: [{ body: "Keep this history" }] } });
  const insert = old.prepare("INSERT INTO command_responses VALUES ('edit-task:released-task', ?, ?, '{}')");
  insert.run("first", snapshot);
  insert.run("second", snapshot);
  old.exec(`CREATE TRIGGER fail_receipt_conversion BEFORE UPDATE ON command_responses
    WHEN OLD.idempotency_key = 'second' BEGIN SELECT RAISE(ABORT, 'injected conversion failure'); END;`);
  const keys = responseKeys(old), facts = authoritativeFacts(old);
  old.close();
  await assert.rejects(CoordinationDatabase.open(fixture.path), /injected conversion failure/);
  const source = new DatabaseSync(fixture.path, { readOnly: true });
  try {
    assert.deepEqual(source.prepare("SELECT response_json FROM command_responses ORDER BY rowid").all().map((row) => row.response_json), [snapshot, snapshot]);
    assert.equal(source.prepare("SELECT COUNT(*) AS n FROM coordination_migrations").get()!.n, 13);
    assert.deepEqual(responseKeys(source), keys);
    assert.deepEqual(authoritativeFacts(source), facts);
  } finally { source.close(); }
  const backupName = (await readdir(fixture.directory)).find((name) => name.includes(".pre-migration-"));
  assert.ok(backupName);
  const backup = new DatabaseSync(join(fixture.directory, backupName), { readOnly: true });
  try {
    assert.deepEqual(backup.prepare("SELECT response_json FROM command_responses ORDER BY rowid").all().map((row) => row.response_json), [snapshot, snapshot]);
    assert.equal(backup.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { backup.close(); }
});

test("isolated snapshot conversion frees reusable pages and explicit compaction reclaims filesystem space", async (t) => {
  const fixture = await legacyFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const old = new DatabaseSync(fixture.path);
  const insert = old.prepare("INSERT INTO command_responses VALUES ('edit-task:released-task', ?, ?, '{}')");
  for (let index = 0; index < 40; index++) {
    insert.run(`large-${index}`, JSON.stringify({ accepted: true, task: {
      id: "released-task", title: `Historical ${index}`, boardId: "delivery", columnId: "backlog", revision: index + 1,
      comments: Array.from({ length: index + 1 }, (_, comment) => ({ id: `comment-${comment}`, body: "Synthetic authored history ".repeat(200) })),
    } }));
  }
  const facts = authoritativeFacts(old);
  const beforePayload = Number(old.prepare("SELECT SUM(length(response_json)) AS n FROM command_responses").get()!.n);
  old.close();
  const beforeFile = (await stat(fixture.path)).size;
  const upgraded = await CoordinationDatabase.open(fixture.path);
  try {
    const afterPayload = Number(upgraded.connection.prepare("SELECT SUM(length(response_json)) AS n FROM command_responses").get()!.n);
    assert.ok(afterPayload < beforePayload / 10, "Repeated full histories must be removed from retained results");
    assert.ok(Number(upgraded.connection.prepare("PRAGMA freelist_count").get()!.freelist_count) > 0);
    assert.deepEqual(authoritativeFacts(upgraded.connection), facts);
    upgraded.connection.exec("VACUUM");
    upgraded.connection.exec("PRAGMA wal_checkpoint(TRUNCATE)");
    assert.deepEqual(authoritativeFacts(upgraded.connection), facts);
    assert.ok((await stat(fixture.path)).size < beforeFile / 2);
    assert.equal(upgraded.connection.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
  } finally { upgraded.close(); }
});

async function legacyFixture(prefix = 13) {
  const directory = await mkdtemp(join(tmpdir(), "compact-response-upgrade-"));
  const path = join(directory, "coordination.sqlite3");
  const definitionPath = join(directory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: Released schema process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve retained history.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver work.
    columns:
      - id: backlog
        name: Backlog
`);
  const database = new DatabaseSync(path);
  try {
    database.exec("PRAGMA foreign_keys = ON");
    for (const [index, migration] of coordinationMigrations.slice(0, prefix).entries()) {
      migration.apply(database);
      database.prepare("INSERT INTO coordination_migrations VALUES (?, ?)").run(index + 1, migration.id);
    }
    database.exec(`INSERT INTO runtime VALUES (1, 'Released schema process', 'legacy-version', 'paused', NULL);
      INSERT INTO boards VALUES ('delivery', 'Delivery', 'Work', 0, 1);
      INSERT INTO columns VALUES ('delivery', 'backlog', 'Backlog', 0, NULL, 0, 1);`);
    database.exec(await readFile(new URL("../fixtures/released-schema/0009-reviewer-allowances-data.sql", import.meta.url), "utf8"));
  } finally { database.close(); }
  const content = join(directory, "conversation-attachments", "content", "released-task", "released-conversation");
  await mkdir(content, { recursive: true });
  await writeFile(join(content, "released-conversation-attachment"), Buffer.alloc(17));
  return { directory, path, definitionPath };
}

function responseKeys(database: DatabaseSync) {
  return database.prepare("SELECT rowid AS retained_rowid, command_type, idempotency_key, request_json FROM command_responses ORDER BY rowid").all();
}

function authoritativeFacts(database: DatabaseSync) {
  // Menu history is a new derived projection; compare original authoritative evidence separately.
  return Object.fromEntries(database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT IN ('command_responses', 'coordination_migrations', 'activity_menu_history') ORDER BY name")
    .all().map(({ name }) => [name, database.prepare(name === "sqlite_sequence"
      // sqlite_sequence has no domain row identity; VACUUM may renumber its
      // internal rows while retaining every named counter.
      ? "SELECT name, seq FROM sqlite_sequence WHERE name != 'activity_menu_history' ORDER BY name"
      : `SELECT rowid AS retained_rowid, * FROM "${String(name).replaceAll('"', '""')}" ORDER BY rowid`).all()] as const).filter(([, rows]) => rows.length > 0));
}

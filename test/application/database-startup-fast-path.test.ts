import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";
import type { StartupProgressUpdate } from "../../src/application/startup-contract.ts";

test("clean current startup verifies without opening a disposable inspection copy or migration backup", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-direct-startup-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  const updates: StartupProgressUpdate[] = [];
  const opened: string[] = [];
  const original = fs.openSync;
  t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => {
    opened.push(String(args[0]));
    return original(...args);
  });
  syncBuiltinESMExports();
  try {
    const database = await CoordinationDatabase.open(path, (update) => updates.push(update));
    database.close();
    assert.deepEqual(opened.filter((name) => name.includes("coordination-schema-inspection-")), []);
    assert.deepEqual(await readdir(directory), ["coordination.sqlite3"]);
    assert.ok(updates.some(({ phase }) => phase === "Inspecting current migration history without copying"));
    assert.deepEqual(updates.filter(({ phase }) => phase.startsWith("Checking database")).map(({ phase }) => phase), [
      "Checking database schema", "Checking database integrity", "Checking database foreign keys",
    ]);
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
  }
});

for (const sidecar of ["present", "missing"] as const) {
  test(`a race from rollback to unsupported WAL with SHM ${sidecar} falls back without modifying retained bytes`, async (t) => {
    const directory = await mkdtemp(join(tmpdir(), "coordination-raced-wal-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, "coordination.sqlite3");
    (await CoordinationDatabase.open(path)).close();
    let before: ReturnType<typeof sqliteFiles> | undefined;
    const phases: string[] = [];
    await assert.rejects(CoordinationDatabase.open(path, ({ phase }) => {
      phases.push(phase);
      if (phase !== "Inspecting current migration history without copying") return;
      execFileSync(process.execPath, ["--input-type=module", "-e", `
        import { DatabaseSync } from 'node:sqlite';
        const db = new DatabaseSync(process.argv[1]);
        db.exec("PRAGMA journal_mode=WAL; UPDATE coordination_migrations SET migration_id='unsupported' WHERE position=1");
        process.exit(0);
      `, path]);
      if (sidecar === "missing") fs.rmSync(`${path}-shm`);
      before = sqliteFiles(path);
    }), /Unsupported or malformed coordination migration history/);
    assert.ok(before, "race ran after filesystem eligibility and before SQLite inspection");
    assert.ok(phases.includes("Copying database for migration inspection"));
    assert.deepEqual(sqliteFiles(path), before);
  });
}

test("a rollback journal appearing after eligibility is recovered only on the refused inspection copy", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-raced-journal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  const unsupported = new DatabaseSync(path);
  unsupported.exec("UPDATE coordination_migrations SET migration_id='unsupported' WHERE position=1");
  unsupported.close();
  let before: ReturnType<typeof sqliteFiles> | undefined;
  const phases: string[] = [];
  await assert.rejects(CoordinationDatabase.open(path, ({ phase }) => {
    phases.push(phase);
    if (phase !== "Inspecting current migration history without copying") return;
    execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { DatabaseSync } from 'node:sqlite';
      const db = new DatabaseSync(process.argv[1]);
      db.exec('PRAGMA cache_size=5; BEGIN IMMEDIATE; CREATE TABLE uncommitted(value BLOB)');
      const insert=db.prepare('INSERT INTO uncommitted VALUES (?)');
      for(let i=0;i<100;i++) insert.run(Buffer.alloc(4000));
      process.exit(0);
    `, path]);
    before = sqliteFiles(path);
  }), /Unsupported or malformed coordination migration history/);
  assert.ok(before?.[3], "hot rollback journal exists");
  assert.ok(phases.includes("Copying database for migration inspection"));
  assert.deepEqual(sqliteFiles(path), before);
});

test("direct verification holds the writer reservation and releases it after success or schema refusal", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-direct-lock-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  let lockResult = "";
  const database = await CoordinationDatabase.open(path, ({ phase }) => {
    if (phase !== "Checking database schema") return;
    lockResult = execFileSync(process.execPath, ["--input-type=module", "-e", `
      import { DatabaseSync } from 'node:sqlite';
      const db=new DatabaseSync(process.argv[1]);
      try { db.exec('PRAGMA busy_timeout=0; BEGIN IMMEDIATE'); console.log('unexpected writer'); }
      catch(error) { console.log(error.errcode); }
      finally { db.close(); }
    `, path], { encoding: "utf8" }).trim();
  });
  assert.equal(lockResult, "5", "another SQLite writer gets SQLITE_BUSY during verification");
  database.close();
  const change = new DatabaseSync(path);
  change.exec("CREATE TABLE unexpected(value TEXT)");
  change.close();
  const before = sqliteFiles(path);
  await assert.rejects(CoordinationDatabase.open(path), /schema, integrity, or foreign-key verification failed/);
  assert.deepEqual(sqliteFiles(path), before);
  const after = new DatabaseSync(path);
  after.exec("PRAGMA busy_timeout=0; BEGIN EXCLUSIVE; ROLLBACK");
  after.close();
});

test("a competing writer blocks direct startup without copying unstable state or leaving a read lock", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-direct-busy-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  const writer = new DatabaseSync(path);
  const phases: string[] = [];
  const before = sqliteFiles(path);
  try {
    await assert.rejects(CoordinationDatabase.open(path, ({ phase }) => {
      phases.push(phase);
      if (phase === "Inspecting current migration history without copying") writer.exec("BEGIN IMMEDIATE");
    }), /database is busy/i);
    assert.ok(!phases.includes("Copying database for migration inspection"));
    assert.ok(phases.includes("Waiting for database access"));
    writer.exec("COMMIT; BEGIN EXCLUSIVE; ROLLBACK");
    assert.deepEqual(sqliteFiles(path), before);
  } finally { writer.close(); }
});

test("transient writer contention retries clean eligibility after releasing locks, never copies its new journal", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-direct-retry-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  const writer = new DatabaseSync(path);
  const phases: string[] = [];
  let wrote = false;
  try {
    writer.exec("BEGIN IMMEDIATE");
    const opening = CoordinationDatabase.open(path, ({ phase }) => {
      phases.push(phase);
      if (phase === "Waiting for database access" && !wrote) {
        writer.exec("UPDATE coordination_migrations SET migration_id=migration_id");
        wrote = true;
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 60));
    writer.exec("COMMIT");
    const database = await opening;
    database.close();
    assert.ok(wrote);
    assert.ok(phases.includes("Waiting for database access"));
    assert.ok(!phases.includes("Copying database for migration inspection"));
  } finally { writer.close(); }
});

function sqliteFiles(path: string): Array<Buffer | null> {
  return ["", "-wal", "-shm", "-journal"].map((suffix) =>
    fs.existsSync(`${path}${suffix}`) ? fs.readFileSync(`${path}${suffix}`) : null);
}

test("direct inspection preserves refused clean histories and never treats a header as compatibility", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-direct-refusal-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, rows] of [
    ["ledgerless", null], ["empty", []], ["divergent", [[1, "unknown"]]],
    ["gapped", [[2, "0001_initial_released_schema"]]],
    ["newer", [[1, "0001_initial_released_schema"], [2, "9999_future"]]],
    ["malformed", [[1, null]]],
  ] as const) {
    const path = join(directory, `${name}.sqlite3`);
    const fixture = new DatabaseSync(path);
    fixture.exec("CREATE TABLE retained(value TEXT); INSERT INTO retained VALUES ('keep')");
    if (rows !== null) {
      fixture.exec("CREATE TABLE coordination_migrations(position INTEGER, migration_id TEXT)");
      for (const row of rows) fixture.prepare("INSERT INTO coordination_migrations VALUES (?, ?)").run(...row);
    }
    fixture.close();
    const before = sqliteFiles(path);
    const phases: string[] = [];
    await assert.rejects(CoordinationDatabase.open(path, ({ phase }) => phases.push(phase)), /Unsupported or malformed/);
    assert.ok(phases.includes("Inspecting current migration history without copying"), name);
    assert.ok(phases.includes("Copying database for migration inspection"), name);
    assert.deepEqual(sqliteFiles(path), before, name);
  }
});

test("sidecars appearing during direct inspection retain their bytes on refusal", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-raced-sidecars-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const suffix of ["-journal", "-wal", "-shm"]) {
    const path = join(directory, `${suffix}.sqlite3`);
    (await CoordinationDatabase.open(path)).close();
    const change = new DatabaseSync(path);
    change.exec("UPDATE coordination_migrations SET migration_id='unknown' WHERE position=1");
    change.close();
    let before: ReturnType<typeof sqliteFiles> | undefined;
    await assert.rejects(CoordinationDatabase.open(path, ({ phase }) => {
      if (phase === "Inspecting current migration history without copying") {
        fs.writeFileSync(`${path}${suffix}`, "preserved sidecar evidence");
        before = sqliteFiles(path);
      }
    }), /Unsupported or malformed|SQLite files changed/);
    assert.ok(before);
    assert.deepEqual(sqliteFiles(path), before);
  }
});

test("current-history direct startup still rejects integrity and foreign-key violations without writes", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-direct-health-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const [name, sql, message] of [
    ["integrity", "PRAGMA ignore_check_constraints=ON; INSERT INTO boards VALUES ('broken','Broken','',0,9)", /integrity_check failed/],
    ["foreign-key", "PRAGMA foreign_keys=OFF; INSERT INTO columns VALUES ('missing','backlog','Backlog',0,NULL,0,1)", /foreign_key_check found/],
  ] as const) {
    const path = join(directory, `${name}.sqlite3`);
    (await CoordinationDatabase.open(path)).close();
    const fixture = new DatabaseSync(path);
    fixture.exec(sql);
    fixture.close();
    const before = sqliteFiles(path);
    const phases: string[] = [];
    await assert.rejects(CoordinationDatabase.open(path, ({ phase }) => phases.push(phase)), message);
    assert.ok(!phases.includes("Copying database for migration inspection"));
    assert.deepEqual(sqliteFiles(path), before);
  }
});

test("a writer starting after the protected ledger read cannot replace accepted history through fallback", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-post-read-writer-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  (await CoordinationDatabase.open(path)).close();
  const writer = new DatabaseSync(path);
  const original = fs.lstatSync;
  let checks = 0;
  const phases: string[] = [];
  t.mock.method(fs, "lstatSync", (...args: Parameters<typeof fs.lstatSync>) => {
    if (String(args[0]) === `${path}-wal` && ++checks === 2) {
      writer.exec("BEGIN IMMEDIATE; UPDATE coordination_migrations SET migration_id='unsupported' WHERE position=1");
    }
    return original(...args);
  });
  syncBuiltinESMExports();
  try {
    let accepted: CoordinationDatabase | undefined;
    try {
      await assert.rejects((async () => {
        accepted = await CoordinationDatabase.open(path, ({ phase }) => {
          phases.push(phase);
          if (phase === "Opening coordination database") writer.exec("COMMIT");
        });
      })(), /SQLite files changed during compatibility inspection/);
    } finally { accepted?.close(); }
    assert.equal(checks, 2);
    assert.ok(!phases.includes("Copying database for migration inspection"));
    assert.ok(writer.isTransaction, "startup did not roll back or commit the competing writer");
    assert.equal(writer.prepare("SELECT migration_id FROM coordination_migrations WHERE position=1").get()?.migration_id, "unsupported");
    writer.exec("COMMIT");
  } finally {
    t.mock.restoreAll();
    syncBuiltinESMExports();
    writer.close();
  }
});

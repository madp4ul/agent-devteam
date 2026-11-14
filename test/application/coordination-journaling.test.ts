import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import test from "node:test";
import { CoordinationDatabase } from "../../src/application/internal/coordination-database.ts";

test("file-backed coordination uses full-durability WAL and closes into the clean startup fast path", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-journaling-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  const database = await CoordinationDatabase.open(path);
  try {
    assert.equal(database.connection.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
    assert.equal(database.connection.prepare("PRAGMA synchronous").get()?.synchronous, 2);
    database.transaction(() => database.connection.exec("INSERT INTO runtime VALUES (1, 'Committed process', 'test-version', 'paused', NULL)"));
    const reader = new DatabaseSync(path, { readOnly: true });
    try {
      assert.equal(reader.prepare("SELECT process_name FROM runtime").get()?.process_name, "Committed process");
    } finally { reader.close(); }
  } finally { database.close(); }

  const header = await readFile(path);
  assert.equal(header[18], 1);
  assert.equal(header[19], 1);
  const phases: string[] = [];
  const reopened = await CoordinationDatabase.open(path, ({ phase }) => phases.push(phase));
  try {
    assert.ok(phases.includes("Inspecting current migration history without copying"));
    assert.ok(!phases.includes("Copying database for migration inspection"));
    assert.equal(reopened.connection.prepare("SELECT process_name FROM runtime").get()?.process_name, "Committed process");
  } finally { reopened.close(); }
});

test("restart recovers acknowledged WAL commits and drops an interrupted transaction", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-wal-recovery-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  const moduleUrl = new URL("../../src/application/internal/coordination-database.ts", import.meta.url).href;
  const source = `
    import { CoordinationDatabase } from ${JSON.stringify(moduleUrl)};
    const database = await CoordinationDatabase.open(process.argv[1]);
    database.connection.exec('PRAGMA wal_autocheckpoint = 0');
    database.transaction(() => database.connection.exec("INSERT INTO runtime VALUES (1, 'Acknowledged process', 'test-version', 'paused', NULL)"));
    database.connection.exec("BEGIN IMMEDIATE; UPDATE runtime SET process_name = 'Uncommitted process'");
    process.exit(0);
  `;
  await promisify(execFile)(process.execPath, ["--experimental-strip-types", "--input-type=module", "-e", source, path]);
  const wal = await readFile(`${path}-wal`);
  assert.ok(wal.length > 32);
  const phases: string[] = [];
  const recovered = await CoordinationDatabase.open(path, ({ phase }) => phases.push(phase));
  try {
    assert.equal(recovered.connection.prepare("SELECT process_name FROM runtime").get()?.process_name, "Acknowledged process");
    assert.equal(recovered.connection.prepare("PRAGMA integrity_check").get()?.integrity_check, "ok");
    assert.ok(phases.includes("Copying database for migration inspection"));
  } finally { recovered.close(); }
});

test("closing with a retained reader preserves WAL and leaves the reader usable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-wal-reader-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "coordination.sqlite3");
  const database = await CoordinationDatabase.open(path);
  database.transaction(() => database.connection.exec("INSERT INTO runtime VALUES (1, 'Retained reader', 'test-version', 'paused', NULL)"));
  const reader = new DatabaseSync(path, { readOnly: true });
  reader.exec("BEGIN");
  assert.equal(reader.prepare("SELECT process_name FROM runtime").get()?.process_name, "Retained reader");
  database.close();
  try {
    assert.equal(reader.prepare("PRAGMA journal_mode").get()?.journal_mode, "wal");
    assert.equal(reader.prepare("SELECT process_name FROM runtime").get()?.process_name, "Retained reader");
  } finally { reader.close(); }
  const recovered = await CoordinationDatabase.open(path);
  try {
    assert.equal(recovered.connection.prepare("SELECT process_name FROM runtime").get()?.process_name, "Retained reader");
  } finally { recovered.close(); }
});

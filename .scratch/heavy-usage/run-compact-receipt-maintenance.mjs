// One-off, backup-bound maintenance evidence for tickets 08/09. Not a product CLI.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { CoordinationDatabase } from '../../src/application/internal/coordination-database.ts';
import { acquireProjectStateOperationGuard } from '../../src/application/internal/project-state-operation-guard.ts';

const project = 'D:/Daten/Projekte/Software/Codex/idle-games';
const path = 'D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state/coordination.sqlite3';
const backupPath = path + '.pre-compact-receipts-2026-11-02T21-45-59.947Z.sqlite3';
const verification = JSON.parse(await readFile(backupPath + '.verification.json', 'utf8'));
const preview = JSON.parse(await readFile(backupPath + '.preview.json', 'utf8'));
assert.equal(verification.integrity, 'ok');
assert.equal(verification.foreignKeyViolations, 0);
const guard = await acquireProjectStateOperationGuard(project, 'state maintenance');
let source, owner;

function responseHash(database) {
  const hash = createHash('sha256');
  for (const row of database.prepare('SELECT rowid AS retained_rowid,* FROM command_responses ORDER BY rowid').iterate()) {
    hash.update(JSON.stringify([row.retained_rowid, row.command_type, row.idempotency_key, row.request_json]));
    hash.update(':' + Buffer.byteLength(row.response_json) + ':');
    hash.update(row.response_json);
  }
  return hash.digest('hex');
}

function factHashes(database) {
  const result = {};
  for (const { name } of database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT IN ('command_responses','coordination_migrations') ORDER BY name").all()) {
    const hash = createHash('sha256');
    const sql = name === 'sqlite_sequence' ? 'SELECT name,seq FROM sqlite_sequence ORDER BY name'
      : 'SELECT rowid AS retained_rowid,* FROM "' + name.replaceAll('"', '""') + '" ORDER BY rowid';
    for (const row of database.prepare(sql).iterate()) hash.update(JSON.stringify(row) + '\n');
    result[name] = hash.digest('hex');
  }
  return result;
}

try {
  source = new DatabaseSync(path, { readOnly: true });
  source.exec('PRAGMA query_only=ON; PRAGMA cache_size=-65536; PRAGMA mmap_size=268435456');
  assert.equal(source.prepare("SELECT COUNT(*) AS n FROM attempts WHERE status='running'").get().n, 0);
  assert.equal((await stat(path)).size, verification.sourceBytes);
  assert.deepEqual(source.prepare('SELECT * FROM coordination_migrations ORDER BY position').all().map((row) => ({ ...row })), verification.ledger);
  console.log('CHECKING_SOURCE_AGAINST_VERIFIED_BACKUP');
  assert.equal(responseHash(source), preview.originalResponseHash, 'Source retry records changed since backup');
  assert.deepEqual(factHashes(source), preview.factHashes, 'Source authoritative facts changed since backup');
  source.close(); source = undefined;
  const filesBefore = new Set(await readdir(dirname(path)));
  console.log('APPLYING_RELEASED_MIGRATIONS');
  let previousPhase = '', lastProgress = 0;
  owner = await CoordinationDatabase.open(path, (progress) => {
    if (progress.phase !== previousPhase || Date.now() - lastProgress > 15000) {
      console.log('UPGRADE', JSON.stringify(progress));
      previousPhase = progress.phase; lastProgress = Date.now();
    }
  });
  const db = owner.connection;
  db.exec('PRAGMA cache_size=-65536; PRAGMA mmap_size=268435456');
  assert.equal(responseHash(db), preview.expectedResponseHash, 'Converted results differ from preview');
  assert.deepEqual(factHashes(db), preview.factHashes, 'Migration changed authoritative facts');
  const migrationBackups = (await readdir(dirname(path))).filter((name) => name.includes('.pre-migration-') && !filesBefore.has(name));
  assert.equal(migrationBackups.length, 1);
  console.log('MIGRATION_VERIFIED', 'RESPONSE_BYTES', preview.expectedPayload, 'FREE_PAGES', db.prepare('PRAGMA freelist_count').get().freelist_count);
  console.log('COMPACTING_DATABASE');
  db.exec('VACUUM');
  console.log('VERIFYING_COMPACTED_DATABASE');
  assert.deepEqual(db.prepare('PRAGMA integrity_check').all().map((row) => row.integrity_check), ['ok']);
  assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []);
  assert.equal(responseHash(db), preview.expectedResponseHash, 'Compaction changed receipt identity or historical facts');
  assert.deepEqual(factHashes(db), preview.factHashes, 'Compaction changed authoritative facts');
  const report = {
    completedAt: new Date().toISOString(), databasePath: path, backupPath,
    automaticMigrationBackup: join(dirname(path), migrationBackups[0]),
    beforeBytes: verification.sourceBytes, afterBytes: (await stat(path)).size,
    responseRows: preview.rows, changedResponseRows: preview.changed,
    beforeResponseBytes: preview.beforePayload, afterResponseBytes: preview.expectedPayload,
    expectedResponseHash: preview.expectedResponseHash, authoritativeTableHashes: preview.factHashes,
    ledger: db.prepare('SELECT * FROM coordination_migrations ORDER BY position').all(),
    integrity: 'ok', foreignKeyViolations: 0,
  };
  const reportPath = backupPath + '.maintenance-report.json';
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('VERIFIED_MAINTENANCE', JSON.stringify({ ...report, authoritativeTableHashes: 'all unchanged', ledger: report.ledger.map((row) => row.migration_id) }));
  console.log('REPORT', reportPath);
} finally {
  source?.close(); owner?.close(); await guard.release();
}

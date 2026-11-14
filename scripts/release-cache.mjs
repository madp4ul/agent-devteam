import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { resolveRelease } from './local-release-launcher.mjs';
import { replaceReleaseFile } from './release-file.mjs';

const exec = promisify(execFile);
const held = new Map();
const operations = new Map();
const releaseId = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/;

function openCache(root) {
  const database = new DatabaseSync(join(root, 'release-usage.sqlite3'));
  let acquired = false;
  try {
    database.exec('PRAGMA busy_timeout=20000; BEGIN IMMEDIATE');
    acquired = true;
    database.exec(`CREATE TABLE IF NOT EXISTS protocol(version INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS managed(id TEXT PRIMARY KEY, digest TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS uses(token TEXT PRIMARY KEY, release_id TEXT NOT NULL, pid INTEGER NOT NULL CHECK(pid > 0));
      CREATE TABLE IF NOT EXISTS legacy(singleton INTEGER PRIMARY KEY CHECK(singleton=1), evidence TEXT NOT NULL);`);
    const protocols = database.prepare('SELECT version FROM protocol').all();
    if (protocols.length === 0) database.exec('INSERT INTO protocol VALUES(1)');
    else if (protocols.length !== 1 || protocols[0].version !== 1) throw new Error('Unsupported release-cache usage protocol; cleanup and startup remain blocked.');
    return database;
  } catch (error) { if (acquired) database.exec('ROLLBACK'); database.close(); throw error; }
}

/** SQLite's OS locks disappear on crash; no stale lockfile may authorize deletion. */
export async function withReleaseCache(root, action) {
  root = resolve(root);
  await mkdir(root, { recursive: true });
  root = await realpath(root);
  // A synchronous SQLite wait must never block an earlier async operation in
  // this same event loop. OS locking additionally serializes other processes.
  const previous = operations.get(root) ?? Promise.resolve();
  const operation = previous.catch(() => {}).then(async () => {
    const database = openCache(root);
    try { const result = await action(database); database.exec('COMMIT'); return result; }
    catch (error) { try { database.exec('ROLLBACK'); } catch { /* Preserve the original operation failure. */ } throw error; }
    finally { database.close(); }
  });
  operations.set(root, operation);
  try { return await operation; }
  finally { if (operations.get(root) === operation) operations.delete(root); }
}

async function processes() {
  if (process.platform !== 'win32') throw new Error('Release process inspection is supported on Windows.');
  const script = "@(Get-CimInstance Win32_Process -ErrorAction Stop | ForEach-Object { @{ pid=[int]$_.ProcessId; name=[string]$_.Name; created=if($_.CreationDate){$_.CreationDate.ToUniversalTime().ToString('o')}else{''}; command=[string]$_.CommandLine; executable=[string]$_.ExecutablePath } }) | ConvertTo-Json -Compress";
  const { stdout } = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', windowsHide: true, timeout: 8_000, maxBuffer: 8 * 1024 * 1024 });
  const rows = JSON.parse(stdout);
  if (!Array.isArray(rows) || rows.some(row => !Number.isSafeInteger(row.pid) || row.pid < 0 || typeof row.name !== 'string' || typeof row.command !== 'string' || typeof row.executable !== 'string' || typeof row.created !== 'string')) throw new Error('Incomplete release process inspection.');
  return rows;
}

function processMayBeAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return true;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

function runtimeProcess(row) {
  // These are the host/worker and SDK binary names. Unrelated Codex desktop
  // services do not run an installation and can be intentionally uninspectable.
  return /^(node|codex)(\.exe)?$/i.test(row.name);
}

function baselineOwnerHasExited(owner, rows) {
  if (!processMayBeAlive(owner.pid)) return true;
  const current = rows.find(row => row.pid === owner.pid);
  // An omitted row or unreadable birth time is uncertainty, not exit evidence.
  if (!current?.created || !Number.isFinite(Date.parse(current.created))) return false;
  return Date.parse(current.created) !== Date.parse(owner.created);
}

async function metadata(root, id) {
  const installation = await resolveRelease(root, id);
  const record = JSON.parse(await readFile(join(installation.directory, 'release.json'), 'utf8'));
  return { installation, digest: record.sourceDigest };
}

/** Called only after the lease-aware entry point is installed. Old hosts remain protected. */
export async function initializeReleaseRetention(root, warn = message => console.error(message), inspect = processes) {
  await withReleaseCache(root, async database => {
    if (database.prepare('SELECT evidence FROM legacy WHERE singleton=1').get()) return;
    try {
      const rows = await inspect();
      const owners = rows.filter(runtimeProcess);
      if (owners.some(row => !row.created || !Number.isFinite(Date.parse(row.created)))) throw new Error('Legacy process identities are unavailable.');
      const candidates = [];
      const managed = new Set(database.prepare('SELECT id FROM managed').all().map(record => record.id));
      for (const entry of await readdir(join(root, 'releases'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; })) {
        if (!entry.isDirectory() || !releaseId.test(entry.name) || managed.has(entry.name)) continue;
        try { candidates.push({ id: entry.name, digest: (await metadata(root, entry.name)).digest }); }
        catch { /* Unknown directories are never deletion candidates. */ }
      }
      if (candidates.length > 0) database.prepare('INSERT INTO legacy VALUES(1, ?)').run(JSON.stringify({ owners: owners.map(({ pid, created }) => ({ pid, created })), candidates }));
    } catch (error) { warn(`Warning: legacy release usage could not be established; old untracked installations are retained (${error.message}).`); }
  });
}

export async function recordManagedRelease(database, root, id) {
  const record = await metadata(root, id);
  database.prepare('INSERT INTO managed(id,digest) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(id, record.digest);
}

function pin(database, root, id) {
  const key = `${resolve(root)}\0${id}`;
  const token = held.get(key)?.token ?? randomUUID();
  database.prepare('INSERT INTO uses(token,release_id,pid) VALUES(?,?,?) ON CONFLICT(token) DO NOTHING').run(token, id, process.pid);
  held.set(key, { root: resolve(root), token });
}

// Exit is synchronous. A short failure is harmless: dead-PID recovery handles it later.
process.once('exit', () => {
  for (const { root, token } of held.values()) {
    let database;
    try {
      database = new DatabaseSync(join(root, 'release-usage.sqlite3'));
      database.exec('PRAGMA busy_timeout=100');
      database.prepare('DELETE FROM uses WHERE token=?').run(token);
    } catch { /* A killed/busy owner leaves a conservative stale record. */ }
    finally { database?.close(); }
  }
});

async function safeDirectory(root, id) {
  if (!releaseId.test(id)) return undefined;
  const canonicalRoot = await realpath(root);
  const releases = join(canonicalRoot, 'releases');
  if ((await lstat(releases)).isSymbolicLink() || await realpath(releases) !== releases) return undefined;
  const target = join(releases, id);
  if ((await lstat(target)).isSymbolicLink() || await realpath(target) !== target || relative(releases, target) !== id) return undefined;
  async function noLinks(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const child = join(directory, entry.name);
      if ((await lstat(child)).isSymbolicLink()) return false;
      if (entry.isDirectory() && !await noLinks(child)) return false;
    }
    return true;
  }
  return await noLinks(target) ? target : undefined;
}

async function prune(database, root, selected, warn, inspect) {
  const uses = database.prepare('SELECT token,release_id,pid FROM uses').all();
  const active = new Set([selected]);
  for (const use of uses) {
    if (processMayBeAlive(use.pid)) active.add(use.release_id);
    else database.prepare('DELETE FROM uses WHERE token=?').run(use.token);
  }
  const managed = database.prepare('SELECT id,digest FROM managed').all();
  const legacy = database.prepare('SELECT evidence FROM legacy WHERE singleton=1').get();
  if (managed.every(record => active.has(record.id)) && !legacy) return;
  let rows;
  try {
    rows = await inspect();
    // Missing details of a possible Node/native worker never prove it safe to remove files.
    if (rows.some(row => runtimeProcess(row) && (!row.command || !row.created || !Number.isFinite(Date.parse(row.created))) && processMayBeAlive(row.pid))) throw new Error('A runtime process could not be inspected.');
  } catch (error) { warn(`Warning: unused release cleanup deferred (${error.message}).`); return; }
  if (legacy) {
    const evidence = JSON.parse(legacy.evidence);
    if (!Array.isArray(evidence.owners) || !Array.isArray(evidence.candidates)
      || evidence.owners.some(owner => !Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.created !== 'string' || !Number.isFinite(Date.parse(owner.created)))
      || evidence.candidates.some(record => !releaseId.test(record.id ?? '') || !/^[a-f0-9]{64}$/.test(record.digest ?? ''))) {
      warn('Warning: invalid legacy release usage evidence; old installations were retained.'); return;
    }
    if (evidence.owners.every(owner => baselineOwnerHasExited(owner, rows))) {
      for (const record of evidence.candidates) {
        try {
          if ((await metadata(root, record.id)).digest === record.digest) database.prepare('INSERT INTO managed(id,digest) VALUES(?,?) ON CONFLICT(id) DO NOTHING').run(record.id, record.digest);
        } catch { /* Changed or unknown legacy evidence remains protected. */ }
      }
      database.prepare('DELETE FROM legacy WHERE singleton=1').run();
    }
  }
  for (const record of database.prepare('SELECT id,digest FROM managed').all()) {
    if (active.has(record.id)) continue;
    try {
      const { installation, digest } = await metadata(root, record.id);
      if (digest !== record.digest) continue;
      const path = installation.directory.replaceAll('/', '\\').toLowerCase();
      // Surviving MCP/worker/native processes can outlive the parent whose PID lease expired.
      if (rows.some(row => `${row.command}\n${row.executable}`.replaceAll('/', '\\').toLowerCase().includes(path + '\\'))) continue;
      const target = await safeDirectory(root, record.id);
      if (!target) continue;
      // The final absolute target is checked above; no unknown directory is removed.
      await rm(target, { recursive: true });
      database.prepare('DELETE FROM managed WHERE id=?').run(record.id);
    } catch (error) {
      if (error.code === 'ENOENT') database.prepare('DELETE FROM managed WHERE id=?').run(record.id);
      else warn(`Warning: old release ${record.id} was retained because cleanup failed (${error.message}).`);
    }
  }
}

/** Must run within withReleaseCache, before a concrete installation leaves startup. */
export async function selectAndPinRelease(database, root, installation, warn = message => console.error(message), inspect = processes) {
  pin(database, root, installation.id);
  await replaceReleaseFile(root, 'latest.json', JSON.stringify({ formatVersion: 1, id: installation.id }, null, 2) + '\n');
  await prune(database, root, installation.id, warn, inspect);
  return installation;
}

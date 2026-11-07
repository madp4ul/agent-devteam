// Targeted preservation repair; does not adopt a workspace or write database rows.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, readdir, readlink, realpath, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseSync, backup } from 'node:sqlite';
import { acquireProjectStateOperationGuard } from '../../src/application/internal/project-state-operation-guard.ts';
import { validateTaskWorkspaceConsistency } from '../../src/application/internal/git-task-workspace.ts';
const exec = promisify(execFile);
const project = 'D:/Daten/Projekte/Software/Codex/idle-games';
const root = 'D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state';
const source = join(root, 'task-worktrees', 'T-0285');
const recoveryRoot = 'D:/Daten/Projekte/Software/Codex/idle-games-workspace-recovery';
const generation = join(recoveryRoot, 'T-0285-' + new Date().toISOString().replaceAll(':', '-'));
const destination = join(generation, 'checkout');
const guard = await acquireProjectStateOperationGuard(project, 'state maintenance');
let database;
async function hash(path) { const result = createHash('sha256'); for await (const chunk of createReadStream(path)) result.update(chunk); return result.digest('hex'); }
async function files(path) {
  const result = [];
  async function visit(directory) {
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const full = join(directory, entry.name), name = relative(path, full).replaceAll('\\', '/');
      if (name === '.git') continue;
      if (entry.isSymbolicLink()) result.push([name, 'link', await readlink(full)]);
      else if (entry.isDirectory()) { result.push([name, 'directory']); await visit(full); }
      else if (entry.isFile()) result.push([name, 'file', await hash(full)]);
      else throw new Error('Unsupported checkout entry: ' + full);
    }
  }
  await visit(path); return result;
}
const git = async (path, args) => (await exec('git', ['--no-optional-locks', '-c', 'safe.directory=' + path, '-C', path, ...args], { windowsHide: true, maxBuffer: 8 * 1024 * 1024 })).stdout;
try {
  assert.equal(await realpath(dirname(source)), await realpath(join(root, 'task-worktrees')));
  assert.ok(resolve(destination).startsWith(resolve(recoveryRoot) + '\\'));
  database = new DatabaseSync(join(root, 'coordination.sqlite3'), { readOnly: true });
  database.exec('PRAGMA query_only=ON');
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM attempts WHERE status='running'").get().n, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM task_workspaces WHERE task_id='T-0285'").get().n, 0);
  assert.equal(database.prepare("SELECT COUNT(*) AS n FROM attempts a JOIN activations x ON x.id=a.activation_id WHERE x.task_id='T-0285'").get().n, 0);
  const ref = database.prepare("SELECT starting_ref FROM task_starting_refs WHERE task_id='T-0285'").get().starting_ref;
  const head = (await git(source, ['rev-parse', 'HEAD'])).trim();
  assert.equal(head, (await git(project, ['rev-parse', '--verify', ref + '^{commit}'])).trim());
  const status = await git(source, ['status', '--porcelain=v1', '--untracked-files=all']);
  assert.equal(status, '', 'Unexpected checkout changes require a separate recovery decision');
  const pointer = (await readFile(join(source, '.git'), 'utf8')).trim();
  assert.ok(pointer.startsWith('gitdir: '));
  const administration = resolve(source, pointer.slice('gitdir: '.length));
  assert.equal(await realpath(administration), await realpath(join(project, '.git', 'worktrees', 'T-0285')));
  await mkdir(generation, { recursive: true });
  console.log('RECOVERY_GENERATION', generation);
  const dbHash = await hash(join(root, 'coordination.sqlite3'));
  console.log('BACKING_UP_DATABASE');
  await backup(database, join(generation, 'coordination-before.sqlite3'));
  const verification = new DatabaseSync(join(generation, 'coordination-before.sqlite3'), { readOnly: true });
  try { assert.equal(verification.prepare('PRAGMA integrity_check').get().integrity_check, 'ok'); assert.deepEqual(verification.prepare('PRAGMA foreign_key_check').all(), []); } finally { verification.close(); }
  console.log('BACKING_UP_CHECKOUT_AND_GIT_METADATA');
  await cp(administration, join(generation, 'git-admin-before'), { recursive: true, force: false, errorOnExist: true });
  await cp(source, join(generation, 'checkout-before'), { recursive: true, force: false, errorOnExist: true, dereference: false });
  const before = await files(source);
  assert.deepEqual(await files(join(generation, 'checkout-before')), before, 'Checkout recovery copy differs');
  const indexHash = await hash(join(administration, 'index'));
  await writeFile(join(generation, 'before.json'), JSON.stringify({ source, destination, administration, head, ref, status, indexHash, dbHash, files: before }, null, 2) + '\n', { flag: 'wx' });
  console.log('PRESERVING_ORPHAN_WITH_GIT_MOVE');
  await git(project, ['worktree', 'move', source, destination]);
  assert.deepEqual(await files(destination), before, 'Preserved checkout differs');
  assert.equal((await git(destination, ['rev-parse', 'HEAD'])).trim(), head);
  assert.equal(await git(destination, ['status', '--porcelain=v1', '--untracked-files=all']), status);
  assert.equal(await hash(join(administration, 'index')), indexHash);
  assert.equal(await hash(join(root, 'coordination.sqlite3')), dbHash, 'Database changed during metadata-only recovery');
  const records = database.prepare('SELECT task_id,path,starting_ref,commit_id FROM task_workspaces').all()
    .map((row) => ({ taskId: row.task_id, workspace: { path: row.path, startingRef: row.starting_ref, commit: row.commit_id } }));
  const diagnostics = await validateTaskWorkspaceConsistency(project, join(root, 'task-worktrees'), records);
  assert.deepEqual(diagnostics, []);
  const report = { completedAt: new Date().toISOString(), source, destination, head, indexHash, dbHash, verifiedFileEntries: before.length, diagnostics };
  await writeFile(join(generation, 'verified-recovery.json'), JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log('VERIFIED_RECOVERY', JSON.stringify(report));
} finally { database?.close(); await guard.release(); }

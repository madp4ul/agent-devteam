// Read-only diagnostic for the reported startup block. Never starts automation.
import { DatabaseSync } from 'node:sqlite';
import { validateTaskWorkspaceConsistency } from '../../src/application/internal/git-task-workspace.ts';
const root = 'D:/Daten/Projekte/Software/Codex/idle-games-agent-coordination-state';
const database = new DatabaseSync(root + '/coordination.sqlite3', { readOnly: true });
try {
  const records = database.prepare('SELECT task_id, path, starting_ref, commit_id FROM task_workspaces').all()
    .map((row) => ({ taskId: row.task_id, workspace: { path: row.path, startingRef: row.starting_ref, commit: row.commit_id } }));
  const diagnostics = await validateTaskWorkspaceConsistency('D:/Daten/Projekte/Software/Codex/idle-games', root + '/task-worktrees', records);
  console.log(JSON.stringify({ workspaceRecords: records.length, diagnostics }, null, 2));
  process.exitCode = diagnostics.length ? 1 : 0;
} finally { database.close(); }

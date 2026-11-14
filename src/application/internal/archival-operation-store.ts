import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ArchivalFailure, ArchivalOperation, ArchivalOperationTask, ArchivalTarget } from "../archival-operation-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { ArchivalMenuPage, ArchivalMenuTask } from "../activity-menu-contract.ts";

interface OperationRow {
  sequence: number;
  id: string; request_hash: string; target_json: string; label: string; state: ArchivalOperation["state"]; updated_at: string; dismissed: number;
}
interface TaskRow { task_id: string; title: string; state: ArchivalOperationTask["state"]; failure_json: string | null }
interface MenuTaskRow extends TaskRow { operation_id: string; updated_at: string; history_sequence: number | null }

export class ArchivalOperationStore {
  readonly #database: DatabaseSync;
  readonly #owner: CoordinationDatabase;
  readonly #epoch = randomUUID();
  #revision = 0;

  constructor(database: CoordinationDatabase) { this.#owner = database; this.#database = database.connection; }

  version(): string { return `"${this.#epoch}-${this.#revision}"`; }

  summary(): { active: number; history: number } {
    const history = this.#database.prepare("SELECT COUNT(*) AS count FROM archival_operation_tasks WHERE dismissed = 0 AND state IN ('archived', 'failed', 'interrupted')").get() as { count: number };
    const active = this.#database.prepare("SELECT COUNT(*) AS count FROM archival_operation_tasks WHERE state IN ('queued', 'running')").get() as { count: number };
    return { active: active.count, history: history.count };
  }

  menu(before?: number): ArchivalMenuPage {
    const rows = this.#database.prepare(`SELECT * FROM archival_operation_tasks WHERE dismissed = 0
      AND state IN ('archived', 'failed', 'interrupted') AND history_sequence < ? ORDER BY history_sequence DESC LIMIT 21`)
      .all(before ?? Number.MAX_SAFE_INTEGER) as unknown as MenuTaskRow[];
    const active = this.#database.prepare("SELECT task.* FROM archival_operation_tasks task JOIN archival_operations operation ON operation.id = task.operation_id WHERE task.state IN ('queued', 'running') ORDER BY operation.sequence, task.position").all() as unknown as MenuTaskRow[];
    return { entries: [...active, ...rows.slice(0, 20)].map(menuTask), cursor: rows.length > 20 ? rows[19]!.history_sequence : null };
  }

  clearFinished(): void {
    const changed = this.#owner.transaction(() => {
      const tasks = this.#database.prepare("UPDATE archival_operation_tasks SET dismissed = 1 WHERE dismissed = 0 AND state IN ('archived', 'failed', 'interrupted')").run();
      const operations = this.#database.prepare("UPDATE archival_operations SET dismissed = 1 WHERE dismissed = 0 AND state IN ('completed', 'interrupted')").run();
      return tasks.changes > 0 || operations.changes > 0;
    });
    if (changed) this.#revision += 1;
  }

  read(id: string): { operation: ArchivalOperation; requestHash: string } | undefined {
    const row = this.#database.prepare(`SELECT * FROM archival_operations WHERE id = ?
      UNION ALL SELECT operation.sequence, operation.id, request.request_hash, operation.target_key, operation.target_json,
        operation.label, operation.state, operation.attention, operation.dismissed, operation.updated_at
      FROM archival_operation_requests request JOIN archival_operations operation ON operation.id = request.operation_id
      WHERE request.id = ?`).get(id, id) as OperationRow | undefined;
    return row && { operation: this.#view(row), requestHash: row.request_hash };
  }

  active(target: ArchivalTarget): { operation: ArchivalOperation; requestHash: string } | undefined {
    const row = this.#database.prepare(`SELECT * FROM archival_operations WHERE target_key = ? AND state IN ('queued', 'running')`)
      .get(targetKey(target)) as OperationRow | undefined;
    return row && { operation: this.#view(row), requestHash: row.request_hash };
  }

  list(activeOnly = false, taskId?: string): ArchivalOperation[] {
    const scope = taskId === undefined ? "" : "AND id IN (SELECT operation_id FROM archival_operation_tasks WHERE task_id = ?)";
    const rows = this.#database.prepare(activeOnly
      ? `SELECT * FROM archival_operations WHERE state IN ('queued', 'running') ${scope} ORDER BY sequence`
      : `SELECT * FROM archival_operations WHERE (state IN ('queued', 'running') OR dismissed = 0) ${scope} ORDER BY sequence DESC`)
      .all(...(taskId === undefined ? [] : [taskId])) as unknown as OperationRow[];
    return rows.map((row) => this.#view(row));
  }

  create(operation: ArchivalOperation, requestHash: string): void {
    this.#owner.transaction(() => {
      this.#database.prepare(`INSERT INTO archival_operations (id, request_hash, target_key, target_json, label, state, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(operation.id, requestHash, targetKey(operation.target), JSON.stringify(operation.target),
          operation.label, operation.state, operation.updatedAt);
      const insert = this.#database.prepare(`INSERT INTO archival_operation_tasks
        (operation_id, position, task_id, title, state, failure_json, updated_at, history_sequence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
      const sequence = this.#database.prepare("SELECT COALESCE(MAX(history_sequence), 0) + 1 AS next FROM archival_operation_tasks WHERE history_sequence IS NOT NULL");
      for (const [position, task] of operation.tasks.entries()) insert.run(operation.id, position, task.taskId, task.title, task.state,
        task.failure ? JSON.stringify(task.failure) : null, operation.updatedAt,
        task.state === "queued" || task.state === "running" ? null : (sequence.get() as { next: number }).next);
    });
    this.#revision += 1;
  }

  rememberDuplicate(id: string, requestHash: string, operationId: string): void {
    this.#database.prepare("INSERT INTO archival_operation_requests VALUES (?, ?, ?)").run(id, requestHash, operationId);
  }

  update(operation: ArchivalOperation, tasks: readonly ArchivalOperationTask[] = []): void {
    operation.updatedAt = new Date(Math.max(Date.now(), Date.parse(operation.updatedAt) + 1)).toISOString();
    const attention = operation.state === "interrupted" || tasks.some((task) => task.state === "failed");
    this.#owner.transaction(() => {
      this.#database.prepare("UPDATE archival_operations SET state = ?, attention = MAX(attention, ?), updated_at = ? WHERE id = ?")
        .run(operation.state, Number(attention), operation.updatedAt, operation.id);
      const update = this.#database.prepare(`UPDATE archival_operation_tasks SET
        updated_at = CASE WHEN state != ? OR failure_json IS NOT ? THEN ? ELSE updated_at END,
        history_sequence = CASE WHEN history_sequence IS NULL AND ? IN ('archived', 'failed', 'interrupted')
          THEN (SELECT COALESCE(MAX(history_sequence), 0) + 1 FROM archival_operation_tasks WHERE history_sequence IS NOT NULL) ELSE history_sequence END,
        state = ?, failure_json = ? WHERE operation_id = ? AND task_id = ?`);
      for (const task of tasks) {
        const failure = task.failure ? JSON.stringify(task.failure) : null;
        update.run(task.state, failure, operation.updatedAt, task.state, task.state, failure, operation.id, task.taskId);
      }
    });
    this.#revision += 1;
  }

  dismiss(id: string): void {
    const result = this.#owner.transaction(() => {
      const operation = this.#database.prepare("UPDATE archival_operations SET dismissed = 1 WHERE id = ? AND dismissed = 0 AND state IN ('completed', 'interrupted')").run(id);
      if (operation.changes > 0) this.#database.prepare("UPDATE archival_operation_tasks SET dismissed = 1 WHERE operation_id = ? AND state IN ('archived', 'failed', 'interrupted')").run(id);
      return operation;
    });
    if (result.changes > 0) this.#revision += 1;
  }

  targetLabel(target: ArchivalTarget): string | undefined {
    if (target.kind === "task") {
      const row = this.#database.prepare("SELECT title FROM tasks WHERE id = ?").get(target.taskId) as { title: string } | undefined;
      return row && `${target.taskId} · ${row.title}`;
    }
    const row = this.#database.prepare("SELECT name FROM boards WHERE id = ? AND applied = 1").get(target.boardId) as { name: string } | undefined;
    return row && `${row.name} · Completion`;
  }

  #view(row: OperationRow): ArchivalOperation {
    const tasks = this.#database.prepare("SELECT task_id, title, state, failure_json FROM archival_operation_tasks WHERE operation_id = ? ORDER BY position")
      .all(row.id) as unknown as TaskRow[];
    return { id: row.id, target: JSON.parse(row.target_json) as ArchivalTarget, label: row.label, state: row.state, updatedAt: row.updated_at,
      ...(row.dismissed ? { feedbackDismissed: true } : {}),
      tasks: tasks.map((task) => ({ taskId: task.task_id, title: task.title, state: task.state,
        ...(task.failure_json === null ? {} : { failure: JSON.parse(task.failure_json) as ArchivalFailure }) })) };
  }
}

function menuTask(row: MenuTaskRow): ArchivalMenuTask {
  return { id: JSON.stringify([row.operation_id, row.task_id]), operationId: row.operation_id, taskId: row.task_id,
    title: row.title, state: row.state, updatedAt: row.updated_at,
    ...(row.failure_json === null ? {} : { failure: JSON.parse(row.failure_json) as ArchivalFailure }) };
}

function targetKey(target: ArchivalTarget): string {
  return target.kind === "task" ? `task:${target.taskId}` : `completion:${target.boardId}`;
}

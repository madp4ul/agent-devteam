import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { ArchivalFailure, ArchivalOperation, ArchivalOperationTask, ArchivalTarget } from "../archival-operation-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

interface OperationRow {
  id: string; request_hash: string; target_json: string; label: string; state: ArchivalOperation["state"]; updated_at: string; dismissed: number;
}
interface TaskRow { task_id: string; title: string; state: ArchivalOperationTask["state"]; failure_json: string | null }

export class ArchivalOperationStore {
  readonly #database: DatabaseSync;
  readonly #owner: CoordinationDatabase;
  readonly #epoch = randomUUID();
  #revision = 0;

  constructor(database: CoordinationDatabase) { this.#owner = database; this.#database = database.connection; }

  version(): string { return `"${this.#epoch}-${this.#revision}"`; }

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
      ? "SELECT * FROM archival_operations WHERE state IN ('queued', 'running') ORDER BY sequence"
      : `SELECT * FROM archival_operations WHERE (state IN ('queued', 'running') OR (dismissed = 0 AND attention = 1)) ${scope}
        UNION ALL SELECT * FROM (SELECT * FROM archival_operations
          WHERE dismissed = 0 AND attention = 0 AND state = 'completed' ${scope} ORDER BY sequence DESC LIMIT 15)`)
      .all(...(activeOnly || taskId === undefined ? [] : [taskId, taskId])) as unknown as OperationRow[];
    return rows.map((row) => this.#view(row));
  }

  create(operation: ArchivalOperation, requestHash: string): void {
    this.#owner.transaction(() => {
      this.#database.prepare(`INSERT INTO archival_operations (id, request_hash, target_key, target_json, label, state, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).run(operation.id, requestHash, targetKey(operation.target), JSON.stringify(operation.target),
          operation.label, operation.state, operation.updatedAt);
      const insert = this.#database.prepare("INSERT INTO archival_operation_tasks VALUES (?, ?, ?, ?, ?, NULL)");
      for (const [position, task] of operation.tasks.entries()) insert.run(operation.id, position, task.taskId, task.title, task.state);
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
      const update = this.#database.prepare("UPDATE archival_operation_tasks SET state = ?, failure_json = ? WHERE operation_id = ? AND task_id = ?");
      for (const task of tasks) update.run(task.state, task.failure ? JSON.stringify(task.failure) : null, operation.id, task.taskId);
    });
    this.#revision += 1;
  }

  dismiss(id: string): void {
    const result = this.#database.prepare("UPDATE archival_operations SET dismissed = 1 WHERE id = ? AND dismissed = 0").run(id);
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

function targetKey(target: ArchivalTarget): string {
  return target.kind === "task" ? `task:${target.taskId}` : `completion:${target.boardId}`;
}

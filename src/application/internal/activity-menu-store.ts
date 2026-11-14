import type { ActivityMenuEntry, ActivityMenuHistory } from "../activity-menu-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";

export class ActivityMenuStore {
  readonly #owner: CoordinationDatabase;
  constructor(owner: CoordinationDatabase) { this.#owner = owner; }

  read(before?: number): ActivityMenuHistory {
    const rows = this.#owner.connection.prepare(`SELECT id, kind, task_id AS taskId, task_title AS taskTitle,
      agent_id AS agentId, started_at AS startedAt, finished_at AS finishedAt, status, summary, sequence
      FROM activity_menu_history WHERE dismissed = 0 AND kind = 'preparation' AND finished_at IS NOT NULL AND sequence < ?
      ORDER BY sequence DESC LIMIT 51`).all(before ?? Number.MAX_SAFE_INTEGER) as unknown as Array<ActivityMenuEntry & { sequence: number }>;
    const runs = this.#owner.connection.prepare(`SELECT id, kind, task_id AS taskId, task_title AS taskTitle,
      agent_id AS agentId, started_at AS startedAt, finished_at AS finishedAt, status, summary
      , COALESCE((SELECT name FROM agents WHERE agents.id = activity_menu_history.agent_id), agent_id) AS agentName
      FROM activity_menu_history WHERE dismissed = 0 AND kind = 'run' ORDER BY sequence DESC LIMIT 30`).all() as unknown as ActivityMenuEntry[];
    const active = this.#owner.connection.prepare(`SELECT id, kind, task_id AS taskId, task_title AS taskTitle,
      agent_id AS agentId, started_at AS startedAt, finished_at AS finishedAt, status, summary
      FROM activity_menu_history WHERE kind = 'preparation' AND finished_at IS NULL ORDER BY sequence DESC`).all() as unknown as ActivityMenuEntry[];
    return { preparations: [...active, ...rows.slice(0, 50)], runs, preparationCursor: rows.length > 50 ? rows[49]!.sequence : null };
  }

  summary(): { revision: string; active: number; history: number } {
    const row = this.#owner.connection.prepare(`SELECT COALESCE(MAX(sequence), 0) AS latest, COUNT(*) AS total,
      COALESCE(SUM(dismissed), 0) AS dismissed, COALESCE(SUM(finished_at IS NOT NULL), 0) AS finished,
      COALESCE(SUM(kind = 'preparation' AND dismissed = 0 AND finished_at IS NULL), 0) AS active,
      COALESCE(SUM(kind = 'preparation' AND dismissed = 0 AND finished_at IS NOT NULL), 0) AS history
      FROM activity_menu_history`).get() as { latest: number; total: number; dismissed: number; finished: number; active: number; history: number };
    return { revision: `${row.latest}:${row.total}:${row.dismissed}:${row.finished}`, active: row.active, history: row.history };
  }

  clearFinished(kind: "preparation" | "run"): void {
    // Clearing at the command boundary protects work that is still active there.
    this.#owner.connection.prepare("UPDATE activity_menu_history SET dismissed = 1 WHERE kind = ? AND finished_at IS NOT NULL").run(kind);
    if (kind === "preparation") this.#owner.connection.exec("DELETE FROM activity_menu_history WHERE kind = 'preparation' AND dismissed = 1");
  }

  startPreparation(entry: Pick<ActivityMenuEntry, "id" | "taskId" | "taskTitle" | "agentId" | "startedAt">): void {
    this.#owner.connection.prepare(`INSERT INTO activity_menu_history
      (id, kind, task_id, task_title, agent_id, started_at, status, summary)
      VALUES (?, 'preparation', ?, ?, ?, ?, 'preparing', '')`)
      .run(entry.id, entry.taskId, entry.taskTitle, entry.agentId, entry.startedAt);
  }

  finishPreparation(id: string, status: "prepared" | "failed" | "interrupted", summary: string, now: string): void {
    this.#owner.connection.prepare(`UPDATE activity_menu_history SET status = ?, summary = ?, finished_at = ?,
      sequence = (SELECT COALESCE(MAX(sequence), 0) + 1 FROM activity_menu_history)
      WHERE id = ? AND kind = 'preparation' AND finished_at IS NULL`).run(status, summary.slice(0, 2000), now, id);
  }

  recoverPreparations(now: string): void {
    const pending = this.#owner.connection.prepare("SELECT id FROM activity_menu_history WHERE kind = 'preparation' AND finished_at IS NULL").all() as Array<{ id: string }>;
    if (!pending.length) return;
    this.#owner.transaction(() => {
      for (const { id } of pending) this.finishPreparation(id, "interrupted", "The host stopped during workspace preparation.", now);
    });
  }

  /** Called inside the attempt settlement transaction, before archival can remove its source. */
  recordRunWithinTransaction(attemptId: string): void {
    this.#owner.connection.prepare(`INSERT OR IGNORE INTO activity_menu_history
      (id, kind, task_id, task_title, agent_id, started_at, finished_at, status, summary)
      SELECT attempt.id, 'run', task.id, task.title, activation.target_agent_id, attempt.started_at, attempt.completed_at,
        CASE WHEN attempt.outcome_kind = 'interrupted' THEN 'interrupted' ELSE attempt.status END,
        substr(COALESCE(attempt.outcome_summary, ''), 1, 2000)
      FROM attempts attempt JOIN activations activation ON activation.id = attempt.activation_id
      JOIN tasks task ON task.id = activation.task_id
      WHERE attempt.id = ? AND attempt.status != 'running' AND attempt.provisional_probe = 0`).run(attemptId);
    // Dismissed entries still occupy their original position in the latest thirty.
    this.#owner.connection.exec(`DELETE FROM activity_menu_history WHERE kind = 'run' AND sequence NOT IN
      (SELECT sequence FROM activity_menu_history WHERE kind = 'run' ORDER BY sequence DESC LIMIT 30)`);
  }

  dismiss(ids: readonly string[]): void {
    this.#owner.transaction(() => {
      const update = this.#owner.connection.prepare(`UPDATE activity_menu_history SET dismissed = 1
        WHERE id = ? AND finished_at IS NOT NULL`);
      for (const id of ids) update.run(id);
      this.#owner.connection.exec("DELETE FROM activity_menu_history WHERE kind = 'preparation' AND dismissed = 1");
    });
  }
}

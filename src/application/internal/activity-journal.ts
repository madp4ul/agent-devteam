import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { TaskActivityView } from "../task-contract.ts";

export class ActivityJournal {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  append(
    taskId: string,
    type: TaskActivityView["type"],
    actor: TaskActivityView["actor"],
    details: Record<string, string>,
    occurredAt = new Date().toISOString(),
  ): string {
    if (type !== "attempt.started" && details.attemptId) this.promoteProbe(details.attemptId, occurredAt);
    const id = randomUUID();
    this.#database
      .prepare(
        `INSERT INTO activity_ledger
          (id, task_id, type, actor_kind, actor_id, occurred_at, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, taskId, type, actor.kind, actor.id, occurredAt, JSON.stringify(details));
    return id;
  }

  /** Publish a provisional recovery probe before retaining meaningful effects. Caller owns the transaction. */
  promoteProbe(attemptId: string, occurredAt: string): void {
    const row = this.#database.prepare(`SELECT attempt.activation_id, attempt.thread_id, activation.task_id,
      activation.target_agent_id, activation.definition_version FROM attempts attempt
      JOIN activations activation ON activation.id = attempt.activation_id
      WHERE attempt.id = ? AND attempt.provisional_probe = 1`).get(attemptId) as
      { activation_id: string; thread_id: string | null; task_id: string; target_agent_id: string; definition_version: string } | undefined;
    if (!row) return;
    this.#database.prepare("UPDATE attempts SET provisional_probe = 0 WHERE id = ?").run(attemptId);
    this.#database.prepare("DELETE FROM activation_dispatch_claims WHERE attempt_id = ?").run(attemptId);
    this.append(row.task_id, "attempt.started", { kind: "agent", id: row.target_agent_id },
      { activationId: row.activation_id, attemptId, definitionVersion: row.definition_version, ...(row.thread_id === null ? {} : { threadId: row.thread_id }) }, occurredAt);
  }
}

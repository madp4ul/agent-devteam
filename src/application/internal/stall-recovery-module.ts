import type { DatabaseSync } from "node:sqlite";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { ActivationCreationModule } from "./activation-creation-module.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { AttentionRecorder } from "./attention-recorder.ts";

const recoveryLimit = 3;

// Shared by reconciliation and dispatch recheck. The caller owns the transaction.
const eligibleTask = `
  FROM tasks task
  JOIN mapped_tasks mapped ON mapped.id = task.id
  JOIN columns column ON column.board_id = task.board_id AND column.id = task.column_id
  JOIN agents agent ON agent.id = column.watching_agent_id AND agent.applied = 1
  JOIN task_stall_recovery state ON state.task_id = task.id
  WHERE task.archived_at IS NULL AND task.archival_pending = 0
    AND task.column_id <> 'completion' AND task.automation_suspended = 0
    AND NOT EXISTS (SELECT 1 FROM activations work
      WHERE work.task_id = task.id AND work.status <> 'completed' AND work.id <> ?)
    AND NOT EXISTS (SELECT 1 FROM attention_reasons attention
      WHERE attention.task_id = task.id AND attention.resolved_at IS NULL)
    AND NOT EXISTS (SELECT 1 FROM task_relationships relationship
      JOIN tasks target ON target.id = relationship.target_task_id
      WHERE relationship.source_task_id = task.id AND target.column_id <> 'completion')`;

export class StallRecoveryModule {
  readonly #database: DatabaseSync;
  readonly #activationCreation: ActivationCreationModule;
  readonly #journal: ActivityJournal;
  readonly #attention: AttentionRecorder;

  constructor(database: CoordinationDatabase, creation: ActivationCreationModule,
    journal: ActivityJournal, attention: AttentionRecorder) {
    this.#database = database.connection;
    this.#activationCreation = creation;
    this.#journal = journal;
    this.#attention = attention;
  }

  reconcileWithinTransaction(now: Date): void {
    this.#database.exec(`INSERT OR IGNORE INTO task_stall_recovery(task_id) SELECT id FROM tasks`);
    const pending = this.#database.prepare(`SELECT id, task_id, target_agent_id FROM activations
      WHERE reason_type = 'stall-recovery' AND status = 'queued' AND stale = 0`).all() as
      Array<{ id: string; task_id: string; target_agent_id: string }>;
    for (const activation of pending) {
      // Suspensions preserve unfinished work; process-version approval remains explicit.
      const suspended = this.#database.prepare("SELECT automation_suspended FROM tasks WHERE id = ?")
        .get(activation.task_id) as { automation_suspended: number };
      if (suspended.automation_suspended === 0 &&
          !this.dispatchIsNeeded(activation.id, activation.task_id, activation.target_agent_id, now)) {
        this.skipWithinTransaction(activation.id, activation.task_id, now);
      }
    }
    const candidates = this.#database.prepare(`SELECT task.id, column.watching_agent_id,
      state.recovery_count, task.column_id ${eligibleTask}
      AND (state.grace_until IS NULL OR state.grace_until <= ?) ORDER BY task.sequence`)
      .all("", now.toISOString()) as Array<{
        id: string; watching_agent_id: string; recovery_count: number; column_id: string;
      }>;
    for (const task of candidates) {
      if (task.recovery_count >= recoveryLimit) {
        const recoveries = this.#database.prepare(`SELECT activation.id FROM activations activation
          JOIN stall_recovery_activations recovery ON recovery.activation_id = activation.id
          WHERE activation.task_id = ? AND recovery.dispatched = 1
          ORDER BY activation.sequence DESC LIMIT 3`).all(task.id) as Array<{ id: string }>;
        const event = this.#journal.append(task.id, "stall.recovery-exhausted",
          { kind: "framework", id: "coordination" }, { recoveryCount: String(recoveryLimit),
            activationIds: recoveries.reverse().map(({ id }) => id).join(","),
            explanation: "Three automatic recovery activations finished without establishing a continuation path. Please review the task and arrange how work should continue." },
          now.toISOString());
        this.#attention.record("stall-recovery-exhausted", task.id, event, now.toISOString());
        continue;
      }
      const recoveryNumber = task.recovery_count + 1;
      const event = this.#journal.append(task.id, "stall.detected",
        { kind: "framework", id: "coordination" }, { recoveryNumber: String(recoveryNumber),
          recoveryLimit: String(recoveryLimit), targetAgentId: task.watching_agent_id,
          columnId: task.column_id }, now.toISOString());
      const activationId = this.#activationCreation.createOrdinary({ taskId: task.id,
        targetAgentId: task.watching_agent_id, reasonType: "stall-recovery",
        sourceEventId: event, occurredAt: now.toISOString() });
      this.#database.prepare(`INSERT INTO stall_recovery_activations (activation_id, recovery_number)
        VALUES (?, ?)`).run(activationId, recoveryNumber);
    }
  }

  dispatchIsNeeded(activationId: string, taskId: string, agentId: string, now: Date): boolean {
    const recovery = this.#database.prepare(
      "SELECT dispatched FROM stall_recovery_activations WHERE activation_id = ?",
    ).get(activationId) as { dispatched: number } | undefined;
    // Once dispatched, this is unfinished work governed by the ordinary retry policy.
    if (recovery?.dispatched === 1) return true;
    return this.#database.prepare(`SELECT 1 ${eligibleTask}
      AND task.id = ? AND column.watching_agent_id = ?
      AND (state.grace_until IS NULL OR state.grace_until <= ?)`)
      .get(activationId, taskId, agentId, now.toISOString()) !== undefined;
  }

  skipWithinTransaction(activationId: string, taskId: string, now: Date): void {
    this.#database.prepare(`UPDATE activations SET status = 'completed', resolution = 'superseded',
      retry_due_at = NULL WHERE id = ?`).run(activationId);
    this.#journal.append(taskId, "stall.recovery-skipped", { kind: "framework", id: "coordination" },
      { activationId, explanation: "Recovery was skipped because the task no longer needed this activation." }, now.toISOString());
  }

  recordDispatchWithinTransaction(activationId: string, taskId: string): void {
    const changed = this.#database.prepare(`UPDATE stall_recovery_activations SET dispatched = 1
      WHERE activation_id = ? AND dispatched = 0`).run(activationId);
    if (changed.changes === 1) this.#database.prepare(`UPDATE task_stall_recovery
      SET recovery_count = recovery_count + 1 WHERE task_id = ?`).run(taskId);
  }

  readNextGraceDueAt(now: Date): string | undefined {
    const result = this.#database.prepare(`SELECT MIN(state.grace_until) AS due_at
      ${eligibleTask} AND state.grace_until > ?`).get("", now.toISOString()) as { due_at: string | null };
    return result.due_at ?? undefined;
  }
}

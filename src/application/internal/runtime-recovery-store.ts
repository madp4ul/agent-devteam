import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { RuntimeWaitingView } from "../automation-contract.ts";
import type { TransientRuntimeFailure } from "../runtime-failure.ts";
import type { ActivityJournal } from "./activity-journal.ts";

interface EpisodeRow {
  id: string; activation_id: string; task_id: string; classification: TransientRuntimeFailure["kind"];
  first_failure: string; latest_failure: string; first_at: string; latest_at: string; next_eligible_at: string;
  failure_count: number; retry_count: number; samples_json: string; status: string;
}
interface DiagnosticSample { at: string; diagnostic: string; code?: string }

/** Mutable outage summaries; callers participate in their existing command/settlement transaction. */
export class RuntimeRecoveryStore {
  readonly #db: DatabaseSync;
  readonly #journal: ActivityJournal;
  constructor(db: DatabaseSync, journal: ActivityJournal) { this.#db = db; this.#journal = journal; }

  readWaiting(activationId: string): RuntimeWaitingView | undefined {
    const row = this.readRow(activationId);
    if (!row) return undefined;
    return { state: "waiting", episodeId: row.id, activationId, classification: row.classification,
      firstFailure: row.first_failure, latestFailure: row.latest_failure, firstAt: row.first_at, latestAt: row.latest_at,
      dueAt: row.next_eligible_at, failureCount: row.failure_count, retryCount: row.retry_count, retrying: row.status === "running" };
  }

  recordFailureWithinTransaction(activationId: string, failure: TransientRuntimeFailure, now: Date): void {
    const row = this.readRow(activationId);
    const at = now.toISOString();
    const sample: DiagnosticSample = { at, diagnostic: failure.diagnostic, ...(failure.code === undefined ? {} : { code: failure.code }) };
    if (row) {
      const prior = JSON.parse(row.samples_json) as DiagnosticSample[];
      const samples = prior.some((item) => item.diagnostic === sample.diagnostic && item.code === sample.code) ? prior : [prior[0]!, ...prior.slice(1).slice(-1), sample];
      this.#db.prepare(`UPDATE runtime_recovery_episodes SET classification = ?, latest_failure = ?, latest_at = ?, next_eligible_at = ?, failure_count = failure_count + 1, samples_json = ? WHERE id = ?`)
        .run(failure.kind, failure.diagnostic, at, failure.dueAt, JSON.stringify(samples), row.id);
    } else {
      const id = randomUUID();
      this.#db.prepare(`INSERT INTO runtime_recovery_episodes(id, activation_id, classification, state, first_failure, latest_failure, first_at, latest_at, next_eligible_at, samples_json)
        VALUES (?, ?, ?, 'waiting', ?, ?, ?, ?, ?, ?)`)
        .run(id, activationId, failure.kind, failure.diagnostic, failure.diagnostic, at, at, failure.dueAt, JSON.stringify([sample]));
      const taskId = (this.#db.prepare("SELECT task_id FROM activations WHERE id = ?").get(activationId) as { task_id: string }).task_id;
      this.#journal.append(taskId, "runtime.waiting", { kind: "framework", id: "coordination" }, { activationId, episodeId: id, classification: failure.kind, summary: failure.diagnostic }, at);
    }
    this.#db.prepare("UPDATE activations SET status = 'queued', retry_due_at = ?, failure_kind = 'technical', failure_summary = ? WHERE id = ?")
      .run(failure.dueAt, failure.diagnostic, activationId);
  }

  finishWithinTransaction(activationId: string, state: "recovered" | "stopped" | "ordinary", now: Date): void {
    const row = this.readRow(activationId);
    if (!row) return;
    const at = now.toISOString();
    this.#db.prepare("UPDATE runtime_recovery_episodes SET state = ?, resolved_at = ? WHERE id = ?").run(state, at, row.id);
    this.#journal.append(row.task_id, state === "recovered" ? "runtime.recovered" : state === "stopped" ? "runtime.waiting-stopped" : "runtime.waiting-ended", { kind: "framework", id: "coordination" },
      { activationId, episodeId: row.id, classification: row.classification, failureCount: String(row.failure_count), retryCount: String(row.retry_count), firstFailure: row.first_failure, latestFailure: row.latest_failure }, at);
  }

  private readRow(activationId: string): EpisodeRow | undefined {
    return this.#db.prepare(`SELECT episode.*, activation.task_id, activation.status FROM runtime_recovery_episodes episode JOIN activations activation ON activation.id = episode.activation_id
      WHERE episode.activation_id = ? AND episode.state = 'waiting'`).get(activationId) as unknown as EpisodeRow | undefined;
  }
}

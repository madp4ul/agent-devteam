import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type {
  AgentRunAgent,
  AttemptContextView,
  RuntimeStartupBoundary,
  RuntimeStartupDiagnostic,
} from "../runtime-contract.ts";
import type { TaskActivityView, TaskView, TaskWorkspaceView } from "../task-contract.ts";
import type { ActivityJournal } from "./activity-journal.ts";
import type { AttentionRecorder } from "./attention-recorder.ts";
import type { ConversationProjectionModule } from "./conversation-projection-module.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";

export interface ClaimedActivation {
  activation: ActivationView;
  task: TaskView;
  agent: AgentRunAgent;
  sourceEvent: TaskActivityView | TaskView["comments"][number];
  continuationMessage: string | null;
  resumeThreadId?: string;
  fullCompositionReason?: NonNullable<AttemptContextView["fullCompositionReason"]>;
  workspace: TaskWorkspaceView | undefined;
  attempt: { id: string; number: number };
}

export interface StartedAttempt {
  id: string;
  number: number;
}

export class ActivationSchedulingModule {
  readonly #owner: CoordinationDatabase;
  readonly #database: DatabaseSync;
  readonly #taskProjections: TaskProjectionStore;
  readonly #conversationProjections: ConversationProjectionModule;
  readonly #activityJournal: ActivityJournal;
  readonly #attentionRecorder: AttentionRecorder;

  constructor(
    database: CoordinationDatabase,
    taskProjections: TaskProjectionStore,
    conversationProjections: ConversationProjectionModule,
    activityJournal: ActivityJournal,
    attentionRecorder: AttentionRecorder,
  ) {
    this.#owner = database;
    this.#database = database.connection;
    this.#taskProjections = taskProjections;
    this.#conversationProjections = conversationProjections;
    this.#activityJournal = activityJournal;
    this.#attentionRecorder = attentionRecorder;
  }

  claimNextRunnable(
    now: Date,
    pathForUnprovisionedTask: (taskId: string) => string,
  ): ClaimedActivation | undefined {
    return this.#owner.transaction(() => {
      const occurredAt = now.toISOString();
      const row = this.#database.prepare(
        `SELECT a.id, a.task_id, a.target_agent_id, a.source_event_id,
                a.model, a.reasoning_effort, a.continuation_message, a.definition_version,
                conversation.current_thread_id
         FROM activations a
         LEFT JOIN agent_conversations conversation ON conversation.id = a.conversation_id
         JOIN tasks task ON task.id = a.task_id
         JOIN mapped_tasks mapped ON mapped.id = task.id
         JOIN agents agent ON agent.id = a.target_agent_id AND agent.applied = 1
         WHERE a.status = 'queued'
           AND a.stale = 0
           AND task.automation_suspended = 0
           AND (a.retry_due_at IS NULL OR a.retry_due_at <= ?)
           AND NOT EXISTS (
             SELECT 1
             FROM task_relationships relationship
             JOIN tasks blocker ON blocker.id = relationship.target_task_id
             WHERE relationship.type IN ('dependency', 'parent-child')
               AND relationship.source_task_id = a.task_id
               AND blocker.column_id <> 'completion'
           )
           AND NOT EXISTS (
             SELECT 1
             FROM activations earlier
             WHERE earlier.task_id = a.task_id
               AND earlier.sequence < a.sequence
               AND earlier.status <> 'completed'
           )
         ORDER BY a.sequence
         LIMIT 1`,
      ).get(occurredAt) as RunnableRow | undefined;
      if (row === undefined) return undefined;

      const task = this.#taskProjections.readTask(row.task_id);
      const activation = task?.activations.find((candidate) => candidate.id === row.id);
      const agentRow = this.#database.prepare(
        `SELECT id, name, role, summary, instructions_content
         FROM agents
         WHERE id = ?`,
      ).get(row.target_agent_id) as AgentRow | undefined;
      const sourceEvent = this.#taskProjections.readSourceEvent(row.source_event_id)
        ?? this.#conversationProjections.readMessage(row.source_event_id);
      if (task === undefined || activation === undefined || agentRow === undefined || sourceEvent === undefined) {
        throw new Error(`Activation ${row.id} has incomplete durable provenance`);
      }
      const agent: AgentRunAgent = {
        id: agentRow.id,
        name: agentRow.name,
        role: agentRow.role,
        summary: agentRow.summary,
        instructions: agentRow.instructions_content,
        ...(row.model === null ? {} : { model: row.model }),
        ...(row.reasoning_effort === null ? {} : { reasoningEffort: row.reasoning_effort }),
      };
      const workspace = this.readTaskWorkspace(row.task_id);
      const result = this.#database.prepare(
        `UPDATE activations
         SET status = 'running', retry_due_at = NULL, continuation_message = NULL
         WHERE id = ? AND status = 'queued'`,
      ).run(row.id);
      if (result.changes !== 1) return undefined;
      const priorAttempts = this.#database.prepare(
        "SELECT COUNT(*) AS count FROM attempts WHERE activation_id = ?",
      ).get(row.id) as { count: number };
      const attempt = { id: randomUUID(), number: priorAttempts.count + 1 };
      this.#database.prepare(
        `INSERT INTO attempts
          (id, activation_id, status, workspace_path, started_at, model, reasoning_effort)
         VALUES (?, ?, 'running', ?, ?, ?, ?)`,
      ).run(
        attempt.id,
        row.id,
        workspace?.path ?? pathForUnprovisionedTask(row.task_id),
        occurredAt,
        agent.model ?? null,
        agent.reasoningEffort ?? null,
      );
      this.#database.prepare(
        `INSERT INTO activation_dispatch_claims (attempt_id, activation_id, claimed_at)
         VALUES (?, ?, ?)`,
      ).run(attempt.id, row.id, occurredAt);
      const precedingAttemptVersion = this.#readLatestAttemptDefinitionVersion(row.task_id, row.id);
      return {
        activation,
        task,
        agent,
        sourceEvent,
        continuationMessage: row.continuation_message,
        workspace,
        attempt,
        ...(row.current_thread_id === null ? {} : { resumeThreadId: row.current_thread_id }),
        ...(precedingAttemptVersion !== undefined && precedingAttemptVersion !== row.definition_version
          ? { fullCompositionReason: "process-rebased" as const }
          : {}),
      };
    });
  }

  readNextRetryDueAt(now: Date): string | undefined {
    const row = this.#database.prepare(
      `SELECT MIN(a.retry_due_at) AS retry_due_at
       FROM activations a
       WHERE a.status = 'queued' AND a.retry_due_at > ?
         AND NOT EXISTS (
           SELECT 1 FROM activations earlier
           WHERE earlier.task_id = a.task_id
             AND earlier.sequence < a.sequence
             AND earlier.status <> 'completed'
         )`,
    ).get(now.toISOString()) as { retry_due_at: string | null };
    return row.retry_due_at ?? undefined;
  }

  startPreparedAttempt(claim: ClaimedActivation, workspace: TaskWorkspaceView): StartedAttempt {
    return this.#owner.transaction(() => {
      const prepared = this.#database.prepare(
        `SELECT activation.task_id, activation.target_agent_id, activation.definition_version,
                attempt.workspace_path
         FROM attempts attempt
         JOIN activations activation ON activation.id = attempt.activation_id
         JOIN activation_dispatch_claims dispatch_claim ON dispatch_claim.attempt_id = attempt.id
         WHERE attempt.id = ? AND activation.id = ?
           AND attempt.status = 'running' AND activation.status = 'running'`,
      ).get(claim.attempt.id, claim.activation.id) as {
        task_id: string;
        target_agent_id: string;
        definition_version: string;
        workspace_path: string;
      } | undefined;
      if (prepared === undefined) throw new Error(`Attempt ${claim.attempt.id} is not prepared`);
      if (prepared.workspace_path !== workspace.path) {
        throw new Error(`Attempt ${claim.attempt.id} was prepared for a different workspace`);
      }
      const registered = this.readTaskWorkspace(prepared.task_id);
      if (registered === undefined) {
        this.#database.prepare(
          `INSERT INTO task_workspaces (task_id, path, starting_ref, commit_id)
           VALUES (?, ?, ?, ?)`,
        ).run(prepared.task_id, workspace.path, workspace.startingRef, workspace.commit);
      } else if (!sameWorkspace(registered, workspace)) {
        throw new Error(`Task ${prepared.task_id} has an inconsistent workspace registration`);
      }
      const occurredAt = new Date().toISOString();
      this.#database.prepare("UPDATE attempts SET started_at = ? WHERE id = ?")
        .run(occurredAt, claim.attempt.id);
      this.#activityJournal.append(
        prepared.task_id,
        "attempt.started",
        { kind: "agent", id: prepared.target_agent_id },
        {
          activationId: claim.activation.id,
          attemptId: claim.attempt.id,
          definitionVersion: prepared.definition_version,
        },
        occurredAt,
      );
      this.#updateConversationActivity(claim.attempt.id, occurredAt);
      const consumed = this.#database.prepare(
        "DELETE FROM activation_dispatch_claims WHERE attempt_id = ? AND activation_id = ?",
      ).run(claim.attempt.id, claim.activation.id);
      if (consumed.changes !== 1) throw new Error(`Attempt ${claim.attempt.id} lost its dispatch claim`);
      return claim.attempt;
    });
  }

  releaseUnstartedClaim(claim: ClaimedActivation): void {
    this.#owner.transaction(() => {
      this.#deleteClaimedProvisionalAttempt(claim);
      const released = this.#database.prepare(
        `UPDATE activations
         SET status = 'queued', continuation_message = ?
         WHERE id = ? AND status = 'running'`,
      ).run(claim.continuationMessage, claim.activation.id);
      if (released.changes !== 1) throw new Error(`Activation ${claim.activation.id} is not starting`);
    });
  }

  failUnstartedClaim(
    claim: ClaimedActivation,
    boundary: RuntimeStartupBoundary,
    diagnostic: string,
  ): RuntimeStartupDiagnostic {
    return this.#owner.transaction(() => {
      const occurredAt = new Date().toISOString();
      const failed = this.#database.prepare(
        `UPDATE activations
         SET status = 'failed', failure_kind = 'technical', failure_summary = ?
         WHERE id = ? AND status = 'running'`,
      ).run(diagnostic, claim.activation.id);
      if (failed.changes !== 1) throw new Error(`Activation ${claim.activation.id} is not starting`);
      this.#deleteClaimedProvisionalAttempt(claim);
      this.#database.prepare(
        `INSERT INTO activation_startup_failures
          (activation_id, occurred_at, boundary, diagnostic, resolved_at)
         VALUES (?, ?, ?, ?, NULL)`,
      ).run(claim.activation.id, occurredAt, boundary, diagnostic);
      this.#attentionRecorder.record(
        "failed-run",
        claim.task.id,
        claim.activation.id,
        occurredAt,
      );
      return {
        taskId: claim.task.id,
        activationId: claim.activation.id,
        occurredAt,
        boundary,
        diagnostic,
        resolvedAt: null,
      };
    });
  }

  readTaskWorkspace(taskId: string): TaskWorkspaceView | undefined {
    const row = this.#database.prepare(
      `SELECT path, starting_ref, commit_id
       FROM task_workspaces
       WHERE task_id = ?`,
    ).get(taskId) as { path: string; starting_ref: string; commit_id: string } | undefined;
    return row === undefined
      ? undefined
      : { path: row.path, startingRef: row.starting_ref, commit: row.commit_id };
  }

  readTaskWorkspaces(): Array<{ taskId: string; workspace: TaskWorkspaceView }> {
    const rows = this.#database.prepare(
      `SELECT task_id, path, starting_ref, commit_id
       FROM task_workspaces
       ORDER BY task_id`,
    ).all() as Array<{
      task_id: string;
      path: string;
      starting_ref: string;
      commit_id: string;
    }>;
    return rows.map((row) => ({
      taskId: row.task_id,
      workspace: { path: row.path, startingRef: row.starting_ref, commit: row.commit_id },
    }));
  }

  #deleteClaimedProvisionalAttempt(claim: ClaimedActivation): void {
    const deleted = this.#database.prepare(
      `DELETE FROM attempts
       WHERE id = ? AND activation_id = ?
         AND EXISTS (
           SELECT 1 FROM activation_dispatch_claims dispatch_claim
           WHERE dispatch_claim.attempt_id = attempts.id
             AND dispatch_claim.activation_id = attempts.activation_id
         )`,
    ).run(claim.attempt.id, claim.activation.id);
    if (deleted.changes !== 1) throw new Error(`Attempt ${claim.attempt.id} is not an unstarted claim`);
  }

  #readLatestAttemptDefinitionVersion(taskId: string, activationId: string): string | undefined {
    const runStarts = this.#database.prepare(
      `SELECT details_json
       FROM activity_ledger
       WHERE task_id = ? AND type = 'attempt.started'
       ORDER BY sequence DESC`,
    ).all(taskId) as Array<{ details_json: string }>;
    for (const runStart of runStarts) {
      const details = JSON.parse(runStart.details_json) as Record<string, string>;
      if (details.activationId === activationId) return details.definitionVersion;
    }
    return undefined;
  }

  #updateConversationActivity(attemptId: string, occurredAt: string): void {
    this.#database.prepare(
      `UPDATE agent_conversations
       SET latest_activity_at = ?,
           latest_activity_sequence = (SELECT COALESCE(MAX(sequence), 0) FROM activity_ledger)
       WHERE id = (
         SELECT activation.conversation_id
         FROM attempts attempt
         JOIN activations activation ON activation.id = attempt.activation_id
         WHERE attempt.id = ?
       )`,
    ).run(occurredAt, attemptId);
  }
}

interface RunnableRow {
  id: string;
  task_id: string;
  target_agent_id: string;
  source_event_id: string;
  model: string | null;
  reasoning_effort: NonNullable<AgentRunAgent["reasoningEffort"]> | null;
  continuation_message: string | null;
  definition_version: string;
  current_thread_id: string | null;
}

interface AgentRow {
  id: string;
  name: string;
  role: string;
  summary: string;
  instructions_content: string;
}

function sameWorkspace(left: TaskWorkspaceView, right: TaskWorkspaceView): boolean {
  return left.path === right.path
    && left.startingRef === right.startingRef
    && left.commit === right.commit;
}

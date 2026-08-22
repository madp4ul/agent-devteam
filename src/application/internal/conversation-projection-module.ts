import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type {
  AgentConversationIndexEntry,
  AgentConversationView,
} from "../conversation-contract.ts";
import type {
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  EstimatedTokenCost,
} from "../runtime-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";

interface ConversationOwnerAndContinuationRow {
  owning_agent_id: string;
  owning_agent_name_snapshot: string;
  current_agent_name: string | null;
  agent_applied: number | null;
  current_thread_id: string | null;
  archived_at: string | null;
}

interface ConversationRetirementRow {
  conversation_retired_at: string | null;
  retirement_reason: string | null;
  retirement_actor_id: string | null;
  task_archived_at: string | null;
  unfinished_work: number;
}

interface ConversationMessageRow {
  id: string;
  conversation_id: string;
  body: string;
  actor_id: string;
  occurred_at: string;
}

const conversationMessageColumns = "id, conversation_id, body, actor_id, occurred_at";

export class ConversationProjectionModule {
  readonly #database: DatabaseSync;
  readonly #taskProjections: TaskProjectionStore;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;

  constructor(
    database: CoordinationDatabase,
    taskProjections: TaskProjectionStore,
    transcriptAccess?: AttemptTranscriptAccess,
  ) {
    this.#database = database.connection;
    this.#taskProjections = taskProjections;
    this.#transcriptAccess = transcriptAccess;
  }

  readTaskIndex(taskId: string): AgentConversationIndexEntry[] | undefined {
    if (this.#database.prepare("SELECT 1 FROM tasks WHERE id = ?").get(taskId) === undefined) {
      return undefined;
    }
    const rows = this.#database.prepare(
      `SELECT conversation.id, conversation.owning_agent_id,
              conversation.owning_agent_name_snapshot, conversation.generated_label,
              conversation.latest_activity_at, conversation.current_thread_id,
              task.archived_at, agent.name AS current_agent_name, agent.applied AS agent_applied,
              conversation.retired_at AS conversation_retired_at,
              CASE WHEN EXISTS (
                SELECT 1 FROM activations unfinished
                WHERE unfinished.task_id = conversation.task_id
                  AND unfinished.target_agent_id = conversation.owning_agent_id
                  AND unfinished.status <> 'completed'
              ) THEN 1 ELSE 0 END AS unfinished_work,
              CASE
                WHEN EXISTS (
                  SELECT 1
                  FROM attention_reasons attention
                  LEFT JOIN activations direct_activation
                    ON direct_activation.id = attention.source_event_id
                  LEFT JOIN task_comments source_comment
                    ON source_comment.id = attention.source_event_id
                  LEFT JOIN attempts source_attempt
                    ON source_attempt.id = source_comment.attempt_id
                  LEFT JOIN activations comment_activation
                    ON comment_activation.id = source_attempt.activation_id
                  WHERE attention.task_id = conversation.task_id
                    AND attention.resolved_at IS NULL
                    AND (direct_activation.conversation_id = conversation.id
                      OR comment_activation.conversation_id = conversation.id)
                ) THEN 'needs-attention'
                WHEN EXISTS (
                  SELECT 1
                  FROM activations running_activation
                  JOIN attempts running_attempt
                    ON running_attempt.activation_id = running_activation.id
                  WHERE running_activation.conversation_id = conversation.id
                    AND running_attempt.status = 'running'
                ) THEN 'running'
                ELSE NULL
              END AS status,
              CASE WHEN EXISTS (
                SELECT 1
                FROM activations priced_activation
                JOIN attempts priced_attempt ON priced_attempt.activation_id = priced_activation.id
                JOIN model_pricing pricing ON pricing.model = priced_attempt.model
                WHERE priced_activation.conversation_id = conversation.id
                  AND priced_attempt.status = 'running'
              ) THEN 1 ELSE 0 END AS cost_pending
       FROM agent_conversations conversation
       JOIN tasks task ON task.id = conversation.task_id
       LEFT JOIN agents agent ON agent.id = conversation.owning_agent_id
       WHERE conversation.task_id = ?
       ORDER BY conversation.latest_activity_sequence DESC, conversation.created_at DESC,
                conversation.id DESC`,
    ).all(taskId) as Array<{
      id: string;
      owning_agent_id: string;
      owning_agent_name_snapshot: string;
      generated_label: string;
      latest_activity_at: string;
      current_thread_id: string | null;
      archived_at: string | null;
      current_agent_name: string | null;
      agent_applied: number | null;
      conversation_retired_at: string | null;
      unfinished_work: number;
      status: AgentConversationIndexEntry["status"];
      cost_pending: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      ...this.#ownerAndContinuation(row),
      label: row.generated_label,
      latestActivityAt: row.latest_activity_at,
      ...this.#readConversationCostEstimate(row.id),
      costPending: row.cost_pending === 1,
      status: row.status,
      retired: row.conversation_retired_at !== null,
    }));
  }

  async readConversation(taskId: string, conversationId: string): Promise<AgentConversationView | undefined> {
    const row = this.#database.prepare(
      `SELECT conversation.id, conversation.task_id, conversation.owning_agent_id,
              conversation.owning_agent_name_snapshot, conversation.originating_activation_id,
              conversation.current_thread_id, conversation.created_at, conversation.latest_activity_at,
              conversation.retired_at AS conversation_retired_at,
              conversation.retirement_reason, conversation.retirement_actor_id,
              conversation.replaces_conversation_id, conversation.replacement_reason,
              task.archived_at AS task_archived_at, agent.name AS current_agent_name, agent.applied AS agent_applied,
              CASE WHEN EXISTS (
                SELECT 1 FROM activations unfinished
                WHERE unfinished.task_id = conversation.task_id
                  AND unfinished.target_agent_id = conversation.owning_agent_id
                  AND unfinished.status <> 'completed'
              ) THEN 1 ELSE 0 END AS unfinished_work,
              CASE WHEN EXISTS (
                SELECT 1
                FROM activations priced_activation
                JOIN attempts priced_attempt ON priced_attempt.activation_id = priced_activation.id
                JOIN model_pricing pricing ON pricing.model = priced_attempt.model
                WHERE priced_activation.conversation_id = conversation.id
                  AND priced_attempt.status = 'running'
              ) THEN 1 ELSE 0 END AS cost_pending
       FROM agent_conversations conversation
       JOIN tasks task ON task.id = conversation.task_id
       LEFT JOIN agents agent ON agent.id = conversation.owning_agent_id
       WHERE conversation.id = ? AND conversation.task_id = ?`,
    ).get(conversationId, taskId) as {
      id: string;
      task_id: string;
      owning_agent_id: string;
      owning_agent_name_snapshot: string;
      originating_activation_id: string;
      current_thread_id: string | null;
      created_at: string;
      latest_activity_at: string;
      conversation_retired_at: string | null;
      retirement_reason: string | null;
      retirement_actor_id: string | null;
      replaces_conversation_id: string | null;
      replacement_reason: string | null;
      task_archived_at: string | null;
      unfinished_work: number;
      current_agent_name: string | null;
      agent_applied: number | null;
      cost_pending: number;
    } | undefined;
    if (row === undefined) return undefined;
    const originatingActivation = this.#taskProjections.readTaskActivations(row.task_id)
      .find((activation) => activation.id === row.originating_activation_id);
    if (originatingActivation === undefined) return undefined;
    const runs = await Promise.all(this.#readRuns(row.id).map(async (run) => {
      const transcript = await this.readAttemptTranscript(run.attempt.id);
      return {
        ...run,
        transcript: transcript.available
          ? {
              available: true as const,
              items: transcript.items,
              ...(transcript.usage === undefined ? {} : { usage: transcript.usage }),
              ...(transcript.costEstimate === undefined ? {} : { costEstimate: transcript.costEstimate }),
            }
          : { available: false as const },
      };
    }));
    return {
      id: row.id,
      taskId: row.task_id,
      originatingActivationId: row.originating_activation_id,
      originatingActivation,
      ...this.#ownerAndContinuation({ ...row, archived_at: row.task_archived_at }),
      currentThreadId: row.current_thread_id,
      createdAt: row.created_at,
      latestActivityAt: row.latest_activity_at,
      ...conversationCostEstimate(runs),
      costPending: row.cost_pending === 1,
      retirement: row.conversation_retired_at === null
        ? null
        : {
            reason: row.retirement_reason!,
            actor: { kind: "user", id: row.retirement_actor_id! },
            occurredAt: row.conversation_retired_at,
          },
      replacesConversationId: row.replaces_conversation_id,
      replacementReason: row.replacement_reason,
      retirementAvailability: this.#retirementAvailability(row),
      messages: this.#readMessages(row.id),
      runs,
    };
  }

  #readConversationCostEstimate(conversationId: string): {
    costEstimate?: EstimatedTokenCost;
    hasUnpricedSettledRuns: boolean;
  } {
    const runs = this.#readRuns(conversationId);
    if (runs.length === 0) return { hasUnpricedSettledRuns: false };
    const settled = runs.filter(({ attempt }) => attempt.status !== "running");
    if (settled.length === 0) return { hasUnpricedSettledRuns: false };
    const rows = this.#database.prepare(
      `SELECT transcript.usage_json
       FROM activations activation
       JOIN attempts attempt ON attempt.activation_id = activation.id
       LEFT JOIN attempt_transcripts transcript ON transcript.attempt_id = attempt.id
       WHERE activation.conversation_id = ? AND attempt.status <> 'running'
       ORDER BY attempt.rowid`,
    ).all(conversationId) as Array<{ usage_json: string | null }>;
    const amounts = rows.flatMap(({ usage_json }) => {
      if (usage_json === null) return [];
      const value = JSON.parse(usage_json) as { estimatedCostUsd?: number };
      return value.estimatedCostUsd === undefined ? [] : [value.estimatedCostUsd];
    });
    const hasUnpricedSettledRuns = rows.length !== settled.length || amounts.length !== settled.length;
    return {
      ...(amounts.length === 0 ? {} : {
        costEstimate: {
          currency: "USD" as const,
          amount: Number(amounts.reduce((sum, amount) => sum + amount, 0).toFixed(12)),
        },
      }),
      hasUnpricedSettledRuns,
    };
  }

  readMessage(id: string): AgentConversationView["messages"][number] | undefined {
    const row = this.#database.prepare(
      `SELECT ${conversationMessageColumns}
       FROM agent_conversation_messages WHERE id = ?`,
    ).get(id) as ConversationMessageRow | undefined;
    return row === undefined ? undefined : conversationMessageView(row);
  }

  async readAttemptTranscript(attemptId: string): Promise<AttemptTranscriptQueryResult> {
    const attempt = this.#taskProjections.readAttemptTranscriptReference(attemptId);
    if (attempt === undefined) return { available: false, reason: "not-found" };
    if (this.#taskProjections.isAttemptArchived(attemptId)) {
      return { available: false, reason: "unavailable" };
    }
    const persisted = this.#taskProjections.readPersistedAttemptTranscript(attemptId);
    if (persisted !== undefined && attempt.threadId !== null) {
      return { available: true, threadId: attempt.threadId, ...persisted };
    }
    if (attempt.threadId === null || this.#transcriptAccess === undefined) {
      return { available: false, reason: "unavailable" };
    }
    const items = await this.#transcriptAccess.read(attemptId);
    const usage = this.#transcriptAccess.readUsage === undefined
      ? null
      : await this.#transcriptAccess.readUsage(attemptId);
    return items === null
      ? { available: false, reason: "unavailable" }
      : {
          available: true,
          threadId: attempt.threadId,
          items,
          ...(usage === null ? {} : { usage }),
        };
  }

  #readMessages(conversationId: string): AgentConversationView["messages"] {
    const rows = this.#database.prepare(
      `SELECT ${conversationMessageColumns}
       FROM agent_conversation_messages
       WHERE conversation_id = ?
       ORDER BY rowid`,
    ).all(conversationId) as unknown as ConversationMessageRow[];
    return rows.map(conversationMessageView);
  }

  #readRuns(conversationId: string): Array<{
    activationId: string;
    sourceMessageId?: string;
    attempt: AgentConversationView["runs"][number]["attempt"];
  }> {
    const activations = this.#database.prepare(
      "SELECT id, reason_type, source_event_id FROM activations WHERE conversation_id = ? ORDER BY sequence",
    ).all(conversationId) as Array<{
      id: string;
      reason_type: ActivationView["reason"]["type"];
      source_event_id: string;
    }>;
    return activations.flatMap(({ id, reason_type, source_event_id }) =>
      this.#taskProjections.readActivationAttempts(id).map((attempt) => ({
        activationId: id,
        ...(reason_type === "user-follow-up" ? { sourceMessageId: source_event_id } : {}),
        attempt,
      }))
    );
  }

  #ownerAndContinuation(
    row: ConversationOwnerAndContinuationRow,
  ): Pick<AgentConversationView, "owningAgent" | "continuation"> {
    const present = row.agent_applied === 1 && row.current_agent_name !== null;
    return {
      owningAgent: {
        id: row.owning_agent_id,
        name: present ? row.current_agent_name! : row.owning_agent_name_snapshot,
        historicalName: row.owning_agent_name_snapshot,
        present,
      },
      continuation: row.archived_at !== null
        ? { available: false, reason: "task-archived" }
        : !present
          ? { available: false, reason: "owning-agent-unavailable" }
          : row.current_thread_id === null
            ? { available: false, reason: "thread-unavailable" }
            : { available: true },
    };
  }

  #retirementAvailability(row: ConversationRetirementRow): AgentConversationView["retirementAvailability"] {
    if (row.conversation_retired_at !== null) return { available: false, reason: "already-retired" };
    if (row.task_archived_at !== null) return { available: false, reason: "task-archived" };
    if (row.unfinished_work === 1) return { available: false, reason: "activation-work-pending" };
    return { available: true };
  }
}

function conversationCostEstimate(
  runs: AgentConversationView["runs"],
): { costEstimate?: EstimatedTokenCost; hasUnpricedSettledRuns: boolean } {
  const settled = runs.filter(({ attempt }) => attempt.status !== "running");
  if (settled.length === 0) return { hasUnpricedSettledRuns: false };
  const priced = settled.filter(({ transcript }) => transcript.available && transcript.costEstimate !== undefined);
  return {
    ...(priced.length === 0 ? {} : {
      costEstimate: {
        currency: "USD" as const,
        amount: Number(priced.reduce(
          (sum, { transcript }) => sum + (transcript.available ? transcript.costEstimate!.amount : 0),
          0,
        ).toFixed(12)),
      },
    }),
    hasUnpricedSettledRuns: priced.length !== settled.length,
  };
}

function conversationMessageView(row: ConversationMessageRow): AgentConversationView["messages"][number] {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    body: row.body,
    actor: { kind: "user", id: row.actor_id },
    occurredAt: row.occurred_at,
  };
}

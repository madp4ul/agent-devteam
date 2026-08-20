import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type {
  AgentConversationIndexEntry,
  AgentConversationView,
} from "../conversation-contract.ts";
import type {
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
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
              END AS status
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
      status: AgentConversationIndexEntry["status"];
    }>;
    return rows.map((row) => ({
      id: row.id,
      ...this.#ownerAndContinuation(row),
      label: row.generated_label,
      latestActivityAt: row.latest_activity_at,
      status: row.status,
    }));
  }

  async readConversation(taskId: string, conversationId: string): Promise<AgentConversationView | undefined> {
    const row = this.#database.prepare(
      `SELECT conversation.id, conversation.task_id, conversation.owning_agent_id,
              conversation.owning_agent_name_snapshot, conversation.originating_activation_id,
              conversation.current_thread_id, conversation.created_at, conversation.latest_activity_at,
              task.archived_at, agent.name AS current_agent_name, agent.applied AS agent_applied
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
      archived_at: string | null;
      current_agent_name: string | null;
      agent_applied: number | null;
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
            }
          : { available: false as const },
      };
    }));
    return {
      id: row.id,
      taskId: row.task_id,
      originatingActivationId: row.originating_activation_id,
      originatingActivation,
      ...this.#ownerAndContinuation(row),
      currentThreadId: row.current_thread_id,
      createdAt: row.created_at,
      latestActivityAt: row.latest_activity_at,
      messages: this.#readMessages(row.id),
      runs,
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

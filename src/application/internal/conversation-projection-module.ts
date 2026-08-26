import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type {
  AgentConversationIndexEntry,
  AgentConversationMessageView,
  AgentConversationTranscriptView,
  AgentConversationView,
} from "../conversation-contract.ts";
import type {
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  AttemptTokenUsage,
  EstimatedTokenCost,
  TokenCostBreakdown,
  AttemptView,
} from "../runtime-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { ConversationAttachmentStore } from "./conversation-attachment-store.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";
import {
  aggregateTokenCosts,
  calculateAttemptTokenCost,
  type AggregatedTokenCost,
  type TokenCostEvidence,
} from "../token-cost.ts";

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

interface ConversationRun {
  activationId: string;
  sourceMessageId?: string;
  attempt: AttemptView;
  transcript: AgentConversationTranscriptView;
}

const conversationMessageColumns = "id, conversation_id, body, actor_id, occurred_at";

export class ConversationProjectionModule {
  readonly #database: DatabaseSync;
  readonly #taskProjections: TaskProjectionStore;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;
  readonly #attachments: ConversationAttachmentStore;

  constructor(
    database: CoordinationDatabase,
    taskProjections: TaskProjectionStore,
    attachments: ConversationAttachmentStore,
    transcriptAccess?: AttemptTranscriptAccess,
  ) {
    this.#database = database.connection;
    this.#taskProjections = taskProjections;
    this.#attachments = attachments;
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
      conversation_retired_at: string | null;
      unfinished_work: number;
      status: AgentConversationIndexEntry["status"];
    }>;
    return rows.map((row) => ({
      id: row.id,
      ...this.#ownerAndContinuation(row),
      label: row.generated_label,
      latestActivityAt: row.latest_activity_at,
      ...this.#readConversationCostEstimate(row.id),
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
              ) THEN 1 ELSE 0 END AS unfinished_work
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
    } | undefined;
    if (row === undefined) return undefined;
    const activations = this.#taskProjections.readTaskActivations(row.task_id)
      .filter((activation) => activation.conversationId === row.id);
    const originatingActivation = activations
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
              ...(transcript.costBreakdown === undefined ? {} : { costBreakdown: transcript.costBreakdown }),
            }
          : { available: false as const },
      };
    }));
    const messages = this.#readMessages(row.id);
    const retirement = row.conversation_retired_at === null
      ? null
      : {
          reason: row.retirement_reason!,
          actor: { kind: "user" as const, id: row.retirement_actor_id! },
          occurredAt: row.conversation_retired_at,
        };
    return {
      id: row.id,
      taskId: row.task_id,
      originatingActivationId: row.originating_activation_id,
      originatingActivation,
      ...this.#ownerAndContinuation({ ...row, archived_at: row.task_archived_at }),
      currentThreadId: row.current_thread_id,
      createdAt: row.created_at,
      latestActivityAt: row.latest_activity_at,
      ...this.#readConversationCostEstimate(row.id),
      retirement,
      replacesConversationId: row.replaces_conversation_id,
      replacementReason: row.replacement_reason,
      retirementAvailability: this.#retirementAvailability(row),
      history: this.#readHistory(activations, runs, messages, retirement),
    };
  }

  #readHistory(
    activations: ActivationView[],
    runs: ConversationRun[],
    messages: AgentConversationMessageView[],
    retirement: AgentConversationView["retirement"],
  ): AgentConversationView["history"] {
    const messagesById = new Map(messages.map((message) => [message.id, message]));
    const runsByActivation = Map.groupBy(runs, (run) => run.activationId);
    const groups: Array<{ occurredAt: string; entries: AgentConversationView["history"] }> = activations.flatMap((activation) => {
      const message = activation.reason.type === "user-follow-up"
        ? messagesById.get(activation.reason.sourceEventId)
        : undefined;
      const source = activation.reason.type === "user-follow-up"
        ? undefined
        : this.#taskProjections.readSourceEvent(activation.reason.sourceEventId);
      if (message === undefined && source === undefined) return [];
      const occurredAt = message?.occurredAt ?? source!.occurredAt;
      const nonMessageSource = source!;
      const activationRuns = runsByActivation.get(activation.id) ?? [];
      const attemptIds = activationRuns.map(({ attempt }) => attempt.id);
      const cause: AgentConversationView["history"][number] = message !== undefined
        ? { kind: "message", activationId: activation.id, status: activation.status, attemptIds, message }
        : "body" in nonMessageSource
          ? { kind: "activation", activationId: activation.id, status: activation.status, attemptIds, occurredAt, reason: activation.reason, source: { kind: "comment", comment: nonMessageSource } }
          : { kind: "activation", activationId: activation.id, status: activation.status, attemptIds, occurredAt, reason: activation.reason, source: { kind: "activity", activity: nonMessageSource } };
      const items = activationRuns.flatMap((run) => [
        ...(run.attempt.threadContinuity === "replaced" ? [{
          kind: "continuity-loss" as const,
          occurredAt: run.attempt.startedAt,
          reason: "Codex could not resume the prior thread. This activation started a replacement thread, so earlier model context was not retained.",
        }] : []),
        ...(run.transcript.available
          ? run.transcript.items.map((item) => ({
              kind: "item" as const,
              activationId: activation.id,
              attemptId: run.attempt.id,
              item,
            }))
          : []),
      ]);
      return [{ occurredAt, entries: [cause, ...items] }];
    });
    const systemGroups: Array<{ occurredAt: string; entries: AgentConversationView["history"] }> = [
      ...(retirement === null ? [] : [{
        occurredAt: retirement.occurredAt,
        entries: [{ kind: "retirement" as const, retirement }],
      }]),
    ];
    return [...groups, ...systemGroups]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .flatMap(({ entries }) => entries);
  }

  #readConversationCostEstimate(conversationId: string): AggregatedTokenCost {
    const rows = this.#database.prepare(
      `SELECT attempt.status, attempt.thread_id, attempt.pricing_json,
              CASE WHEN pricing.model IS NULL THEN 0 ELSE 1 END AS priceable,
              transcript.usage_json, transcript.reported_usage_json
       FROM activations activation
       JOIN attempts attempt ON attempt.activation_id = activation.id
       LEFT JOIN attempt_transcripts transcript ON transcript.attempt_id = attempt.id
       LEFT JOIN model_pricing pricing ON pricing.model = attempt.model
       WHERE activation.conversation_id = ?
       ORDER BY attempt.rowid`,
    ).all(conversationId) as Array<{
      status: AttemptView["status"];
      thread_id: string | null;
      pricing_json: string | null;
      priceable: number;
      usage_json: string | null;
      reported_usage_json: string | null;
    }>;
    return conversationCostFromCumulativeSnapshots(rows.map((row) => ({
      status: row.status,
      threadId: row.thread_id,
      priceable: row.priceable === 1,
      ...(row.pricing_json === null ? {} : {
        pricing: JSON.parse(row.pricing_json) as ProcessModelPricingDefinition,
      }),
      ...(row.reported_usage_json === null ? {} : {
        reportedUsage: JSON.parse(row.reported_usage_json) as AttemptTokenUsage,
      }),
      ...(row.usage_json === null ? {} : {
        isolatedCost: persistedTokenCost(JSON.parse(row.usage_json) as PersistedTokenCost),
      }),
    })));
  }

  readMessage(id: string): AgentConversationMessageView | undefined {
    const row = this.#database.prepare(
      `SELECT ${conversationMessageColumns}
       FROM agent_conversation_messages WHERE id = ?`,
    ).get(id) as ConversationMessageRow | undefined;
    return row === undefined ? undefined : this.#conversationMessageView(row);
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

  #readMessages(conversationId: string): AgentConversationMessageView[] {
    const rows = this.#database.prepare(
      `SELECT ${conversationMessageColumns}
       FROM agent_conversation_messages
       WHERE conversation_id = ?
       ORDER BY rowid`,
    ).all(conversationId) as unknown as ConversationMessageRow[];
    return rows.map((row) => this.#conversationMessageView(row));
  }

  #conversationMessageView(row: ConversationMessageRow): AgentConversationMessageView {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      body: row.body,
      actor: { kind: "user", id: row.actor_id },
      occurredAt: row.occurred_at,
      attachments: this.#attachments.readMessageAttachments(row.id),
    };
  }

  #readRuns(conversationId: string): Array<{
    activationId: string;
    sourceMessageId?: string;
    attempt: AttemptView;
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

interface PersistedTokenCost {
  estimatedCostUsd?: number;
  estimatedCostBreakdown?: TokenCostBreakdown;
}

interface ConversationCostSnapshot {
  status: AttemptView["status"];
  threadId: string | null;
  priceable: boolean;
  pricing?: ProcessModelPricingDefinition;
  reportedUsage?: AttemptTokenUsage;
  isolatedCost?: {
    costEstimate?: EstimatedTokenCost;
    costBreakdown?: TokenCostBreakdown;
  };
}

function conversationCostFromCumulativeSnapshots(rows: ConversationCostSnapshot[]): AggregatedTokenCost {
  const evidence: TokenCostEvidence[] = rows
    .filter(({ status }) => status === "running")
    .map(({ priceable }) => ({ status: "running", priceable }));
  const settled = rows.filter(({ status }) => status !== "running");
  const threadGroups = Map.groupBy(
    settled.filter(({ threadId }) => threadId !== null),
    ({ threadId }) => threadId!,
  );
  for (const threadRows of threadGroups.values()) {
    const pricing = stablePricing(threadRows);
    const snapshots = threadRows.flatMap(({ reportedUsage }, index) =>
      reportedUsage === undefined ? [] : [{ index, usage: reportedUsage }]
    );
    const latest = snapshots.at(-1);
    if (
      pricing !== undefined &&
      latest !== undefined &&
      snapshotsAreMonotonic(snapshots.map(({ usage }) => usage))
    ) {
      const cost = calculateAttemptTokenCost(latest.usage, pricing);
      evidence.push(conversationTokenCostEvidence("completed", true, cost));
      if (latest.index !== threadRows.length - 1 || cost === undefined) {
        evidence.push({ status: "settled" });
      }
      continue;
    }
    evidence.push(...threadRows.map((row) =>
      conversationTokenCostEvidence(row.status, row.priceable, row.isolatedCost)
    ));
  }
  evidence.push(...settled
    .filter(({ threadId }) => threadId === null)
    .map((row) => conversationTokenCostEvidence(row.status, row.priceable, row.isolatedCost)));
  return aggregateTokenCosts(evidence, { compactBreakdown: true });
}

function stablePricing(rows: ConversationCostSnapshot[]): ProcessModelPricingDefinition | undefined {
  const first = rows[0]?.pricing;
  if (first === undefined) return undefined;
  const key = JSON.stringify(first);
  return rows.every(({ pricing }) => pricing !== undefined && JSON.stringify(pricing) === key)
    ? first
    : undefined;
}

function snapshotsAreMonotonic(snapshots: AttemptTokenUsage[]): boolean {
  return snapshots.every((snapshot, index) => index === 0 || usageDelta(snapshot, snapshots[index - 1]!) !== undefined);
}

function usageDelta(current: AttemptTokenUsage, previous: AttemptTokenUsage): AttemptTokenUsage | undefined {
  const delta = {
    inputTokens: current.inputTokens - previous.inputTokens,
    cachedInputTokens: current.cachedInputTokens - previous.cachedInputTokens,
    cacheWriteInputTokens: current.cacheWriteInputTokens - previous.cacheWriteInputTokens,
    outputTokens: current.outputTokens - previous.outputTokens,
    reasoningOutputTokens: current.reasoningOutputTokens - previous.reasoningOutputTokens,
  };
  return Object.values(delta).every((value) => value >= 0) ? delta : undefined;
}

function persistedTokenCost(value: PersistedTokenCost): NonNullable<ConversationCostSnapshot["isolatedCost"]> {
  return {
    ...(value.estimatedCostUsd === undefined ? {} : {
      costEstimate: { currency: "USD", amount: value.estimatedCostUsd },
    }),
    ...(value.estimatedCostBreakdown === undefined ? {} : {
      costBreakdown: value.estimatedCostBreakdown,
    }),
  };
}

function conversationTokenCostEvidence(
  status: AttemptView["status"],
  priceable: boolean,
  cost: {
    costEstimate?: EstimatedTokenCost;
    costBreakdown?: TokenCostBreakdown;
  } = {},
): TokenCostEvidence {
  return status === "running"
    ? { status: "running", priceable }
    : {
      status: "settled",
      ...(cost.costEstimate === undefined ? {} : { costEstimate: cost.costEstimate }),
      ...(cost.costBreakdown === undefined ? {} : { costBreakdown: cost.costBreakdown }),
    };
}

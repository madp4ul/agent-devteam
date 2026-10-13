import { RuntimeRecoveryStore } from "./runtime-recovery-store.ts";
import { ActivityJournal } from "./activity-journal.ts";
import type { DatabaseSync } from "node:sqlite";

import type { ActivationView } from "../automation-contract.ts";
import type { TaskActivityView } from "../task-contract.ts";
import type {
  ConversationHistoryQuery,
  AgentConversationHistoryEntry,
  AgentConversationIndexEntry,
  AgentConversationMessageView,
  AgentConversationTranscriptView,
  AgentConversationView,
} from "../conversation-contract.ts";
import type {
  AttemptTranscriptItem,
  AttemptTranscriptAccess,
  AttemptTranscriptQueryResult,
  AttemptContextWindowUsage,
  AttemptTokenUsage,
  EstimatedTokenCost,
  TokenCostBreakdown,
  AttemptView,
} from "../runtime-contract.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { ConversationAttachmentStore } from "./conversation-attachment-store.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";
import type { ArchivedConversationCostSnapshot } from "./archived-conversation-cost.ts";
import {
  aggregateTokenCostSummaries,
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

import { ConversationHistoryPages, type ConversationHistoryRow } from "./conversation-history-pages.ts";

const conversationMessageColumns = "id, conversation_id, body, actor_id, occurred_at";

export class ConversationProjectionModule {
  readonly #database: DatabaseSync;
  readonly #taskProjections: TaskProjectionStore;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;
  readonly #pages: ConversationHistoryPages;
  readonly #attachments: ConversationAttachmentStore;

  constructor(
    database: CoordinationDatabase,
    taskProjections: TaskProjectionStore,
    attachments: ConversationAttachmentStore,
    transcriptAccess?: AttemptTranscriptAccess,
  ) {
    this.#database = database.connection;
    this.#pages = new ConversationHistoryPages(this.#database);
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
      ...this.readConversationCostEstimate(row.id),
      status: row.status,
      retired: row.conversation_retired_at !== null,
    }));
  }

  readProjectTaskCosts(): Array<{ taskId: string; cost: AggregatedTokenCost }> {
    const taskIds = this.#database.prepare(
      `SELECT DISTINCT task_id FROM agent_conversations ORDER BY task_id`,
    ).all() as Array<{ task_id: string }>;
    return taskIds.map(({ task_id: taskId }) => ({
      taskId,
      cost: aggregateTokenCostSummaries(
        this.readTaskIndex(taskId) ?? [],
        { compactBreakdown: true },
      ),
    }));
  }

  async readConversation(taskId: string, conversationId: string, query: ConversationHistoryQuery = {}): Promise<AgentConversationView | "invalid-page" | undefined> {
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
    const selected = this.#pages.read(row.id, query);
    if (selected === undefined) return "invalid-page";
    const originatingActivation = this.#taskProjections.readTaskActivations(row.task_id, row.originating_activation_id, false)[0];
    if (originatingActivation === undefined) return undefined;
    originatingActivation.attempts = this.#taskProjections.readActivationAttempts(row.originating_activation_id, 50);
    const retirement = row.conversation_retired_at === null
      ? null
      : {
          reason: row.retirement_reason!,
          actor: { kind: "user" as const, id: row.retirement_actor_id! },
          occurredAt: row.conversation_retired_at,
        };
    const entries = selected.rows.flatMap((entry) => this.#hydrateHistoryRow(entry, row.task_id, retirement, query.attemptId)
      .map((history) => ({ id: entry.id, history })));
    const waitingActivation = this.#database.prepare(`SELECT activation_id FROM runtime_recovery_episodes episode JOIN activations activation ON activation.id = episode.activation_id WHERE activation.conversation_id = ? AND episode.state = 'waiting' LIMIT 1`).get(row.id) as { activation_id: string } | undefined;
    const runtimeRecovery = waitingActivation === undefined ? undefined : new RuntimeRecoveryStore(this.#database, new ActivityJournal(this.#database)).readWaiting(waitingActivation.activation_id);
    return {
      ...(runtimeRecovery === undefined ? {} : { runtimeRecovery }),
      id: row.id,
      taskId: row.task_id,
      originatingActivationId: row.originating_activation_id,
      originatingActivation,
      ...this.#ownerAndContinuation({ ...row, archived_at: row.task_archived_at }),
      currentThreadId: row.current_thread_id,
      createdAt: row.created_at,
      latestActivityAt: row.latest_activity_at,
      ...this.readConversationCostEstimate(row.id),
      ...this.#readConversationContextWindowUsage(row.id, row.current_thread_id),
      retirement,
      replacesConversationId: row.replaces_conversation_id,
      replacementReason: row.replacement_reason,
      retirementAvailability: this.#retirementAvailability(row),
      history: entries.map(({ history }) => history),
      page: { ...selected.page, recordIds: entries.map(({ id }) => id) },
      liveStatus: (this.#database.prepare(`SELECT CASE
        WHEN EXISTS (SELECT 1 FROM activations WHERE conversation_id = ? AND status = 'running') THEN 'running'
        WHEN EXISTS (SELECT 1 FROM activations WHERE conversation_id = ? AND status = 'queued') THEN 'queued'
        ELSE NULL END AS status`).get(row.id, row.id) as { status: "running" | "queued" | null }).status,
    };
  }

  #hydrateHistoryRow(row: ConversationHistoryRow, taskId: string, retirement: AgentConversationView["retirement"], selectedAttemptId?: string): AgentConversationHistoryEntry[] {
    if (row.kind === "item") return [{ kind: "item", activationId: row.activation_id!, attemptId: row.attempt_id!, item: JSON.parse(row.item_json!) as AttemptTranscriptItem }];
    if (row.kind === "retirement") return retirement === null ? [] : [{ kind: "retirement", retirement }];
    if (row.kind === "continuity-loss") {
      const attempt = this.#database.prepare("SELECT started_at FROM attempts WHERE id = ?").get(row.attempt_id!) as { started_at: string };
      return [{ kind: "continuity-loss", occurredAt: attempt.started_at, reason: "Codex could not resume the prior thread. This activation started a replacement thread, so earlier model context was not retained." }];
    }
    if (row.kind === "resume") {
      const activity = this.#taskProjections.readSourceEvent(row.source_id!);
      return activity === undefined || "body" in activity ? [] : [{ kind: "resume", activationId: row.activation_id!, activity }];
    }
    const activation = this.#taskProjections.readTaskActivations(taskId, row.activation_id!, false)[0];
    if (activation === undefined) return [];
    const attemptIds = (this.#database.prepare("SELECT id FROM attempts WHERE activation_id = ? AND provisional_probe = 0 ORDER BY rowid LIMIT 50").all(activation.id) as Array<{ id: string }>).map(({ id }) => id);
    if (selectedAttemptId !== undefined && !attemptIds.includes(selectedAttemptId)) attemptIds.push(selectedAttemptId);
    if (activation.reason.type === "user-follow-up") {
      const message = this.#database.prepare(`SELECT ${conversationMessageColumns} FROM agent_conversation_messages WHERE id = ?`).get(row.source_id!) as unknown as ConversationMessageRow | undefined;
      return message === undefined ? [] : [{ kind: "message", activationId: activation.id, status: activation.status, attemptIds, message: this.#conversationMessageView(message) }];
    }
    const source = this.#taskProjections.readSourceEvent(row.source_id!);
    if (source === undefined) return [];
    return [{ kind: "activation", activationId: activation.id, status: activation.status, attemptIds, occurredAt: source.occurredAt, reason: activation.reason,
      source: "body" in source ? { kind: "comment", comment: source } : { kind: "activity", activity: source } }];
  }

  readConversationCostEstimate(conversationId: string): AggregatedTokenCost {
    const archived = this.#database.prepare(
      `SELECT archived_cost_json FROM agent_conversations WHERE id = ?`,
    ).get(conversationId) as { archived_cost_json: string | null } | undefined;
    const snapshot = archived?.archived_cost_json === null || archived?.archived_cost_json === undefined
      ? undefined
      : JSON.parse(archived.archived_cost_json) as ArchivedConversationCostSnapshot;
    const rows = this.#database.prepare(
      `SELECT attempt.status, attempt.thread_id, attempt.pricing_json,
              CASE WHEN pricing.model IS NULL THEN 0 ELSE 1 END AS priceable,
              transcript.usage_json, transcript.reported_usage_json
       FROM activations activation
       JOIN attempts attempt ON attempt.activation_id = activation.id
       LEFT JOIN attempt_transcripts transcript ON transcript.attempt_id = attempt.id
       LEFT JOIN model_pricing pricing ON pricing.model = attempt.model
       WHERE activation.conversation_id = ? AND attempt.rowid > ?
       ORDER BY attempt.rowid`,
    ).all(conversationId, snapshot?.throughAttemptRowId ?? 0) as Array<{
      status: AttemptView["status"];
      thread_id: string | null;
      pricing_json: string | null;
      priceable: number;
      usage_json: string | null;
      reported_usage_json: string | null;
    }>;
    const current = conversationCostFromCumulativeSnapshots(rows.map((row) => ({
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
    })), snapshot?.threadUsageCheckpoints);
    return snapshot === undefined
      ? current
      : aggregateTokenCostSummaries([snapshot.cost, current], { compactBreakdown: true });
  }

  #readConversationContextWindowUsage(
    conversationId: string,
    currentThreadId: string | null,
  ): Pick<AgentConversationView, "contextWindowUsage"> {
    if (currentThreadId === null) return {};
    const row = this.#database.prepare(
      `SELECT attempt.context_window_usage_json
       FROM activations activation
       JOIN attempts attempt ON attempt.activation_id = activation.id
       WHERE activation.conversation_id = ?
         AND attempt.thread_id = ?
         AND attempt.context_window_usage_json IS NOT NULL
       ORDER BY attempt.rowid DESC
       LIMIT 1`,
    ).get(conversationId, currentThreadId) as { context_window_usage_json: string } | undefined;
    return row === undefined
      ? {}
      : { contextWindowUsage: JSON.parse(row.context_window_usage_json) as AttemptContextWindowUsage };
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

function conversationCostFromCumulativeSnapshots(
  rows: ConversationCostSnapshot[],
  priorThreadCheckpoints: ArchivedConversationCostSnapshot["threadUsageCheckpoints"] = [],
): AggregatedTokenCost {
  const evidence: TokenCostEvidence[] = rows
    .filter(({ status }) => status === "running")
    .map(({ priceable }) => ({ status: "running", priceable }));
  const settled = rows.filter(({ status }) => status !== "running");
  const threadGroups = Map.groupBy(
    settled.filter(({ threadId }) => threadId !== null),
    ({ threadId }) => threadId!,
  );
  for (const threadRows of threadGroups.values()) {
    const baseline = priorThreadCheckpoints.find(({ threadId }) => threadId === threadRows[0]?.threadId);
    const pricing = stablePricing([
      ...(baseline === undefined ? [] : [baseline.pricing === undefined ? {} : { pricing: baseline.pricing }]),
      ...threadRows,
    ]);
    const snapshots = [
      ...(baseline === undefined ? [] : [{ index: -1, usage: baseline.reportedUsage }]),
      ...threadRows.flatMap(({ reportedUsage }, index) =>
      reportedUsage === undefined ? [] : [{ index, usage: reportedUsage }]
      ),
    ];
    const latest = snapshots.at(-1);
    if (
      pricing !== undefined &&
      latest !== undefined &&
      snapshotsAreMonotonic(snapshots.map(({ usage }) => usage))
    ) {
      const billableUsage = baseline === undefined
        ? latest.usage
        : usageDelta(latest.usage, baseline.reportedUsage);
      const cost = billableUsage === undefined ? undefined : calculateAttemptTokenCost(billableUsage, pricing);
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

function stablePricing(rows: Array<{ pricing?: ProcessModelPricingDefinition }>): ProcessModelPricingDefinition | undefined {
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

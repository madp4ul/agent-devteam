import type { DatabaseSync } from "node:sqlite";

import type {
  AttemptTokenUsage,
  AttemptTranscriptItem,
  TokenCostBreakdown,
} from "../runtime-contract.ts";
import { calculateAttemptTokenCost } from "../token-cost.ts";
import type { ArchivedConversationCostSnapshot } from "./archived-conversation-cost.ts";
import type { CoordinationDatabase } from "./coordination-database.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";

export interface RetainAttemptEvidence {
  attemptId: string;
  transcript?: AttemptTranscriptItem[];
  reportedUsage?: AttemptTokenUsage;
  pricing?: ProcessModelPricingDefinition;
  resumedThreadId?: string;
  completedThreadId?: string;
}

export class AttemptEvidenceModule {
  readonly #database: DatabaseSync;

  constructor(database: CoordinationDatabase) {
    this.#database = database.connection;
  }

  recordWithinSettlement(input: RetainAttemptEvidence): void {
    this.#database
      .prepare("UPDATE attempts SET pricing_json = ? WHERE id = ?")
      .run(serializedPricing(input.pricing), input.attemptId);

    if (input.transcript === undefined && input.reportedUsage === undefined) return;
    const usage = input.reportedUsage === undefined
      ? undefined
      : this.#isolateAttemptUsage(
          input.attemptId,
          input.reportedUsage,
          input.resumedThreadId,
          input.completedThreadId,
        );
    this.#database
      .prepare(
        `INSERT INTO attempt_transcripts
           (attempt_id, items_json, usage_json, reported_usage_json)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(attempt_id) DO UPDATE SET
           items_json = excluded.items_json,
           usage_json = excluded.usage_json,
           reported_usage_json = excluded.reported_usage_json`,
      )
      .run(
        input.attemptId,
        JSON.stringify(input.transcript ?? []),
        usage === undefined ? null : JSON.stringify(persistedUsage(usage, input.pricing)),
        input.reportedUsage === undefined ? null : JSON.stringify(input.reportedUsage),
      );
  }

  #isolateAttemptUsage(
    attemptId: string,
    reportedUsage: AttemptTokenUsage,
    resumedThreadId?: string,
    completedThreadId?: string,
  ): AttemptTokenUsage | undefined {
    if (resumedThreadId === undefined || completedThreadId !== resumedThreadId) {
      return reportedUsage;
    }
    const archived = this.#database.prepare(
      `SELECT conversation.archived_cost_json
       FROM attempts current_attempt
       JOIN activations activation ON activation.id = current_attempt.activation_id
       JOIN agent_conversations conversation ON conversation.id = activation.conversation_id
       WHERE current_attempt.id = ?`,
    ).get(attemptId) as { archived_cost_json: string | null } | undefined;
    const snapshot = archived?.archived_cost_json === null || archived?.archived_cost_json === undefined
      ? undefined
      : JSON.parse(archived.archived_cost_json) as ArchivedConversationCostSnapshot;
    const prior = this.#database
      .prepare(
        `SELECT transcript.reported_usage_json
         FROM attempts attempt
         LEFT JOIN attempt_transcripts transcript ON transcript.attempt_id = attempt.id
         WHERE attempt.thread_id = ?
           AND attempt.id <> ?
           AND attempt.rowid > ?
         ORDER BY attempt.rowid DESC
         LIMIT 1`,
      )
      .get(resumedThreadId, attemptId, snapshot?.throughAttemptRowId ?? 0) as
        { reported_usage_json: string | null } | undefined;
    if (prior?.reported_usage_json === null) return undefined;
    const baseline = prior === undefined
      ? snapshot?.threadUsageCheckpoints.find(({ threadId }) => threadId === resumedThreadId)?.reportedUsage
      : JSON.parse(prior.reported_usage_json) as AttemptTokenUsage;
    if (baseline === undefined) return undefined;
    const delta: AttemptTokenUsage = {
      inputTokens: reportedUsage.inputTokens - baseline.inputTokens,
      cachedInputTokens: reportedUsage.cachedInputTokens - baseline.cachedInputTokens,
      cacheWriteInputTokens: reportedUsage.cacheWriteInputTokens - baseline.cacheWriteInputTokens,
      outputTokens: reportedUsage.outputTokens - baseline.outputTokens,
      reasoningOutputTokens: reportedUsage.reasoningOutputTokens - baseline.reasoningOutputTokens,
    };
    return Object.values(delta).every((value) => value >= 0) ? delta : undefined;
  }
}

function persistedUsage(
  usage: AttemptTokenUsage,
  pricing: ProcessModelPricingDefinition | undefined,
): AttemptTokenUsage & { estimatedCostUsd?: number; estimatedCostBreakdown?: TokenCostBreakdown } {
  const cost = calculateAttemptTokenCost(usage, pricing);
  return {
    ...usage,
    ...(cost === undefined ? {} : {
      estimatedCostUsd: cost.costEstimate.amount,
      estimatedCostBreakdown: cost.costBreakdown,
    }),
  };
}

function serializedPricing(pricing: ProcessModelPricingDefinition | undefined): string | null {
  return pricing === undefined ? null : JSON.stringify(pricing);
}

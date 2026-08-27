import type { AttemptTokenUsage } from "../runtime-contract.ts";
import type { AggregatedTokenCost } from "../token-cost.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";

export interface ArchivedConversationCostSnapshot {
  throughAttemptRowId: number;
  cost: AggregatedTokenCost;
  threadUsageCheckpoints: Array<{
    threadId: string;
    reportedUsage: AttemptTokenUsage;
    pricing?: ProcessModelPricingDefinition;
  }>;
}

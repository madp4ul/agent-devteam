import type { EstimatedTokenCost } from "./runtime-contract.ts";
import type { TokenPricing } from "./token-cost.ts";

export interface ConfiguredModelPriceView extends TokenPricing {
  model: string;
}

export interface ProcessCostStatisticsView {
  configuredModelPrices: ConfiguredModelPriceView[];
  totalCostEstimate?: EstimatedTokenCost;
  contributingTaskCount: number;
  averageCostPerContributingTask?: EstimatedTokenCost;
  costPending: boolean;
  hasUnpricedSettledRuns: boolean;
}

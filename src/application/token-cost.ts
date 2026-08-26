import type {
  AttemptTokenUsage,
  EstimatedTokenCost,
  TokenCostBreakdown,
} from "./runtime-contract.ts";

export interface TokenPricing {
  usdPerMillionTokens: {
    input: number;
    cachedInput: number;
    cacheWriteInput: number;
    output: number;
  };
}

export interface AttemptTokenCost {
  costEstimate: EstimatedTokenCost;
  costBreakdown: TokenCostBreakdown;
}

export type TokenCostEvidence =
  | { status: "running"; priceable: boolean }
  | {
      status: "settled";
      costEstimate?: EstimatedTokenCost;
      costBreakdown?: TokenCostBreakdown;
    };

export interface AggregatedTokenCost {
  costEstimate?: EstimatedTokenCost;
  costBreakdown?: TokenCostBreakdown;
  costPending: boolean;
  hasUnpricedSettledRuns: boolean;
}

export function calculateAttemptTokenCost(
  usage: AttemptTokenUsage,
  pricing: TokenPricing | undefined,
): AttemptTokenCost | undefined {
  if (pricing === undefined) return undefined;
  const counts = [
    usage.inputTokens,
    usage.cachedInputTokens,
    usage.cacheWriteInputTokens,
    usage.outputTokens,
    usage.reasoningOutputTokens,
  ];
  if (counts.some((count) => !Number.isSafeInteger(count) || count < 0)) return undefined;
  const ordinaryInput = usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteInputTokens;
  if (ordinaryInput < 0) return undefined;
  const rates = pricing.usdPerMillionTokens;
  const amount = (
    ordinaryInput * rates.input +
    usage.cachedInputTokens * rates.cachedInput +
    usage.cacheWriteInputTokens * rates.cacheWriteInput +
    usage.outputTokens * rates.output
  ) / 1_000_000;
  if (!Number.isFinite(amount) || amount < 0) return undefined;
  return {
    costEstimate: { currency: "USD", amount: Number(amount.toFixed(12)) },
    costBreakdown: {
      categories: [
        { category: "input", tokens: ordinaryInput, usdPerMillionTokens: rates.input },
        { category: "cachedInput", tokens: usage.cachedInputTokens, usdPerMillionTokens: rates.cachedInput },
        { category: "cacheWriteInput", tokens: usage.cacheWriteInputTokens, usdPerMillionTokens: rates.cacheWriteInput },
        { category: "output", tokens: usage.outputTokens, usdPerMillionTokens: rates.output },
      ],
      reasoningOutputTokens: usage.reasoningOutputTokens,
    },
  };
}

export function aggregateTokenCosts(
  evidence: TokenCostEvidence[],
  options: { compactBreakdown?: boolean } = {},
): AggregatedTokenCost {
  const settled = evidence.filter((item) => item.status === "settled");
  const priced = settled.filter((item) =>
    item.costEstimate !== undefined &&
    Number.isFinite(item.costEstimate.amount) &&
    item.costEstimate.amount >= 0
  );
  const breakdowns = priced.flatMap((item) =>
    item.costBreakdown === undefined ? [] : [item.costBreakdown]
  );
  const total = priced.reduce((sum, item) => sum + item.costEstimate!.amount, 0);
  const aggregateAmount = Number.isFinite(total) ? Number(total.toFixed(12)) : undefined;
  return {
    ...(priced.length === 0 || aggregateAmount === undefined ? {} : {
      costEstimate: {
        currency: "USD",
        amount: aggregateAmount,
      },
    }),
    ...(aggregateAmount !== undefined && breakdowns.length === priced.length && breakdowns.length > 0 ? {
      costBreakdown: {
        categories: options.compactBreakdown === true
          ? compactCostCategories(breakdowns)
          : breakdowns.flatMap(({ categories }) => categories),
        reasoningOutputTokens: breakdowns.reduce(
          (total, { reasoningOutputTokens }) => total + reasoningOutputTokens,
          0,
        ),
      },
    } : {}),
    costPending: evidence.some((item) => item.status === "running" && item.priceable),
    hasUnpricedSettledRuns:
      priced.length !== settled.length || (priced.length > 0 && aggregateAmount === undefined),
  };
}

export function aggregateTokenCostSummaries(
  summaries: AggregatedTokenCost[],
  options: { compactBreakdown?: boolean } = {},
): AggregatedTokenCost {
  return aggregateTokenCosts(summaries.flatMap((summary): TokenCostEvidence[] => [
    ...(summary.costEstimate === undefined && !summary.hasUnpricedSettledRuns ? [] : [{
      status: "settled" as const,
      ...(summary.costEstimate === undefined ? {} : { costEstimate: summary.costEstimate }),
      ...(summary.costBreakdown === undefined ? {} : { costBreakdown: summary.costBreakdown }),
    }]),
    ...(summary.costEstimate !== undefined && summary.hasUnpricedSettledRuns
      ? [{ status: "settled" as const }]
      : []),
    ...(summary.costPending ? [{ status: "running" as const, priceable: true }] : []),
  ]), options);
}

function compactCostCategories(breakdowns: TokenCostBreakdown[]): TokenCostBreakdown["categories"] {
  const grouped = new Map<string, TokenCostBreakdown["categories"][number]>();
  for (const { categories } of breakdowns) {
    for (const category of categories) {
      const key = `${category.category}\0${category.usdPerMillionTokens}`;
      const existing = grouped.get(key);
      if (existing === undefined) {
        grouped.set(key, { ...category });
      } else {
        existing.tokens += category.tokens;
      }
    }
  }
  return [...grouped.values()];
}

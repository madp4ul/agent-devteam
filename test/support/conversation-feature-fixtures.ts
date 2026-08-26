import type {
  AttemptTokenUsage,
  TokenCostBreakdown,
} from "../../src/application/runtime-contract.ts";
import type { PendingConversationUploadView } from "../../src/application/conversation-contract.ts";

export function conversationUploadFixture(
  overrides: Partial<PendingConversationUploadView> = {},
): PendingConversationUploadView {
  return {
    id: "upload-evidence",
    conversationId: "browser-conversation",
    fileName: "evidence.txt",
    mediaType: "text/plain",
    sizeBytes: 8,
    ...overrides,
  };
}

export function attemptUsageFixture(
  overrides: Partial<AttemptTokenUsage> = {},
): AttemptTokenUsage {
  return {
    inputTokens: 1_000,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    ...overrides,
  };
}

export function modelPricingFixture(rate: number): {
  usdPerMillionTokens: Record<"input" | "cachedInput" | "cacheWriteInput" | "output", number>;
} {
  return {
    usdPerMillionTokens: {
      input: rate,
      cachedInput: rate,
      cacheWriteInput: rate,
      output: rate,
    },
  };
}

export function tokenCostEvidenceFixture(options: {
  amount: number;
  categories: TokenCostBreakdown["categories"];
  reasoningOutputTokens?: number;
  pending?: boolean;
  lowerBound?: boolean;
}): {
  costEstimate: { currency: "USD"; amount: number };
  costBreakdown: TokenCostBreakdown;
  costPending: boolean;
  hasUnpricedSettledRuns: boolean;
} {
  return {
    costEstimate: { currency: "USD", amount: options.amount },
    costBreakdown: {
      categories: options.categories,
      reasoningOutputTokens: options.reasoningOutputTokens ?? 0,
    },
    costPending: options.pending ?? false,
    hasUnpricedSettledRuns: options.lowerBound ?? false,
  };
}

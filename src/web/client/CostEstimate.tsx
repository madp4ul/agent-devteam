import type { EstimatedTokenCost, TokenCostBreakdown } from "../../application/browser-transport-contract.ts";
import { useId, type KeyboardEvent, type ReactNode } from "react";

const categoryLabels = {
  input: "Input",
  cachedInput: "Cached input",
  cacheWriteInput: "Cache write input",
  output: "Output",
} satisfies Record<TokenCostBreakdown["categories"][number]["category"], string>;

export function CostEstimate({
  estimate,
  pending,
  lowerBound,
  breakdown,
  testId,
  appearance = "inline",
}: {
  estimate?: EstimatedTokenCost;
  pending?: boolean;
  lowerBound?: boolean;
  breakdown?: TokenCostBreakdown;
  testId?: string;
  appearance?: "inline" | "badge";
}): ReactNode {
  const breakdownId = useId();
  if (estimate === undefined && pending !== true) return null;
  const formatted = formatUsd(estimate?.amount ?? 0);
  const pendingText = pending === true ? "; will update when the current run finishes" : "";
  const lowerBoundText = lowerBound === true ? " is at least" : "";
  return (
    <span
      className={`cost-estimate${appearance === "badge" ? " cost-estimate-badge" : ""}`}
      role={pending === true ? "status" : "group"}
      {...(breakdown === undefined ? {} : { tabIndex: 0, "aria-describedby": breakdownId })}
      aria-label={`Estimated token cost${lowerBoundText} ${formatted}${pendingText}`}
      title={lowerBound === true
        ? "Known process-defined token cost; one or more settled runs did not report usage"
        : "Process-defined estimated token cost"}
      {...(testId === undefined ? {} : { "data-testid": testId })}
      onKeyDown={breakdown === undefined ? undefined : dismissTooltip}
    >
      {pending === true ? <span className="cost-pending-spinner" aria-hidden="true" /> : null}
      <span aria-hidden="true">{lowerBound === true ? "≥" : ""}{formatted}</span>
      {breakdown === undefined ? null : (
        <span
          id={breakdownId}
          className="cost-breakdown"
          role="tooltip"
          aria-label="Token cost breakdown"
        >
          <ul>
            {breakdown.categories.map((item, index) => (
              <li key={`${item.category}-${item.usdPerMillionTokens}-${index}`}>
                <strong>{categoryLabels[item.category]}</strong>
                <span>{formatTokens(item.tokens)} × {formatUsdRate(item.usdPerMillionTokens)} / 1M = {formatUsdSubtotal(
                  item.tokens * item.usdPerMillionTokens / 1_000_000,
                )}</span>
              </li>
            ))}
          </ul>
          {lowerBound === true ? <small>Known costs only; some settled runs have no usage.</small> : null}
          {pending === true ? <small>Running cost will be added when available.</small> : null}
        </span>
      )}
    </span>
  );
}

function dismissTooltip(event: KeyboardEvent<HTMLSpanElement>): void {
  if (event.key === "Escape") event.currentTarget.blur();
}

function formatTokens(tokens: number): string {
  return new Intl.NumberFormat("en-US").format(tokens);
}

function formatUsdRate(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

function formatUsdSubtotal(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(amount);
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

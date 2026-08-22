import type { EstimatedTokenCost } from "../../application/browser-transport-contract.ts";
import type { ReactNode } from "react";

export function CostEstimate({
  estimate,
  pending,
  lowerBound,
  testId,
  appearance = "inline",
}: {
  estimate?: EstimatedTokenCost;
  pending?: boolean;
  lowerBound?: boolean;
  testId?: string;
  appearance?: "inline" | "badge";
}): ReactNode {
  if (estimate === undefined && pending !== true) return null;
  const formatted = formatUsd(estimate?.amount ?? 0);
  const pendingText = pending === true ? "; will update when the current run finishes" : "";
  const lowerBoundText = lowerBound === true ? " is at least" : "";
  return (
    <span
      className={`cost-estimate${appearance === "badge" ? " cost-estimate-badge" : ""}`}
      role={pending === true ? "status" : "group"}
      aria-label={`Estimated token cost${lowerBoundText} ${formatted}${pendingText}`}
      title={lowerBound === true
        ? "Known process-defined token cost; one or more settled runs did not report usage"
        : "Process-defined estimated token cost"}
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      {pending === true ? <span className="cost-pending-spinner" aria-hidden="true" /> : null}
      <span aria-hidden="true">{lowerBound === true ? "≥" : ""}{formatted}</span>
    </span>
  );
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

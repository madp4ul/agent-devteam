import type { EstimatedTokenCost } from "../../application/browser-transport-contract.ts";
import type { ReactNode } from "react";

export function CostEstimate({
  estimate,
  pending,
  testId,
}: {
  estimate?: EstimatedTokenCost;
  pending?: boolean;
  testId?: string;
}): ReactNode {
  if (estimate === undefined && pending !== true) return null;
  const formatted = formatUsd(estimate?.amount ?? 0);
  const pendingText = pending === true ? "; will update when the current run finishes" : "";
  return (
    <span
      className="cost-estimate"
      role={pending === true ? "status" : "group"}
      aria-label={`Estimated token cost ${formatted}${pendingText}`}
      title="Process-defined estimated token cost"
      {...(testId === undefined ? {} : { "data-testid": testId })}
    >
      <span aria-hidden="true">Est. {formatted}</span>
      {pending === true ? <span className="cost-pending-spinner" aria-hidden="true" /> : null}
    </span>
  );
}

export function formatUsd(amount: number): string {
  if (amount === 0) return "$0";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

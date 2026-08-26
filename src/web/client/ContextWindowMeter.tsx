import { useId, type KeyboardEvent, type ReactNode } from "react";

import type { AttemptContextWindowUsage } from "../../application/browser-transport-contract.ts";

export function ContextWindowMeter({ usage }: { usage: AttemptContextWindowUsage }): ReactNode {
  const tooltipId = useId();
  const used = formatTokens(usage.usedTokens);
  const window = formatTokens(usage.contextWindowTokens);
  return (
    <span
      className="context-window-meter"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={usage.usedPercent}
      aria-label={`Context window ${usage.usedPercent}% used, ${used} of ${window} tokens`}
      aria-describedby={tooltipId}
      tabIndex={0}
      title="Latest active Codex context"
      onKeyDown={dismissTooltip}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle className="context-window-meter-track" cx="10" cy="10" r="7" />
        <circle
          className="context-window-meter-value"
          cx="10"
          cy="10"
          r="7"
          pathLength="100"
          strokeDasharray={`${usage.usedPercent} ${100 - usage.usedPercent}`}
        />
      </svg>
      <span
        id={tooltipId}
        className="context-window-breakdown cost-breakdown"
        role="tooltip"
        aria-label="Context window usage"
      >
        <strong>{usage.usedPercent}% used</strong>
        <span>{used} / {window} tokens</span>
        <small>Latest active Codex context after the completed turn.</small>
      </span>
    </span>
  );
}

function dismissTooltip(event: KeyboardEvent<HTMLSpanElement>): void {
  if (event.key === "Escape") event.currentTarget.blur();
}

function formatTokens(tokens: number): string {
  return new Intl.NumberFormat("en-US").format(tokens);
}

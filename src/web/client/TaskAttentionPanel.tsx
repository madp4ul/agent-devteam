import type { ReactNode } from "react";

import type { TaskAttentionView } from "../../application/browser-transport-contract.ts";
import { AttentionReasonResolution } from "./AttentionReasonAction.tsx";
import { errorMessage } from "./feedback.ts";
import { focusTimelineSource } from "./timeline-scroll-anchor.ts";

export function TaskAttentionPanel({
  reasons,
  highlightedReasonId,
  interruption,
  onChanged,
  onFeedback,
}: {
  reasons: TaskAttentionView[];
  highlightedReasonId: string | null;
  interruption: {
    taskId: string;
    activationId: string;
    agentName: string;
    canDismiss: boolean;
    mayStartNext?: boolean;
    reasonDescription: string;
  } | undefined;
  onChanged(): Promise<void>;
  onFeedback(feedback: { role: "status" | "alert"; text: string }): void;
}): ReactNode {
  return (
    <section
      className="detail-panel task-attention-panel"
      aria-labelledby="task-attention-heading"
    >
      <h2 id="task-attention-heading">Needs attention</h2>
      <ul className="attention-list">
        {reasons.map((attention) => (
          <li key={attention.id} className={`attention-reason-card${highlightedReasonId === attention.id ? " highlighted" : ""}`}>
            <AttentionReasonResolution
              reason={attention}
              highlighted={highlightedReasonId === attention.id}
              onOpenMention={(sourceEventId) => {
                if (sourceEventId !== null) focusTimelineSource(sourceEventId);
                else document.getElementById("timeline-heading")?.focus();
              }}
              {...(attention.type === "automation-suspended" && interruption !== undefined
                ? { interruption }
                : {})}
              onInterruptionCompleted={(action) => onFeedback({
                role: "status",
                text: action === "continue"
                  ? `Continued ${interruption?.taskId ?? "task automation"}.`
                  : `Dismissed interrupted activation for ${interruption?.agentName ?? "the agent"}.`,
              })}
              onResolved={onChanged}
              onError={(error) => onFeedback({ role: "alert", text: errorMessage(error) })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

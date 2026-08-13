import type { ReactNode } from "react";

import type { TaskAttentionView } from "../../application/coordination-contract.ts";
import { AttentionReasonResolution } from "./AttentionReasonAction.tsx";
import { errorMessage } from "./feedback.ts";

export function TaskAttentionPanel({
  reasons,
  highlightedReasonId,
  onChanged,
  onFeedback,
}: {
  reasons: TaskAttentionView[];
  highlightedReasonId: string | null;
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
          <li key={attention.id} className={highlightedReasonId === attention.id ? "highlighted" : ""}>
            <AttentionReasonResolution
              reason={attention}
              onResolved={onChanged}
              onError={(error) => onFeedback({ role: "alert", text: errorMessage(error) })}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

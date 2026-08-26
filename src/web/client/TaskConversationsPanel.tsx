import { useState, type ReactNode } from "react";

import type { AgentConversationIndexEntry, UserTaskDetailView } from "../../application/browser-transport-contract.ts";
import { AgentConversationDialog } from "./AgentConversationDialog.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { CostEstimate } from "./CostEstimate.tsx";

const conversationStatusPresentation = {
  running: { className: "status-running", label: "Conversation running" },
  "needs-attention": { className: "status-attention", label: "Conversation needs attention" },
} satisfies Record<Exclude<AgentConversationIndexEntry["status"], null>, {
  className: string;
  label: string;
}>;

export function TaskConversationsPanel({
  taskId,
  conversations,
  conversationCost,
  onCommentSource,
}: {
  taskId: string;
  conversations: AgentConversationIndexEntry[];
  conversationCost: UserTaskDetailView["conversationCost"];
  onCommentSource(commentId: string): void;
}): ReactNode {
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  if (conversations.length === 0) return null;

  return (
    <>
      <section className="detail-panel conversations-panel" aria-labelledby="conversations-heading">
        <div className="detail-panel-heading conversations-panel-heading">
          <h2 id="conversations-heading">Conversations</h2>
          {conversationCost === undefined ? null : (
            <CostEstimate
              {...(conversationCost.costEstimate === undefined ? {} : { estimate: conversationCost.costEstimate })}
              pending={conversationCost.costPending}
              lowerBound={conversationCost.hasUnpricedSettledRuns}
              {...(conversationCost.costBreakdown === undefined ? {} : { breakdown: conversationCost.costBreakdown })}
              testId="task-conversations-cost"
              appearance="badge"
            />
          )}
        </div>
        <ul className="conversation-index">
          {conversations.map((conversation) => {
            const status = conversation.status === null
              ? null
              : conversationStatusPresentation[conversation.status];
            return <li key={conversation.id}>
              <button
                className="conversation-index-row"
                type="button"
                title={conversation.continuation.available
                  ? conversation.label
                  : `${conversation.label} — conversation history is available; continuation is unavailable`}
                onClick={() => setSelectedConversationId(conversation.id)}
              >
                <strong>{conversation.owningAgent.name}</strong>
                <span className="conversation-index-meta">
                  {conversation.retired ? <span className="conversation-retired-label">Retired</span> : null}
                  {status === null ? null : (
                    <span
                      className={conversation.status === "running"
                        ? "cost-pending-spinner"
                        : `conversation-status-dot ${status.className}`}
                      role="status"
                      aria-label={status.label}
                      title={status.label}
                    />
                  )}
                  <RelativeTime value={conversation.latestActivityAt} />
                </span>
              </button>
            </li>
          })}
        </ul>
      </section>
      {selectedConversationId === undefined ? null : (
        <AgentConversationDialog
          taskId={taskId}
          conversationId={selectedConversationId}
          selectedAttemptRunning={false}
          onClose={() => setSelectedConversationId(undefined)}
          onCommentSource={onCommentSource}
        />
      )}
    </>
  );
}

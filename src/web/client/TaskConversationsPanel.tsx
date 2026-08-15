import { useState, type ReactNode } from "react";

import type { AgentConversationIndexEntry } from "../../application/coordination-contract.ts";
import { AgentConversationDialog } from "./AgentConversationDialog.tsx";
import { RelativeTime } from "./RelativeTime.tsx";

export function TaskConversationsPanel({
  taskId,
  conversations,
}: {
  taskId: string;
  conversations: AgentConversationIndexEntry[];
}): ReactNode {
  const [selectedConversationId, setSelectedConversationId] = useState<string>();
  if (conversations.length === 0) return null;

  return (
    <>
      <section className="detail-panel conversations-panel" aria-labelledby="conversations-heading">
        <h2 id="conversations-heading">Conversations</h2>
        <ul className="conversation-index">
          {conversations.map((conversation) => (
            <li key={conversation.id}>
              <button
                className="conversation-index-row"
                type="button"
                title={conversation.continuation.available
                  ? conversation.label
                  : `${conversation.label} — conversation history is available; continuation is unavailable`}
                onClick={() => setSelectedConversationId(conversation.id)}
              >
                <strong>{conversation.owningAgent.name}</strong>
                <span><RelativeTime value={conversation.latestActivityAt} /></span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      {selectedConversationId === undefined ? null : (
        <AgentConversationDialog
          taskId={taskId}
          conversationId={selectedConversationId}
          selectedAttemptRunning={false}
          onClose={() => setSelectedConversationId(undefined)}
        />
      )}
    </>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  AgentConversationView,
  AttemptTokenUsage,
} from "../../application/coordination-contract.ts";
import { readAgentConversation } from "./api.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";

export function AgentConversationDialog({
  taskId,
  conversationId,
  selectedAttemptRunning,
  onClose,
}: {
  taskId: string;
  conversationId: string;
  selectedAttemptRunning: boolean;
  onClose(): void;
}): ReactNode {
  const [conversation, setConversation] = useState<AgentConversationView>();
  const [conversationRunning, setConversationRunning] = useState(selectedAttemptRunning);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const contentRef = useRef<HTMLDivElement>(null);
  const pendingScrollPosition = useRef<number | "bottom" | null>(null);

  useLayoutEffect(() => {
    if (pendingScrollPosition.current === null || contentRef.current === null) return;
    contentRef.current.scrollTop = pendingScrollPosition.current === "bottom"
      ? contentRef.current.scrollHeight
      : pendingScrollPosition.current;
    pendingScrollPosition.current = null;
  }, [conversation]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const result = await readAgentConversation(taskId, conversationId);
        if (!active) return;
        if (result.available) {
          const content = contentRef.current;
          pendingScrollPosition.current = content === null
            ? null
            : content.scrollHeight - content.clientHeight - content.scrollTop <= 32
              ? "bottom"
              : content.scrollTop;
          setConversation(result.conversation);
          setConversationRunning(result.conversation.runs.some((run) => run.attempt.status === "running"));
          setUnavailable(false);
          setError(undefined);
        } else {
          setUnavailable(true);
        }
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      }
    };
    void refresh();
    const timer = conversationRunning
      ? window.setInterval(() => void refresh(), 1_000)
      : undefined;
    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [conversationId, conversationRunning, taskId]);

  return (
    <div
      className="modal-backdrop transcript-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="modal transcript-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-title"
      >
        <header className="modal-heading">
          <div>
            <p className="eyebrow">Read-only conversation</p>
            <h2 id="conversation-title">Agent conversation</h2>
            {conversation === undefined ? null : (
              <p>Owned by {conversation.owningAgent.name}</p>
            )}
          </div>
          <div className="transcript-header-actions">
            {conversation?.currentThreadId == null
              ? null
              : <CopyThreadIdButton threadId={conversation.currentThreadId} />}
            <CloseIconButton label="Close conversation" onClick={onClose} />
          </div>
        </header>
        <div ref={contentRef} className="transcript-content">
          {error !== undefined ? (
            <p className="unavailable" role="alert">{error}</p>
          ) : unavailable ? (
            <p className="unavailable">
              This conversation is unavailable. Durable coordination history remains complete.
            </p>
          ) : conversation === undefined ? (
            <p className="unavailable">Loading conversation…</p>
          ) : conversation.runs.length === 0 ? (
            <p className="unavailable">This conversation has not started a run yet.</p>
          ) : (<>
            <section className="conversation-origin" aria-label="Originating activation">
              <p className="eyebrow">Originating activation</p>
              <p>
                {activationReasonLabel(conversation.originatingActivation.reason.type)} · {conversation.originatingActivation.status}
              </p>
            </section>
            {conversation.runs.map((run, runIndex) => (
            <section className="conversation-run" key={run.attempt.id} aria-labelledby={`run-${run.attempt.id}`}>
              <header className="conversation-run-heading">
                <div>
                  <p className="eyebrow">Run {runIndex + 1}</p>
                  <h3 id={`run-${run.attempt.id}`}>Attempt {runIndex + 1} · {run.attempt.status}</h3>
                  <p><ElapsedTime startedAt={run.attempt.startedAt} completedAt={run.attempt.completedAt} /></p>
                </div>
                {run.transcript.available && run.transcript.usage !== undefined
                  ? <TokenUsageSummary usage={run.transcript.usage} />
                  : null}
              </header>
              {!run.transcript.available ? (
                <p className="unavailable">
                  Codex produced no inspectable evidence for this run.
                </p>
              ) : run.transcript.items.length === 0 ? (
                <p className="unavailable">Codex produced no inspectable conversation items for this run.</p>
              ) : run.transcript.items.map((item, index) => (
                <article key={item.id ?? `${run.attempt.id}-${index}`} className={`transcript-item ${item.kind}`}>
                  <p className="eyebrow">
                    {item.kind === "message"
                      ? "Codex message"
                      : item.kind === "tool"
                        ? `Tool · ${item.name}`
                        : "Diagnostic"}
                  </p>
                  {item.kind === "message" || item.kind === "diagnostic" ? (
                    <p>{item.text}</p>
                  ) : (
                    <>
                      <p><strong>{item.summary}</strong> · {item.status}</p>
                      {item.output === undefined ? null : (
                        <details className="tool-output">
                          <summary>View command output</summary>
                          <pre>{item.output}</pre>
                        </details>
                      )}
                    </>
                  )}
                </article>
              ))}
            </section>
            ))}
          </>)}
        </div>
      </section>
    </div>
  );
}

function activationReasonLabel(reason: AgentConversationView["originatingActivation"]["reason"]["type"]): string {
  switch (reason) {
    case "column-entry": return "Column entry";
    case "agent-mention": return "Agent mention";
    case "blockers-cleared": return "Blockers cleared";
  }
}

function TokenUsageSummary({ usage }: { usage: AttemptTokenUsage }): ReactNode {
  const format = (value: number): string => value.toLocaleString("en-US");
  const uncachedInputTokens = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  return (
    <div className="token-usage" role="region" aria-label="Token usage">
      <span>Input <strong>{format(uncachedInputTokens)}</strong></span>
      <span aria-hidden="true">·</span>
      <span>Output <strong>{format(usage.outputTokens)}</strong></span>
    </div>
  );
}

function CopyThreadIdButton({ threadId }: { threadId: string }): ReactNode {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="secondary"
      onClick={() => void navigator.clipboard.writeText(threadId).then(() => setCopied(true))}
    >
      {copied ? "Copied" : "Copy thread ID"}
    </button>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  AgentConversationView,
  AttemptTokenUsage,
} from "../../application/coordination-contract.ts";
import { continueAgentConversation, readAgentConversation } from "./api.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { Modal } from "./Modal.tsx";

export function AgentConversationDialog({
  taskId,
  conversationId,
  selectedAttemptRunning,
  selectedAttemptId,
  selectedMessageId,
  selectedPendingActivationId,
  onClose,
}: {
  taskId: string;
  conversationId: string;
  selectedAttemptRunning: boolean;
  selectedAttemptId?: string;
  selectedMessageId?: string;
  selectedPendingActivationId?: string;
  onClose(): void;
}): ReactNode {
  const [conversation, setConversation] = useState<AgentConversationView>();
  const [conversationRunning, setConversationRunning] = useState(
    selectedAttemptRunning || selectedPendingActivationId !== undefined,
  );
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingScrollPosition = useRef<number | "bottom" | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const pendingActivationId = useRef<string | undefined>(selectedPendingActivationId);
  const selectedContextPositioned = useRef(false);

  useLayoutEffect(() => {
    if (pendingScrollPosition.current === null || contentRef.current === null) return;
    contentRef.current.scrollTop = pendingScrollPosition.current === "bottom"
      ? contentRef.current.scrollHeight
      : pendingScrollPosition.current;
    pendingScrollPosition.current = null;
  }, [conversation]);

  useLayoutEffect(() => {
    if (
      (selectedAttemptId === undefined && selectedMessageId === undefined) ||
      selectedContextPositioned.current ||
      contentRef.current === null
    ) return;
    const candidates = [...contentRef.current.querySelectorAll<HTMLElement>(
      "[data-conversation-attempt], [data-conversation-message]",
    )];
    const selectedContext = selectedAttemptId === undefined
      ? candidates.find((element) => element.dataset.conversationMessage === selectedMessageId)
      : candidates.find((element) => element.dataset.conversationAttempt === selectedAttemptId);
    if (selectedContext === undefined) return;
    selectedContext.scrollIntoView({ block: "start" });
    selectedContextPositioned.current = true;
  }, [conversation, selectedAttemptId, selectedMessageId]);

  const refresh = useLatestRefresh(
    () => readAgentConversation(taskId, conversationId),
    (result) => {
        if (result.available) {
          const content = contentRef.current;
          pendingScrollPosition.current = content === null
            ? null
            : content.scrollHeight - content.clientHeight - content.scrollTop <= 32
              ? "bottom"
              : content.scrollTop;
          setConversation(result.conversation);
          const pendingAppeared = pendingActivationId.current !== undefined &&
            result.conversation.runs.some((run) => run.activationId === pendingActivationId.current);
          if (pendingAppeared) pendingActivationId.current = undefined;
          setConversationRunning(
            result.conversation.runs.some((run) => run.attempt.status === "running") ||
            (pendingActivationId.current !== undefined && !pendingAppeared),
          );
          setUnavailable(false);
          setError(undefined);
        } else {
          setUnavailable(true);
        }
    },
  );
  useEffect(() => {
    void refresh().catch((caught) => setError(errorMessage(caught)));
  }, [conversationId, conversationRunning, refresh, refreshVersion, taskId]);
  usePolling(
    refresh,
    conversationRunning ? 1_000 : undefined,
    (caught) => setError(errorMessage(caught)),
  );

  const submitFollowUp = async (): Promise<void> => {
    if (draft.trim().length === 0 || submitting || conversation?.continuation.available !== true) return;
    setSubmitting(true);
    setSubmissionError(undefined);
    try {
      const result = await continueAgentConversation(
        taskId,
        conversationId,
        draft,
        idempotencyKey.current,
      );
      if (!result.accepted) throw new Error(`Follow-up unavailable: ${result.reason}`);
      pendingActivationId.current = result.activationId;
      setConversationRunning(true);
      setConversation((current) => current === undefined || current.messages.some(({ id }) => id === result.message.id)
        ? current
        : { ...current, messages: [...current.messages, result.message] });
      setDraft("");
      idempotencyKey.current = crypto.randomUUID();
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      setSubmissionError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };
  const history = conversation === undefined ? [] : conversationHistory(conversation);
  const activeRunPresent = conversation?.runs.some(({ attempt }) => attempt.status === "running") ?? false;

  return (
    <Modal
      labelledBy="conversation-title"
      className="transcript-modal"
      backdropClassName="transcript-backdrop"
      initialFocusRef={closeButtonRef}
      onClose={onClose}
    >
        <header className="modal-heading">
          <div className="conversation-heading-copy">
            <p className="eyebrow" id="conversation-title">Agent conversation</p>
            {conversation === undefined ? (
              <h2>Loading…</h2>
            ) : (
              <div className="conversation-title-row">
                <h2>{conversation.owningAgent.name}</h2>
                <p className="conversation-origin-summary">
                  <span>Origin</span> · {activationReasonLabel(conversation.originatingActivation.reason.type)}
                </p>
              </div>
            )}
          </div>
          <div className="transcript-header-actions">
            {conversation?.currentThreadId == null
              ? null
              : <CopyThreadIdButton threadId={conversation.currentThreadId} />}
            <CloseIconButton buttonRef={closeButtonRef} label="Close conversation" onClick={onClose} />
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
            {history.map((entry) => entry.kind === "message" ? (
              <section
                key={`message-${entry.message.id}`}
                className={`conversation-user-turn${entry.awaitingRun ? " awaiting-run" : ""}${
                  entry.message.id === selectedMessageId ? " selected-message-turn" : ""
                }`}
                data-conversation-message={entry.message.id}
              >
                <article className="conversation-message user-message">
                  <p className="eyebrow">You</p>
                  <p>{entry.message.body}</p>
                </article>
                {entry.awaitingRun ? (
                  <div className="conversation-turn-pending" role="status" aria-label="Follow-up queued">
                    <span className="signal queued">Queued</span>
                    <p>
                      {activeRunPresent
                        ? `Waiting for ${conversation.owningAgent.name} to finish the current run.`
                        : `Waiting for ${conversation.owningAgent.name}'s next run to start.`}
                    </p>
                  </div>
                ) : null}
              </section>
            ) : (
            <section
              className={`conversation-run${entry.run.attempt.id === selectedAttemptId ? " selected-run" : ""}`}
              key={entry.run.attempt.id}
              data-conversation-attempt={entry.run.attempt.id}
              aria-labelledby={`run-${entry.run.attempt.id}`}
            >
              <header className="conversation-run-heading">
                <div className="conversation-run-identity">
                  <h3 id={`run-${entry.run.attempt.id}`}>Run {entry.runIndex + 1} · {entry.run.attempt.status}</h3>
                  <p>{conversation.owningAgent.name}</p>
                </div>
                <div className="conversation-run-metrics">
                  <p className="conversation-run-duration">
                    <span>Runtime</span> <strong><ElapsedTime startedAt={entry.run.attempt.startedAt} completedAt={entry.run.attempt.completedAt} /></strong>
                  </p>
                  {entry.run.transcript.available && entry.run.transcript.usage !== undefined
                    ? <TokenUsageSummary usage={entry.run.transcript.usage} />
                    : null}
                </div>
              </header>
              {entry.run.attempt.threadContinuity === "replaced" ? (
                <p className="unavailable">
                  Codex could not resume the prior thread. This run started a replacement thread, so earlier model context was not retained.
                </p>
              ) : null}
              {!entry.run.transcript.available ? (
                <p className="unavailable">
                  Codex produced no inspectable evidence for this run.
                </p>
              ) : entry.run.transcript.items.length === 0 ? (
                <p className="unavailable">Codex produced no inspectable conversation items for this run.</p>
              ) : entry.run.transcript.items.map((item, index) => (
                <article key={item.id ?? `${entry.run.attempt.id}-${index}`} className={`transcript-item ${item.kind}`}>
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
          {conversation === undefined ? null : (
            <form
              className="conversation-composer"
              aria-label="Continue conversation"
              onSubmit={(event) => {
                event.preventDefault();
                void submitFollowUp();
              }}
            >
              <label htmlFor={`conversation-follow-up-${conversation.id}`}>Follow-up message</label>
              <textarea
                id={`conversation-follow-up-${conversation.id}`}
                rows={3}
                value={draft}
                disabled={!conversation.continuation.available || submitting}
                onChange={(event) => setDraft(event.target.value)}
              />
              {!conversation.continuation.available ? (
                <p className="unavailable">{continuationUnavailableMessage(conversation.continuation.reason)}</p>
              ) : null}
              {submissionError === undefined ? null : <p className="unavailable" role="alert">{submissionError}</p>}
              <div className="conversation-composer-actions">
                <button type="submit" disabled={draft.trim().length === 0 || submitting || !conversation.continuation.available}>
                  {submitting ? "Sending…" : "Send follow-up"}
                </button>
              </div>
            </form>
          )}
        </div>
    </Modal>
  );
}

type ConversationHistoryEntry =
  | { kind: "message"; message: AgentConversationView["messages"][number]; awaitingRun: boolean }
  | { kind: "run"; run: AgentConversationView["runs"][number]; runIndex: number };

function conversationHistory(conversation: AgentConversationView): ConversationHistoryEntry[] {
  const messages = new Map(conversation.messages.map((message) => [message.id, message]));
  const history: ConversationHistoryEntry[] = [];
  conversation.runs.forEach((run, runIndex) => {
    const message = run.sourceMessageId === undefined ? undefined : messages.get(run.sourceMessageId);
    if (message !== undefined) {
      history.push({ kind: "message", message, awaitingRun: false });
      messages.delete(message.id);
    }
    history.push({ kind: "run", run, runIndex });
  });
  history.push(...[...messages.values()]
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
    .map((message) => ({ kind: "message" as const, message, awaitingRun: true })));
  return history;
}

function continuationUnavailableMessage(
  reason: Extract<AgentConversationView["continuation"], { available: false }>["reason"],
): string {
  switch (reason) {
    case "task-archived": return "Archived task conversations cannot be continued.";
    case "owning-agent-unavailable": return "The owning agent is no longer available in the applied process.";
    case "thread-unavailable": return "This conversation has no resumable Codex thread.";
  }
}

function activationReasonLabel(reason: AgentConversationView["originatingActivation"]["reason"]["type"]): string {
  switch (reason) {
    case "column-entry": return "Column entry";
    case "agent-mention": return "Agent mention";
    case "blockers-cleared": return "Blockers cleared";
    case "user-follow-up": return "User follow-up";
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

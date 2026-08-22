import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type { AgentConversationView } from "../../application/browser-transport-contract.ts";
import { continueAgentConversation, readAgentConversation, retireAgentConversation } from "./api.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { ConversationHistory } from "./ConversationHistory.tsx";
import { CostEstimate } from "./CostEstimate.tsx";
import { errorMessage } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { Modal } from "./Modal.tsx";
import { MoreActionsIconButton } from "./MoreActionsIconButton.tsx";

const ACTIVE_CONVERSATION_POLL_INTERVAL_MILLISECONDS = 1_000;
const IDLE_CONVERSATION_POLL_INTERVAL_MILLISECONDS = 2_000;

export function AgentConversationDialog({
  taskId,
  conversationId,
  selectedAttemptRunning,
  selectedAttemptId,
  selectedMessageId,
  selectedPendingActivationId,
  onClose,
  onCommentSource,
}: {
  taskId: string;
  conversationId: string;
  selectedAttemptRunning: boolean;
  selectedAttemptId?: string;
  selectedMessageId?: string;
  selectedPendingActivationId?: string;
  onClose(): void;
  onCommentSource?(commentId: string): void;
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
  const [retirementOpen, setRetirementOpen] = useState(false);
  const [retirementReason, setRetirementReason] = useState("");
  const [retirementSubmitting, setRetirementSubmitting] = useState(false);
  const [retirementError, setRetirementError] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreActionsButtonRef = useRef<HTMLButtonElement>(null);
  const retirementReasonRef = useRef<HTMLTextAreaElement>(null);
  const pendingScrollPosition = useRef<number | "bottom" | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const retirementIdempotencyKey = useRef(crypto.randomUUID());
  const pendingActivationId = useRef<string | undefined>(selectedPendingActivationId);

  useLayoutEffect(() => {
    if (pendingScrollPosition.current === null || contentRef.current === null) return;
    contentRef.current.scrollTop = pendingScrollPosition.current === "bottom"
      ? contentRef.current.scrollHeight
      : pendingScrollPosition.current;
    pendingScrollPosition.current = null;
  }, [conversation]);

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
  }, [conversationId, refresh, refreshVersion, taskId]);
  usePolling(
    refresh,
    conversationRunning
      ? ACTIVE_CONVERSATION_POLL_INTERVAL_MILLISECONDS
      : IDLE_CONVERSATION_POLL_INTERVAL_MILLISECONDS,
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
  const submitRetirement = async (): Promise<void> => {
    if (conversation === undefined || retirementReason.trim().length === 0 || retirementSubmitting) return;
    setRetirementSubmitting(true);
    setRetirementError(undefined);
    try {
      const result = await retireAgentConversation(
        taskId,
        conversation.id,
        retirementReason,
        retirementIdempotencyKey.current,
      );
      if (!result.accepted) throw new Error(`Retirement unavailable: ${result.reason}`);
      setConversation((current) => current === undefined
        ? current
        : {
            ...current,
            retirement: result.retirement,
            retirementAvailability: { available: false, reason: "already-retired" },
            latestActivityAt: result.retirement.occurredAt,
          });
      setRetirementOpen(false);
      setRetirementReason("");
      retirementIdempotencyKey.current = crypto.randomUUID();
      setRefreshVersion((version) => version + 1);
    } catch (caught) {
      setRetirementError(errorMessage(caught));
    } finally {
      setRetirementSubmitting(false);
    }
  };
  const closeRetirement = (): void => {
    if (retirementSubmitting) return;
    setRetirementOpen(false);
    setRetirementError(undefined);
    window.requestAnimationFrame(() => moreActionsButtonRef.current?.focus());
  };

  return (
    <>
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
                {conversation.retirement === null ? null : <span className="conversation-retired-label">Retired</span>}
                <p className="conversation-origin-summary">
                  <span>Origin</span> · {activationReasonLabel(conversation.originatingActivation.reason.type)}
                </p>
              </div>
            )}
          </div>
          <div className="transcript-header-actions">
            {conversation === undefined ? null : (
              <CostEstimate
                {...(conversation.costEstimate === undefined ? {} : { estimate: conversation.costEstimate })}
                pending={conversation.costPending}
                testId="conversation-cost"
              />
            )}
            {conversation === undefined ? null : <ConversationActionsMenu
              buttonRef={moreActionsButtonRef}
              threadId={conversation.currentThreadId}
              retirementAvailable={conversation.retirementAvailability.available}
              retirementUnavailableMessage={conversation.retirementAvailability.available
                ? undefined
                : retirementAvailabilityMessage(conversation)}
              onRetire={() => {
                setRetirementError(undefined);
                setRetirementOpen(true);
              }}
            />}
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
          ) : (
            <ConversationHistory
              conversation={conversation}
              {...(selectedAttemptId === undefined ? {} : { selectedAttemptId })}
              {...(selectedMessageId === undefined ? {} : { selectedMessageId })}
              {...(onCommentSource === undefined ? {} : {
                onCommentSource: (commentId) => {
                  onClose();
                  onCommentSource(commentId);
                },
              })}
            />
          )}
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
    {conversation === undefined || !retirementOpen ? null : (
      <Modal
        labelledBy="retirement-confirmation-title"
        className="retirement-confirmation"
        initialFocusRef={retirementReasonRef}
        onClose={closeRetirement}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitRetirement();
          }}
        >
          <div className="retirement-confirmation-copy">
            <h2 id="retirement-confirmation-title">Retire conversation?</h2>
            <p>
              Ordinary activations will stop reusing this conversation. Its history will remain readable and explicitly continuable.
            </p>
          </div>
          <label htmlFor={`conversation-retirement-reason-${conversation.id}`}>
            Reason for retirement
            <textarea
              ref={retirementReasonRef}
              id={`conversation-retirement-reason-${conversation.id}`}
              rows={3}
              value={retirementReason}
              disabled={retirementSubmitting}
              onChange={(event) => setRetirementReason(event.target.value)}
              required
            />
          </label>
          {retirementError === undefined ? null : <p className="unavailable" role="alert">{retirementError}</p>}
          <div className="dialog-actions">
            <button type="button" className="secondary" disabled={retirementSubmitting} onClick={closeRetirement}>Cancel</button>
            <button
              type="submit"
              className="destructive"
              disabled={retirementReason.trim().length === 0 || retirementSubmitting}
            >
              {retirementSubmitting ? "Retiring…" : "Retire conversation"}
            </button>
          </div>
        </form>
      </Modal>
    )}
    </>
  );
}

function retirementAvailabilityMessage(conversation: AgentConversationView): string {
  if (conversation.retirementAvailability.available) {
    return "Retirement is available because this conversation has no unfinished activation work.";
  }
  switch (conversation.retirementAvailability.reason) {
    case "already-retired": return "This conversation is retired. Ordinary activations will not return to it.";
    case "task-archived": return "Archived task conversations cannot be retired.";
    case "activation-work-pending": return "Finish, dismiss, interrupt, or recover this agent's unfinished work before retiring the conversation.";
  }
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

function ConversationActionsMenu({
  buttonRef,
  threadId,
  retirementAvailable,
  retirementUnavailableMessage,
  onRetire,
}: {
  buttonRef: RefObject<HTMLButtonElement | null>;
  threadId?: string | null;
  retirementAvailable: boolean;
  retirementUnavailableMessage?: string | undefined;
  onRetire(): void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);

  useLayoutEffect(() => {
    if (open) firstItemRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [buttonRef, open]);

  return (
    <div ref={containerRef} className="conversation-actions-menu">
      <MoreActionsIconButton
        buttonRef={buttonRef}
        expanded={open}
        label="More conversation actions"
        onClick={() => setOpen((current) => !current)}
      />
      {open ? (
        <div
          className="conversation-actions-options"
          role="menu"
          aria-label="Conversation actions"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setOpen(false);
              buttonRef.current?.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')];
            const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
            const nextIndex = event.key === "Home" ? 0
              : event.key === "End" ? items.length - 1
              : event.key === "ArrowDown" ? (currentIndex + 1) % items.length
              : (currentIndex - 1 + items.length) % items.length;
            items[nextIndex]?.focus();
          }}
        >
          {threadId == null ? null : (
            <button
              ref={firstItemRef}
              type="button"
              role="menuitem"
              onClick={() => {
                void navigator.clipboard.writeText(threadId).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy thread ID"}
            </button>
          )}
          <button
            ref={threadId == null ? firstItemRef : undefined}
            type="button"
            role="menuitem"
            className="conversation-retire-menu-item"
            aria-disabled={!retirementAvailable}
            aria-describedby={!retirementAvailable ? "conversation-retirement-unavailable" : undefined}
            title={retirementUnavailableMessage}
            onClick={() => {
              if (!retirementAvailable) return;
              setOpen(false);
              onRetire();
            }}
          >
            Retire conversation
          </button>
          {retirementAvailable || retirementUnavailableMessage === undefined ? null : (
            <span id="conversation-retirement-unavailable" className="visually-hidden">
              {retirementUnavailableMessage}
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
}

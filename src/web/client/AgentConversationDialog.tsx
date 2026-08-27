import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type { AgentConversationView } from "../../application/browser-transport-contract.ts";
import { readAgentConversation, retireAgentConversation } from "./api.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { ConversationFollowUpComposer } from "./ConversationFollowUpComposer.tsx";
import { ConversationHistory } from "./ConversationHistory.tsx";
import { CostEstimate } from "./CostEstimate.tsx";
import { ContextWindowMeter } from "./ContextWindowMeter.tsx";
import { errorMessage } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { Modal } from "./Modal.tsx";
import { MoreActionsIconButton } from "./MoreActionsIconButton.tsx";
import {
  captureTextSelectionWithin,
  restoreCapturedTextSelection,
  type CapturedTextSelection,
} from "./text-selection.ts";

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
  const bottomFollowing = useRef<"inactive" | "following" | "cancelled">("inactive");
  const pendingTextSelection = useRef<CapturedTextSelection | null>(null);
  const bottomFollowFrame = useRef<number | undefined>(undefined);
  const userScrollFrame = useRef<number | undefined>(undefined);
  const userScrollPending = useRef(false);
  const pointerScrolling = useRef(false);
  const retirementIdempotencyKey = useRef(crypto.randomUUID());
  const pendingActivationId = useRef<string | undefined>(selectedPendingActivationId);
  const cancelBottomFollowing = (): void => {
    if (bottomFollowing.current === "following") bottomFollowing.current = "cancelled";
  };
  const cancelIfViewportMoved = (startingScrollTop: number): void => {
    if (bottomFollowing.current !== "following") return;
    if (bottomFollowFrame.current !== undefined) window.cancelAnimationFrame(bottomFollowFrame.current);
    bottomFollowFrame.current = undefined;
    userScrollPending.current = true;
    if (userScrollFrame.current !== undefined) window.cancelAnimationFrame(userScrollFrame.current);
    userScrollFrame.current = window.requestAnimationFrame(() => {
      userScrollFrame.current = undefined;
      userScrollPending.current = false;
      if (
        bottomFollowing.current === "following" &&
        contentRef.current !== null &&
        Math.abs(contentRef.current.scrollTop - startingScrollTop) > 1
      ) {
        cancelBottomFollowing();
      } else if (bottomFollowing.current === "following" && contentRef.current !== null) {
        contentRef.current.scrollTop = contentRef.current.scrollHeight;
      }
    });
  };
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (content === null) return;
    if (userScrollPending.current) {
      if (typeof pendingScrollPosition.current === "number") content.scrollTop = pendingScrollPosition.current;
    } else if (bottomFollowing.current === "following" || pendingScrollPosition.current === "bottom") {
      content.scrollTop = content.scrollHeight;
    } else if (pendingScrollPosition.current !== null) {
      content.scrollTop = pendingScrollPosition.current;
    }
    pendingScrollPosition.current = null;
    restoreCapturedTextSelection(pendingTextSelection.current);
    pendingTextSelection.current = null;
  }, [conversation]);
  useEffect(() => {
    const content = contentRef.current;
    if (content === null) return;
    const followAfterLayout = (): void => {
      if (
        bottomFollowing.current !== "following" ||
        bottomFollowFrame.current !== undefined ||
        userScrollPending.current
      ) return;
      bottomFollowFrame.current = window.requestAnimationFrame(() => {
        bottomFollowFrame.current = undefined;
        if (bottomFollowing.current === "following" && contentRef.current !== null) {
          contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
      });
    };
    const resizeObserver = new ResizeObserver(followAfterLayout);
    const observeFollowedSurfaces = (): void => {
      resizeObserver.observe(content);
      for (const element of content.querySelectorAll<HTMLElement>(".conversation-stream, .conversation-composer")) {
        resizeObserver.observe(element);
      }
      followAfterLayout();
    };
    const mutationObserver = new MutationObserver(observeFollowedSurfaces);
    mutationObserver.observe(content, { childList: true, subtree: true });
    observeFollowedSurfaces();
    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      if (bottomFollowFrame.current !== undefined) window.cancelAnimationFrame(bottomFollowFrame.current);
      bottomFollowFrame.current = undefined;
      if (userScrollFrame.current !== undefined) window.cancelAnimationFrame(userScrollFrame.current);
      userScrollFrame.current = undefined;
      userScrollPending.current = false;
    };
  }, [conversationId]);

  const refresh = useLatestRefresh(
    () => readAgentConversation(taskId, conversationId),
    (result) => {
        if (result.available) {
          const content = contentRef.current;
          pendingScrollPosition.current = content === null
            ? null
            : userScrollPending.current
              ? content.scrollTop
              : bottomFollowing.current === "following"
              ? "bottom"
              : bottomFollowing.current === "cancelled"
                ? content.scrollTop
                : content.scrollHeight - content.clientHeight - content.scrollTop <= 32
              ? "bottom"
              : content.scrollTop;
          pendingTextSelection.current = captureTextSelectionWithin(content);
          setConversation(result.conversation);
          const pendingAppeared = pendingActivationId.current !== undefined &&
            result.conversation.history.some((entry) =>
              (entry.kind === "activation" || entry.kind === "message") && entry.activationId === pendingActivationId.current
            );
          if (pendingAppeared) pendingActivationId.current = undefined;
          setConversationRunning(
            result.conversation.history.some((entry) =>
              (entry.kind === "activation" || entry.kind === "message") && (entry.status === "queued" || entry.status === "running")
            ) ||
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
                lowerBound={conversation.hasUnpricedSettledRuns}
                {...(conversation.costBreakdown === undefined ? {} : { breakdown: conversation.costBreakdown })}
                testId="conversation-cost"
                appearance="badge"
              />
            )}
            {conversation?.contextWindowUsage === undefined
              ? null
              : <ContextWindowMeter usage={conversation.contextWindowUsage} />}
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
        <div
          ref={contentRef}
          className="transcript-content"
          onWheelCapture={(event) => {
            cancelIfViewportMoved(event.currentTarget.scrollTop);
          }}
          onTouchMove={(event) => {
            cancelIfViewportMoved(event.currentTarget.scrollTop);
          }}
          onPointerDown={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            pointerScrolling.current = event.clientX >= bounds.right - 24 && event.clientX <= bounds.right;
          }}
          onPointerUp={() => {
            pointerScrolling.current = false;
          }}
          onPointerCancel={() => {
            pointerScrolling.current = false;
          }}
          onScroll={() => {
            if (pointerScrolling.current) cancelBottomFollowing();
          }}
          onKeyDown={(event) => {
            if (
              bottomFollowing.current === "following" &&
              ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)
            ) cancelIfViewportMoved(event.currentTarget.scrollTop);
          }}
        >
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
          {conversation?.continuation.available !== true ? null : (
            <ConversationFollowUpComposer
              key={conversation.id}
              taskId={taskId}
              conversationId={conversation.id}
              acceptWindowDrops={!retirementOpen}
              onSubmissionStart={() => {
                const content = contentRef.current;
                bottomFollowing.current = content !== null &&
                  content.scrollHeight - content.clientHeight - content.scrollTop <= 32
                  ? "following"
                  : "inactive";
              }}
              onSubmissionFailed={() => {
                bottomFollowing.current = "inactive";
              }}
              onAccepted={(result) => {
                pendingActivationId.current = result.activationId;
                setConversationRunning(true);
                setConversation((current) => current === undefined || current.history.some((entry) => entry.kind === "message" && entry.message.id === result.message.id)
                  ? current
                  : {
                      ...current,
                      history: [...current.history, { kind: "message", activationId: result.activationId, status: "queued", attemptIds: [], message: result.message }],
                    });
                setRefreshVersion((version) => version + 1);
              }}
            />
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

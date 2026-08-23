import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type { AgentConversationView, PendingConversationUploadView } from "../../application/browser-transport-contract.ts";
import { continueAgentConversation, readAgentConversation, removeConversationUpload, retireAgentConversation, uploadConversationFile } from "./api.ts";
import { AttachmentIconButton } from "./AttachmentIconButton.tsx";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { ConversationHistory } from "./ConversationHistory.tsx";
import { CostEstimate } from "./CostEstimate.tsx";
import { errorMessage } from "./feedback.ts";
import { formatFileSize } from "./file-size.ts";
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
const MAX_ATTACHMENTS = 20;
const MAX_ATTACHMENT_BYTES = 512 * 1024 * 1024;

interface ComposerUpload {
  key: string;
  file: File;
  progress: number;
  state: "uploading" | "uploaded" | "failed";
  upload?: PendingConversationUploadView;
  error?: string;
}

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
  const [uploads, setUploads] = useState<ComposerUpload[]>([]);
  const [retirementOpen, setRetirementOpen] = useState(false);
  const [retirementReason, setRetirementReason] = useState("");
  const [retirementSubmitting, setRetirementSubmitting] = useState(false);
  const [retirementError, setRetirementError] = useState<string>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const moreActionsButtonRef = useRef<HTMLButtonElement>(null);
  const retirementReasonRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllers = useRef(new Map<string, AbortController>());
  const uploadsRef = useRef<ComposerUpload[]>([]);
  const pendingScrollPosition = useRef<number | "bottom" | null>(null);
  const pendingTextSelection = useRef<CapturedTextSelection | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());
  const retirementIdempotencyKey = useRef(crypto.randomUUID());
  const pendingActivationId = useRef<string | undefined>(selectedPendingActivationId);
  uploadsRef.current = uploads;

  const startUpload = (item: ComposerUpload): void => {
    const controller = new AbortController();
    uploadControllers.current.set(item.key, controller);
    setUploads((current) => current.map((entry) => entry.key === item.key
      ? { key: entry.key, file: entry.file, state: "uploading", progress: 0 }
      : entry));
    void uploadConversationFile(taskId, conversationId, item.file, (progress) => {
      setUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, progress } : entry));
    }, controller.signal).then((upload) => {
      uploadControllers.current.delete(item.key);
      setUploads((current) => current.map((entry) => entry.key === item.key
        ? { ...entry, state: "uploaded", progress: 1, upload }
        : entry));
    }).catch((caught) => {
      uploadControllers.current.delete(item.key);
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setUploads((current) => current.map((entry) => entry.key === item.key
        ? { ...entry, state: "failed", error: errorMessage(caught) }
        : entry));
    });
  };
  const addFiles = (files: FileList | File[]): void => {
    const additions = Array.from(files);
    if (additions.length === 0) return;
    if (uploadsRef.current.length + additions.length > MAX_ATTACHMENTS) {
      setSubmissionError(`A follow-up can contain at most ${MAX_ATTACHMENTS} files.`);
      return;
    }
    const total = [...uploadsRef.current.map(({ file }) => file), ...additions]
      .reduce((sum, file) => sum + file.size, 0);
    if (additions.some(({ size }) => size > MAX_ATTACHMENT_BYTES) || total > MAX_ATTACHMENT_BYTES) {
      setSubmissionError("The selected files exceed the 512 MB attachment limit.");
      return;
    }
    setSubmissionError(undefined);
    const items = additions.map((file): ComposerUpload => ({
      key: crypto.randomUUID(), file, progress: 0, state: "uploading",
    }));
    setUploads((current) => [...current, ...items]);
    for (const item of items) startUpload(item);
  };
  const removeUpload = (item: ComposerUpload): void => {
    uploadControllers.current.get(item.key)?.abort();
    uploadControllers.current.delete(item.key);
    setUploads((current) => current.filter(({ key }) => key !== item.key));
    if (item.upload !== undefined) {
      void removeConversationUpload(taskId, conversationId, item.upload.id).catch(() => undefined);
    }
  };
  const closeConversation = (): void => {
    for (const controller of uploadControllers.current.values()) controller.abort();
    uploadControllers.current.clear();
    for (const item of uploadsRef.current) {
      if (item.upload !== undefined) void removeConversationUpload(taskId, conversationId, item.upload.id).catch(() => undefined);
    }
    onClose();
  };

  useEffect(() => {
    if (conversation?.continuation.available !== true || retirementOpen) return;
    const acceptDroppedFiles = (event: DragEvent): void => {
      const transfer = event.dataTransfer;
      if (transfer === null) return;
      const directory = Array.from(transfer.items).some((item) => item.webkitGetAsEntry()?.isDirectory === true);
      if (directory) {
        event.preventDefault();
        setSubmissionError("Folders cannot be attached. Select the files inside the folder instead.");
        return;
      }
      if (transfer.files.length === 0) return;
      event.preventDefault();
      addFiles(transfer.files);
    };
    window.addEventListener("drop", acceptDroppedFiles);
    return () => window.removeEventListener("drop", acceptDroppedFiles);
  });

  useLayoutEffect(() => {
    if (pendingScrollPosition.current === null || contentRef.current === null) return;
    contentRef.current.scrollTop = pendingScrollPosition.current === "bottom"
      ? contentRef.current.scrollHeight
      : pendingScrollPosition.current;
    pendingScrollPosition.current = null;
    restoreCapturedTextSelection(pendingTextSelection.current);
    pendingTextSelection.current = null;
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

  const submitFollowUp = async (): Promise<void> => {
    const attachmentIds = uploads.flatMap(({ state, upload }) => state === "uploaded" && upload !== undefined ? [upload.id] : []);
    if ((draft.trim().length === 0 && attachmentIds.length === 0) || uploads.some(({ state }) => state !== "uploaded") || submitting || conversation?.continuation.available !== true) return;
    setSubmitting(true);
    setSubmissionError(undefined);
    try {
      const result = await continueAgentConversation(
        taskId,
        conversationId,
        draft,
        idempotencyKey.current,
        attachmentIds,
      );
      if (!result.accepted) throw new Error(`Follow-up unavailable: ${result.reason}`);
      pendingActivationId.current = result.activationId;
      setConversationRunning(true);
      setConversation((current) => current === undefined || current.history.some((entry) => entry.kind === "message" && entry.message.id === result.message.id)
        ? current
        : {
            ...current,
            history: [...current.history, { kind: "message", activationId: result.activationId, status: "queued", attemptIds: [], message: result.message }],
          });
      setDraft("");
      setUploads([]);
      uploadControllers.current.clear();
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
      onClose={closeConversation}
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
                testId="conversation-cost"
                appearance="badge"
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
            <CloseIconButton buttonRef={closeButtonRef} label="Close conversation" onClick={closeConversation} />
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
                  closeConversation();
                  onCommentSource(commentId);
                },
              })}
            />
          )}
          {conversation?.continuation.available !== true ? null : (
            <form
              className="conversation-composer"
              aria-label="Continue conversation"
              onSubmit={(event) => {
                event.preventDefault();
                void submitFollowUp();
              }}
            >
              <label htmlFor={`conversation-follow-up-${conversation.id}`}>Follow-up message</label>
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                multiple
                tabIndex={-1}
                onChange={(event) => {
                  if (event.target.files !== null) addFiles(event.target.files);
                  event.target.value = "";
                }}
              />
              {uploads.length === 0 ? null : (
                <ul className="conversation-upload-list" aria-label="Files for this follow-up">
                  {uploads.map((item) => (
                    <li key={item.key} className={item.state}>
                      <span className="conversation-upload-name" title={item.upload?.fileName ?? item.file.name}>{item.upload?.fileName ?? item.file.name}</span>
                      <small>{formatFileSize(item.file.size)}</small>
                      {item.state === "uploading" ? <progress max={1} value={item.progress} aria-label={`Uploading ${item.file.name}`} /> : null}
                      {item.state === "uploaded" ? <small className="conversation-upload-success">Uploaded</small> : null}
                      {item.state === "failed" ? <span className="conversation-upload-error" role="alert">Upload failed: {item.error ?? "transfer error"}</span> : null}
                      {item.state === "failed" ? (
                        <AttachmentIconButton action="retry" label={`Retry ${item.file.name}`} onClick={() => startUpload(item)} />
                      ) : null}
                      <AttachmentIconButton action="remove" label={`Remove ${item.file.name}`} onClick={() => removeUpload(item)} />
                    </li>
                  ))}
                </ul>
              )}
              <div className="conversation-composer-input">
                <textarea
                  id={`conversation-follow-up-${conversation.id}`}
                  rows={3}
                  value={draft}
                  disabled={submitting}
                  onChange={(event) => setDraft(event.target.value)}
                />
                <div className="conversation-composer-actions">
                  <AttachmentIconButton
                    action="attach"
                    label="Attach files"
                    disabled={submitting || uploads.length >= MAX_ATTACHMENTS}
                    onClick={() => fileInputRef.current?.click()}
                  />
                  <button type="submit" disabled={(draft.trim().length === 0 && uploads.every(({ state }) => state !== "uploaded")) || uploads.some(({ state }) => state !== "uploaded") || submitting}>
                  {submitting ? "Sending…" : "Send follow-up"}
                  </button>
                </div>
              </div>
              {submissionError === undefined ? null : <p className="unavailable" role="alert">{submissionError}</p>}
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

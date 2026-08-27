import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { conversationAttachmentPolicy } from "../../application/conversation-attachment-policy.ts";
import type {
  ContinueAgentConversationResult,
  PendingConversationUploadView,
} from "../../application/browser-transport-contract.ts";
import { continueAgentConversation, removeConversationUpload, uploadConversationFile } from "./api.ts";
import { AttachmentIconButton } from "./AttachmentIconButton.tsx";
import { errorMessage } from "./feedback.ts";
import { formatFileSize } from "./file-size.ts";

interface ComposerUpload {
  key: string;
  file: File;
  progress: number;
  state: "uploading" | "uploaded" | "failed";
  upload?: PendingConversationUploadView;
  error?: string;
}

type AcceptedFollowUp = Extract<ContinueAgentConversationResult, { accepted: true }>;

export function ConversationFollowUpComposer({
  taskId,
  conversationId,
  acceptWindowDrops,
  onSubmissionStart,
  onSubmissionFailed,
  onAccepted,
}: {
  taskId: string;
  conversationId: string;
  acceptWindowDrops: boolean;
  onSubmissionStart(): void;
  onSubmissionFailed(): void;
  onAccepted(followUp: AcceptedFollowUp): void;
}): ReactNode {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string>();
  const [uploads, setUploads] = useState<ComposerUpload[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadControllers = useRef(new Map<string, AbortController>());
  const uploadsRef = useRef<ComposerUpload[]>([]);
  const disposed = useRef(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const updateUploads = (update: (current: ComposerUpload[]) => ComposerUpload[]): void => {
    const next = update(uploadsRef.current);
    uploadsRef.current = next;
    setUploads(next);
  };
  const discardPendingUpload = (uploadId: string): void => {
    void removeConversationUpload(taskId, conversationId, uploadId).catch(() => undefined);
  };
  const startUpload = (item: ComposerUpload): void => {
    const controller = new AbortController();
    uploadControllers.current.set(item.key, controller);
    updateUploads((current) => current.map((entry) => entry.key === item.key
      ? { key: entry.key, file: entry.file, state: "uploading", progress: 0 }
      : entry));
    void uploadConversationFile(taskId, conversationId, item.file, (progress) => {
      if (disposed.current) return;
      updateUploads((current) => current.map((entry) => entry.key === item.key ? { ...entry, progress } : entry));
    }, controller.signal).then((upload) => {
      uploadControllers.current.delete(item.key);
      if (disposed.current) {
        discardPendingUpload(upload.id);
        return;
      }
      updateUploads((current) => current.map((entry) => entry.key === item.key
        ? { ...entry, state: "uploaded", progress: 1, upload }
        : entry));
    }).catch((caught) => {
      uploadControllers.current.delete(item.key);
      if (disposed.current || (caught instanceof DOMException && caught.name === "AbortError")) return;
      updateUploads((current) => current.map((entry) => entry.key === item.key
        ? { ...entry, state: "failed", error: errorMessage(caught) }
        : entry));
    });
  };
  const addFiles = (files: FileList | File[]): void => {
    const additions = Array.from(files);
    if (additions.length === 0) return;
    if (uploadsRef.current.length + additions.length > conversationAttachmentPolicy.maximumAttachments) {
      setSubmissionError(`A follow-up can contain at most ${conversationAttachmentPolicy.maximumAttachments} files.`);
      return;
    }
    const total = [...uploadsRef.current.map(({ file }) => file), ...additions]
      .reduce((sum, file) => sum + file.size, 0);
    if (
      additions.some(({ size }) => size > conversationAttachmentPolicy.maximumTotalBytes) ||
      total > conversationAttachmentPolicy.maximumTotalBytes
    ) {
      const sizeLabel = formatFileSize(conversationAttachmentPolicy.maximumTotalBytes).replace(/\.0(?= MB$)/, "");
      setSubmissionError(`The selected files exceed the ${sizeLabel} attachment limit.`);
      return;
    }
    setSubmissionError(undefined);
    const items = additions.map((file): ComposerUpload => ({
      key: crypto.randomUUID(), file, progress: 0, state: "uploading",
    }));
    updateUploads((current) => [...current, ...items]);
    for (const item of items) startUpload(item);
  };
  const removeUpload = (item: ComposerUpload): void => {
    uploadControllers.current.get(item.key)?.abort();
    uploadControllers.current.delete(item.key);
    updateUploads((current) => current.filter(({ key }) => key !== item.key));
    if (item.upload !== undefined) discardPendingUpload(item.upload.id);
  };

  useLayoutEffect(() => {
    disposed.current = false;
    return () => {
      disposed.current = true;
      for (const controller of uploadControllers.current.values()) controller.abort();
      uploadControllers.current.clear();
      for (const item of uploadsRef.current) {
        if (item.upload !== undefined) discardPendingUpload(item.upload.id);
      }
      uploadsRef.current = [];
    };
  }, [conversationId, taskId]);

  useEffect(() => {
    if (!acceptWindowDrops) return;
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

  const submitFollowUp = async (): Promise<void> => {
    const attachmentIds = uploads.flatMap(({ state, upload }) => state === "uploaded" && upload !== undefined ? [upload.id] : []);
    if (
      (draft.trim().length === 0 && attachmentIds.length === 0) ||
      uploads.some(({ state }) => state !== "uploaded") ||
      submitting
    ) return;
    onSubmissionStart();
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
      uploadsRef.current = [];
      setUploads([]);
      uploadControllers.current.clear();
      setDraft("");
      idempotencyKey.current = crypto.randomUUID();
      onAccepted(result);
    } catch (caught) {
      onSubmissionFailed();
      setSubmissionError(errorMessage(caught));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      className="conversation-composer"
      aria-label="Continue conversation"
      onSubmit={(event) => {
        event.preventDefault();
        void submitFollowUp();
      }}
    >
      <label htmlFor={`conversation-follow-up-${conversationId}`}>Follow-up message</label>
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
          id={`conversation-follow-up-${conversationId}`}
          rows={3}
          value={draft}
          disabled={submitting}
          onChange={(event) => setDraft(event.target.value)}
        />
        <div className="conversation-composer-actions">
          <AttachmentIconButton
            action="attach"
            label="Attach files"
            disabled={submitting || uploads.length >= conversationAttachmentPolicy.maximumAttachments}
            onClick={() => fileInputRef.current?.click()}
          />
          <button type="submit" disabled={(draft.trim().length === 0 && uploads.every(({ state }) => state !== "uploaded")) || uploads.some(({ state }) => state !== "uploaded") || submitting}>
            {submitting ? "Sending…" : "Send follow-up"}
          </button>
        </div>
      </div>
      {submissionError === undefined ? null : <p className="unavailable" role="alert">{submissionError}</p>}
    </form>
  );
}

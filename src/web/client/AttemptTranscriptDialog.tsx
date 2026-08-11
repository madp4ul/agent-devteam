import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  AttemptTokenUsage,
  AttemptTranscriptItem,
  AttemptView,
} from "../../application/coordination-contract.ts";
import { readAttemptTranscript } from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";

export function AttemptTranscriptDialog({ attempt, agentName, onClose }: {
  attempt: AttemptView;
  agentName: string;
  onClose(): void;
}): ReactNode {
  const [items, setItems] = useState<AttemptTranscriptItem[]>();
  const [usage, setUsage] = useState<AttemptTokenUsage>();
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
  }, [items]);

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
        const result = await readAttemptTranscript(attempt.id);
        if (!active) return;
        if (result.available) {
          const content = contentRef.current;
          pendingScrollPosition.current = content === null
            ? null
            : content.scrollHeight - content.clientHeight - content.scrollTop <= 32
              ? "bottom"
              : content.scrollTop;
          setItems(result.items);
          setUsage(result.usage);
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
    const timer = attempt.status === "running"
      ? window.setInterval(() => void refresh(), 1_000)
      : undefined;
    return () => {
      active = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [attempt.id, attempt.status]);

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
        aria-labelledby="transcript-title"
      >
        <header className="modal-heading">
          <div>
            <p className="eyebrow">Read-only run evidence</p>
            <h2 id="transcript-title">Attempt transcript</h2>
            <p>{agentName} · {attempt.status} · <ElapsedTime startedAt={attempt.startedAt} completedAt={attempt.completedAt} /></p>
          </div>
          <div className="transcript-header-actions">
            {usage === undefined ? null : <TokenUsageSummary usage={usage} />}
            {attempt.threadId === null ? null : <CopyThreadIdButton threadId={attempt.threadId} />}
            <button className="icon-button" aria-label="Close transcript" onClick={onClose}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>
        <div ref={contentRef} className="transcript-content">
          {error !== undefined ? (
            <p className="unavailable" role="alert">{error}</p>
          ) : unavailable ? (
            <p className="unavailable">
              This transcript is unavailable from Codex. Durable coordination history remains complete.
            </p>
          ) : items === undefined ? (
            <p className="unavailable">Loading transcript from Codex…</p>
          ) : items.length === 0 ? (
            <p className="unavailable">Codex produced no inspectable transcript items for this attempt.</p>
          ) : (
            items.map((item, index) => (
              <article key={item.id ?? `${attempt.id}-${index}`} className={`transcript-item ${item.kind}`}>
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
            ))
          )}
        </div>
      </section>
    </div>
  );
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

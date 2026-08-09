import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

import type {
  ActivationView,
  AttemptView,
  ActivationStartupFailureView,
  TaskActivityView,
  TaskCommentView,
  AttemptTranscriptItem,
} from "../../application/coordination-contract.ts";
import { readAttemptTranscript } from "./api.ts";
import { errorMessage } from "./feedback.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";

type TimelineItem =
  | { key: string; kind: "comment"; occurredAt: string; comment: TaskCommentView }
  | { key: string; kind: "event"; occurredAt: string; activity: TaskActivityView }
  | {
      key: string;
      kind: "attempt";
      occurredAt: string;
      attempt: AttemptView;
      number: number;
      agentId: string;
    }
  | {
      key: string;
      kind: "startup-failure";
      occurredAt: string;
      failure: ActivationStartupFailureView;
      agentId: string;
    }
  | {
      key: string;
      kind: "scheduled-retry";
      occurredAt: string;
      nextAttempt: number;
      agentId: string;
    };

export function TaskTimeline({
  comments,
  activity,
  activations,
}: {
  comments: TaskCommentView[];
  activity: TaskActivityView[];
  activations: ActivationView[];
}): ReactNode {
  const [transcriptSelection, setTranscriptSelection] = useState<{ attemptId: string; agentId: string }>();
  const timeline = buildTimeline(comments, activity, activations);
  const transcriptAttempt = transcriptSelection === undefined
    ? undefined
    : activations
      .flatMap((activation) => activation.attempts)
      .find((attempt) => attempt.id === transcriptSelection.attemptId);
  return (
    <>
      <section className="timeline-section" aria-labelledby="timeline-heading">
        <p className="eyebrow">Complete history</p>
        <h2 id="timeline-heading">Task timeline</h2>
        <ol className="timeline">
          {timeline.map((entry) => (
            <TimelineEntry key={entry.key} entry={entry} onTranscript={setTranscriptSelection} />
          ))}
        </ol>
      </section>
      {transcriptAttempt === undefined || transcriptSelection === undefined ? null : (
        <TranscriptDialog
          attempt={transcriptAttempt}
          agentId={transcriptSelection.agentId}
          onClose={() => setTranscriptSelection(undefined)}
        />
      )}
    </>
  );
}

function buildTimeline(
  comments: TaskCommentView[],
  activity: TaskActivityView[],
  activations: ActivationView[],
): TimelineItem[] {
  const attempts = activations.flatMap((activation) =>
    activation.attempts.map((attempt, index) => ({
      key: `attempt-${attempt.id}`,
      kind: "attempt" as const,
      occurredAt: attempt.startedAt,
      attempt,
      number: index + 1,
      agentId: activation.targetAgentId,
    })),
  );
  const startupFailures = activations.flatMap((activation) =>
    activation.startupFailure === null
      ? []
      : [{
          key: `startup-failure-${activation.id}`,
          kind: "startup-failure" as const,
          occurredAt: activation.startupFailure.occurredAt,
          failure: activation.startupFailure,
          agentId: activation.targetAgentId,
        }],
  );
  const scheduledRetries = activations.flatMap((activation) =>
    activation.recovery?.state !== "scheduled"
      ? []
      : [{
          key: `scheduled-retry-${activation.id}`,
          kind: "scheduled-retry" as const,
          occurredAt: activation.recovery.dueAt,
          nextAttempt: activation.recovery.nextAttempt,
          agentId: activation.targetAgentId,
        }],
  );
  return [
    ...comments.map((comment) => ({
      key: `comment-${comment.id}`,
      kind: "comment" as const,
      occurredAt: comment.occurredAt,
      comment,
    })),
    ...activity.map((entry) => ({
      key: `event-${entry.id}`,
      kind: "event" as const,
      occurredAt: entry.occurredAt,
      activity: entry,
    })),
    ...attempts,
    ...startupFailures,
    ...scheduledRetries,
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function TimelineEntry({
  entry,
  onTranscript,
}: {
  entry: TimelineItem;
  onTranscript(value: { attemptId: string; agentId: string }): void;
}): ReactNode {
  if (entry.kind === "comment") {
    return (
      <li className="timeline-entry comment-entry">
        <div className="timeline-marker" aria-hidden="true">✎</div>
        <article>
          <div className="entry-meta">
            <strong>Authored comment</strong>
            <time>{formatDate(entry.occurredAt)}</time>
          </div>
          <p>{entry.comment.body}</p>
          <small>{entry.comment.actor.kind} · {entry.comment.actor.id}</small>
        </article>
      </li>
    );
  }
  if (entry.kind === "event") {
    return (
      <li className="timeline-entry event-entry">
        <div className="timeline-marker" aria-hidden="true">◆</div>
        <article>
          <div className="entry-meta">
            <strong>{activityLabel(entry.activity.type)}</strong>
            <time>{formatDate(entry.occurredAt)}</time>
          </div>
          <p>{activityDescription(entry.activity)}</p>
          <small>Immutable framework event · {entry.activity.actor.id}</small>
        </article>
      </li>
    );
  }
  if (entry.kind === "startup-failure") {
    return (
      <li className="timeline-entry attempt-entry">
        <div className="timeline-marker" aria-hidden="true">!</div>
        <article>
          <div className="entry-meta">
            <strong>Startup failed before attempt</strong>
            <time>{formatDate(entry.occurredAt)}</time>
          </div>
          <p>{entry.agentId} Â· Boundary: {entry.failure.boundary}</p>
          <p className="diagnostic">Diagnostic: {entry.failure.diagnostic}</p>
          <small>No Codex attempt or thread started. Explicit recovery is required.</small>
        </article>
      </li>
    );
  }
  if (entry.kind === "scheduled-retry") {
    return (
      <li className="timeline-entry attempt-entry">
        <div className="timeline-marker" aria-hidden="true">â†»</div>
        <article>
          <div className="entry-meta">
            <strong>Attempt {entry.nextAttempt} scheduled</strong>
            <time>{formatDate(entry.occurredAt)}</time>
          </div>
          <p>{entry.agentId} Â· waiting for automatic retry</p>
          <small>Recovery actions become available only if automatic attempts are exhausted.</small>
        </article>
      </li>
    );
  }
  const diagnostic =
    entry.attempt.outcome?.status === "failed" ||
      entry.attempt.outcome?.status === "permission-blocked"
      ? entry.attempt.outcome.summary
      : undefined;
  return (
    <li className="timeline-entry attempt-entry">
      <div className="timeline-marker" aria-hidden="true">▶</div>
      <article>
        <div className="entry-meta">
          <strong>Attempt {entry.number}</strong>
          <time>{formatDate(entry.occurredAt)}</time>
        </div>
        <p>
          {entry.agentId} · {entry.attempt.status} ·{" "}
          <ElapsedTime startedAt={entry.attempt.startedAt} completedAt={entry.attempt.completedAt} />
        </p>
        <p>
          Model: {entry.attempt.model ?? "Codex default"} · Reasoning: {entry.attempt.reasoningEffort ?? "Codex default"}
        </p>
        {entry.attempt.outcome === null ? null : (
          <p className="attempt-outcome">{entry.attempt.outcome.summary}</p>
        )}
        {diagnostic === undefined ? null : (
          <p className="diagnostic">Diagnostic: {diagnostic}</p>
        )}
        <div className="attempt-actions">
          <button className="secondary" onClick={() => onTranscript({ attemptId: entry.attempt.id, agentId: entry.agentId })}>
            View transcript
          </button>
          {entry.attempt.threadId === null ? null : (
            <CopyThreadIdButton threadId={entry.attempt.threadId} />
          )}
        </div>
      </article>
    </li>
  );
}

function TranscriptDialog({ attempt, agentId, onClose }: {
  attempt: AttemptView;
  agentId: string;
  onClose(): void;
}): ReactNode {
  const [items, setItems] = useState<AttemptTranscriptItem[]>();
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
            <p>{agentId} · {attempt.status} · <ElapsedTime startedAt={attempt.startedAt} completedAt={attempt.completedAt} /></p>
          </div>
          <div className="transcript-header-actions">
            {attempt.threadId === null ? null : (
              <CopyThreadIdButton threadId={attempt.threadId} />
            )}
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
            <p className="unavailable">
              Codex produced no inspectable transcript items for this attempt.
            </p>
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
                {item.kind === "message" ? (
                  <p>{item.text}</p>
                ) : item.kind === "diagnostic" ? (
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

function activityLabel(type: TaskActivityView["type"]): string {
  return {
    "task.created": "Task created",
    "task.edited": "Task edited",
    "task.moved": "Task moved",
    "relationship.created": "Relationship created",
    "relationship.satisfied": "Relationship satisfied",
    "attention.created": "Attention requested",
    "attention.resolved": "Attention resolved",
    "activation.created": "Activation queued",
    "attempt.started": "Attempt started",
    "attempt.completed": "Attempt completed",
    "automation.suspended": "Task automation suspended",
    "automation.resumed": "Task automation continued",
  }[type];
}

function activityDescription(activity: TaskActivityView): string {
  if (activity.type === "task.moved") {
    return `${activity.details.fromColumnId ?? "Previous column"} → ${activity.details.toColumnId ?? "Destination"}`;
  }
  if (activity.type === "activation.created") {
    return `Queued for ${activity.details.targetAgentId ?? "watching agent"}.`;
  }
  if (activity.type === "task.created") {
    return `Created in ${activity.details.columnId ?? "the selected column"}.`;
  }
  if (activity.type === "task.edited") return "Title or description updated.";
  if (activity.type === "attention.created") {
    return `User attention requested for ${activity.details.reasonType ?? "this task"}.`;
  }
  if (activity.type === "attention.resolved") {
    return `Resolved ${activity.details.reasonType ?? "attention"}.`;
  }
  if (activity.type === "automation.suspended") {
    return "The interrupted activation remains first in line until the user continues it.";
  }
  if (activity.type === "automation.resumed") {
    return "The user continued the interrupted activation.";
  }
  return `Attempt ${activity.details.attemptId ?? "activity"}.`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

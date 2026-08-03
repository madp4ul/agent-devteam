import { useEffect, useState, type ReactNode } from "react";

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
  const [transcriptAttempt, setTranscriptAttempt] = useState<AttemptView>();
  const timeline = buildTimeline(comments, activity, activations);
  return (
    <>
      <section className="timeline-section" aria-labelledby="timeline-heading">
        <p className="eyebrow">Complete history</p>
        <h2 id="timeline-heading">Task timeline</h2>
        <ol className="timeline">
          {timeline.map((entry) => (
            <TimelineEntry key={entry.key} entry={entry} onTranscript={setTranscriptAttempt} />
          ))}
        </ol>
      </section>
      {transcriptAttempt === undefined ? null : (
        <TranscriptDialog
          attempt={transcriptAttempt}
          onClose={() => setTranscriptAttempt(undefined)}
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
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

function TimelineEntry({
  entry,
  onTranscript,
}: {
  entry: TimelineItem;
  onTranscript(attempt: AttemptView): void;
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
  const diagnostic =
    entry.attempt.outcome?.status === "failed" ? entry.attempt.outcome.summary : undefined;
  return (
    <li className="timeline-entry attempt-entry">
      <div className="timeline-marker" aria-hidden="true">▶</div>
      <article>
        <div className="entry-meta">
          <strong>Attempt {entry.number}</strong>
          <time>{formatDate(entry.occurredAt)}</time>
        </div>
        <p>
          {entry.agentId} · {entry.attempt.status} · {duration(entry.attempt.startedAt, entry.attempt.completedAt)}
        </p>
        {entry.attempt.outcome === null ? null : (
          <p className="attempt-outcome">{entry.attempt.outcome.summary}</p>
        )}
        {diagnostic === undefined ? null : (
          <p className="diagnostic">Diagnostic: {diagnostic}</p>
        )}
        <details>
          <summary>Thread information</summary>
          <div className="thread-strip">
            <span>Thread ID: <code>{entry.attempt.threadId ?? "Unavailable"}</code></span>
            {entry.attempt.threadId === null ? null : (
              <CopyThreadIdButton threadId={entry.attempt.threadId} />
            )}
          </div>
          <button className="secondary" onClick={() => onTranscript(entry.attempt)}>
            View transcript
          </button>
        </details>
      </article>
    </li>
  );
}

function TranscriptDialog({ attempt, onClose }: { attempt: AttemptView; onClose(): void }): ReactNode {
  const [items, setItems] = useState<AttemptTranscriptItem[]>();
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    void readAttemptTranscript(attempt.id)
      .then((result) => {
        if (!active) return;
        if (result.available) setItems(result.items);
        else setUnavailable(true);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      });
    return () => {
      active = false;
    };
  }, [attempt.id]);

  return (
    <div className="modal-backdrop transcript-backdrop" role="presentation">
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
          </div>
          <button className="icon-button" aria-label="Close transcript" onClick={onClose}>×</button>
        </header>
        <div className="thread-strip">
          <code>{attempt.threadId ?? "Thread ID unavailable"}</code>
          {attempt.threadId === null ? null : (
            <CopyThreadIdButton threadId={attempt.threadId} />
          )}
        </div>
        <div className="transcript-content">
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
              <article key={index} className={`transcript-item ${item.kind}`}>
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
                    {item.output === undefined ? null : <pre>{item.output}</pre>}
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
    "activation.created": "Activation queued",
    "attempt.started": "Attempt started",
    "attempt.completed": "Attempt completed",
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
  return `Attempt ${activity.details.attemptId ?? "activity"}.`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function duration(startedAt: string, completedAt: string | null): string {
  if (completedAt === null) return "In progress";
  const seconds = Math.max(
    0,
    Math.round((Date.parse(completedAt) - Date.parse(startedAt)) / 1_000),
  );
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes === 0 ? `${remainder}s` : `${minutes}m ${remainder}s`;
}

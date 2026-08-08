import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";

import type { BoardColumnView } from "../../application/coordination-contract.ts";
import { addTaskComment, ApiError, editTask, readTask, type BrowserTaskDetail } from "./api.ts";
import { MarkUserMentionAddressed } from "./AttentionReasonAction.tsx";
import { errorMessage, mutationFeedback } from "./feedback.ts";
import { Loading } from "./Loading.tsx";
import type { NavigationState, Navigate } from "./navigation.ts";
import { useTaskMovement } from "./task-movement.ts";
import { TaskTimeline } from "./Timeline.tsx";

export function TaskPage({ taskId, navigate }: { taskId: string; navigate: Navigate }): ReactNode {
  const [detail, setDetail] = useState<BrowserTaskDetail>();
  const [editing, setEditing] = useState(false);
  const refresh = useCallback(async () => setDetail(await readTask(taskId)), [taskId]);
  const { feedback, setFeedback, pendingTaskId, move } = useTaskMovement(refresh);

  useEffect(() => {
    void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
  }, [refresh, setFeedback]);

  const back = (event: React.MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    const navigation = window.history.state as NavigationState | null;
    if (navigation?.returnToBoard === true) window.history.back();
    else navigate("/");
  };
  if (detail === undefined) {
    return feedback === undefined ? (
      <Loading />
    ) : (
      <main><p role="alert">{feedback.text}</p></main>
    );
  }
  const { task, board, inspection } = detail;
  const currentIndex = board.columns.findIndex((column) => column.id === task.columnId);
  const currentColumn = board.columns[currentIndex];
  const highlightedReasonId = new URLSearchParams(window.location.search).get("attention");

  const performMove = async (column: BoardColumnView): Promise<void> => {
    await move({ id: task.id, revision: task.revision }, column);
  };

  return (
    <div className="app-shell task-shell">
      <header className="detail-topbar">
        <a href="/" className="back-link" onClick={back}>← Back to board</a>
        <span className="revision">Revision {task.revision}</span>
      </header>
      <main className="task-detail">
        {feedback === undefined ? null : (
          <p className={`feedback ${feedback.role}`} role={feedback.role}>{feedback.text}</p>
        )}
        <section className="task-hero">
          <div className="task-heading">
            <p className="eyebrow">{task.id}</p>
            <h1>{task.title}</h1>
            <p className="description">{task.description}</p>
          </div>
          <button className="secondary" onClick={() => setEditing(true)}>Edit task</button>
        </section>

        <div className="detail-grid">
          <section className="detail-panel" aria-labelledby="state-heading">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">Current state</p>
                <h2 id="state-heading">{currentColumn?.name ?? task.columnId}</h2>
              </div>
              <span className={`run-pill ${inspection.run.status}`}>{inspection.run.status}</span>
            </div>
            <dl className="facts">
              <div><dt>Active agent</dt><dd>{inspection.run.activeAgentId ?? "None"}</dd></div>
              <div><dt>Queued activations</dt><dd>{inspection.run.queuedActivationCount}</dd></div>
              <div><dt>Failed activations</dt><dd>{inspection.run.failedActivationCount}</dd></div>
            </dl>
            {inspection.unresolvedAttention.length === 0 ? (
              <p className="quiet">No unresolved attention.</p>
            ) : (
              <ul className="attention-list">
                {inspection.unresolvedAttention.map((attention) => (
                  <li
                    key={attention.id}
                    className={highlightedReasonId === attention.id ? "highlighted" : ""}
                  >
                    <span>Needs attention: {attention.type.replaceAll("-", " ")}</span>
                    {attention.type === "user-mention" ? (
                      <MarkUserMentionAddressed
                        attentionReasonId={attention.id}
                        onResolved={refresh}
                        onError={(error) =>
                          setFeedback({ role: "alert", text: errorMessage(error) })}
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="detail-panel" aria-labelledby="relationships-heading">
            <p className="eyebrow">Coordination</p>
            <h2 id="relationships-heading">Relationships</h2>
            {task.relationships.length === 0 ? (
              <p className="quiet">No task relationships.</p>
            ) : (
              <ul className="relationship-list">
                {task.relationships.map((relationship) => (
                  <li key={relationship.id}>
                    {relationship.type === "dependency" && relationship.sourceTaskId === task.id
                      ? `${inspection.blocking.blockerTaskIds.includes(relationship.targetTaskId) ? "Blocked by" : "Depends on"} ${relationship.targetTaskId}`
                      : relationship.type === "parent-child"
                        ? `Parent / child: ${relationship.sourceTaskId} → ${relationship.targetTaskId}`
                        : `Dependency: ${relationship.sourceTaskId} → ${relationship.targetTaskId}`}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="move-panel" aria-labelledby="move-heading" aria-busy={pendingTaskId !== undefined}>
          <div>
            <p className="eyebrow">Contextual movement</p>
            <h2 id="move-heading">Move task</h2>
            <p>Choose any defined destination. Dragging on the board uses this same revision-checked command.</p>
          </div>
          <ol className="move-chooser" aria-label="Move task to column">
            {board.columns.map((column, index) => {
              const marker = index === currentIndex
                ? "Current"
                : index === currentIndex - 1
                  ? "Previous"
                  : index === currentIndex + 1
                    ? "Next"
                    : "Destination";
              return (
                <li key={column.id}>
                  <button
                    disabled={pendingTaskId !== undefined || index === currentIndex}
                    onClick={() => void performMove(column)}
                    aria-label={`${column.name} · ${marker}`}
                  >
                    <span>{column.name}</span><small>{marker}</small>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>

        <CommentForm
          taskId={task.id}
          onCommented={async () => {
            await refresh();
            setFeedback({ role: "status", text: `Commented on ${task.id}.` });
          }}
        />

        <TaskTimeline
          comments={task.comments}
          activity={task.activity}
          activations={task.activations}
        />
      </main>
      {editing ? (
        <EditDialog
          detail={detail}
          onClose={() => setEditing(false)}
          onSaved={async () => {
            setEditing(false);
            await refresh();
            setFeedback({ role: "status", text: `Updated ${task.id}.` });
          }}
          onConflict={async (error) => {
            setEditing(false);
            await refresh();
            setFeedback(mutationFeedback(error));
          }}
        />
      ) : null}
    </div>
  );
}

function CommentForm({
  taskId,
  onCommented,
}: {
  taskId: string;
  onCommented(): Promise<void>;
}): ReactNode {
  const [body, setBody] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await addTaskComment(taskId, body, idempotencyKey);
      setBody("");
      setIdempotencyKey(crypto.randomUUID());
      setPending(false);
      await onCommented();
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };
  return (
    <section className="detail-panel comment-panel" aria-labelledby="comment-heading">
      <p className="eyebrow">Authored communication</p>
      <h2 id="comment-heading">Add comment</h2>
      <p>Mention a collaborator by stable ID, such as <code>@implementer</code>, or use <code>@user</code> for user attention.</p>
      <form onSubmit={(event) => void submit(event)}>
        <label>
          Comment
          <textarea rows={5} value={body} onChange={(event) => setBody(event.currentTarget.value)} />
        </label>
        {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
        <button disabled={pending || body.trim().length === 0} type="submit">
          {pending ? "Commenting…" : "Add comment"}
        </button>
      </form>
    </section>
  );
}

function EditDialog({
  detail,
  onClose,
  onSaved,
  onConflict,
}: {
  detail: BrowserTaskDetail;
  onClose(): void;
  onSaved(): Promise<void>;
  onConflict(error: unknown): Promise<void>;
}): ReactNode {
  const [title, setTitle] = useState(detail.task.title);
  const [description, setDescription] = useState(detail.task.description);
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await editTask(detail.task.id, {
        title,
        description,
        expectedRevision: detail.task.revision,
        idempotencyKey,
      });
      await onSaved();
    } catch (caught) {
      if (
        caught instanceof ApiError &&
        (caught.body as { reason?: string }).reason === "revision-conflict"
      ) {
        await onConflict(caught);
        return;
      }
      setError(errorMessage(caught));
      setPending(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
        <div className="modal-heading">
          <h2 id="edit-title">Edit {detail.task.id}</h2>
          <button className="icon-button" aria-label="Close task editing" onClick={onClose}>×</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Task title
            <input
              aria-label="Task title"
              autoFocus
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          <label>
            Task description
            <textarea
              rows={9}
              value={description}
              onChange={(event) => setDescription(event.currentTarget.value)}
            />
          </label>
          {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button disabled={pending} type="submit">{pending ? "Saving…" : "Save task"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

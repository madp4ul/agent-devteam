import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  addTaskComment,
  ApiError,
  archiveTask,
  editTask,
  readTask,
  type BrowserTaskDetail,
  unarchiveTask,
} from "./api.ts";
import { AgentActivityPanel } from "./AgentActivityPanel.tsx";
import { AutomationControls } from "./AutomationControls.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { errorMessage, mutationFeedback } from "./feedback.ts";
import { Loading } from "./Loading.tsx";
import type { NavigationState, Navigate } from "./navigation.ts";
import { useTaskMovement } from "./task-movement.ts";
import { TaskTimeline } from "./Timeline.tsx";
import { TaskWorkspacePanel } from "./TaskWorkspacePanel.tsx";
import { MoveTaskPanel } from "./MoveTaskPanel.tsx";
import { TaskRelationshipsPanel } from "./TaskRelationshipsPanel.tsx";
import {
  captureTimelineViewportAnchor,
  restoreTimelineViewportAnchor,
  type TimelineViewportAnchor,
} from "./timeline-scroll-anchor.ts";

export function TaskPage({
  taskId,
  navigate,
  notifications,
}: {
  taskId: string;
  navigate: Navigate;
  notifications: DesktopNotificationControl;
}): ReactNode {
  const [detail, setDetail] = useState<BrowserTaskDetail>();
  const [editing, setEditing] = useState(false);
  const [archivalPending, setArchivalPending] = useState(false);
  const [discardConfirmation, setDiscardConfirmation] = useState(false);
  const refreshSequence = useRef(0);
  const pendingTimelineAnchor = useRef<TimelineViewportAnchor | null>(null);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const next = await readTask(taskId);
    if (sequence === refreshSequence.current) {
      pendingTimelineAnchor.current = captureTimelineViewportAnchor();
      setDetail(next);
    }
  }, [taskId]);
  const { feedback, setFeedback, pendingTaskId, move } = useTaskMovement(refresh);

  useEffect(() => {
    void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
  }, [refresh, setFeedback]);
  useLayoutEffect(() => {
    restoreTimelineViewportAnchor(pendingTimelineAnchor.current);
    pendingTimelineAnchor.current = null;
  }, [detail]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
    }, 1_000);
    return () => window.clearInterval(timer);
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
  const currentColumnMovement = task.activity
    .filter((entry) => entry.type === "task.moved" && entry.details.toColumnId === task.columnId)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  const highlightedReasonId = new URLSearchParams(window.location.search).get("attention");

  const performArchive = (discardWorkspaceChanges = false): void => {
    setArchivalPending(true);
    void archiveTask(task.id, crypto.randomUUID(), discardWorkspaceChanges)
      .then(async () => {
        await refresh();
        setFeedback({ role: "status", text: `Archived ${task.id}.` });
      })
      .catch((error) => {
        if (
          !discardWorkspaceChanges &&
          error instanceof ApiError &&
          (error.body as { reason?: string }).reason === "workspace-dirty"
        ) {
          setDiscardConfirmation(true);
          return;
        }
        setFeedback({ role: "alert", text: errorMessage(error) });
      })
      .finally(() => setArchivalPending(false));
  };

  return (
    <div className="app-shell task-shell">
      <header className="topbar detail-topbar">
        <a href="/" className="back-link" onClick={back}>← Back to board</a>
        <AutomationControls
          automation={detail.automation}
          activeRuns={detail.activeRuns}
          notifications={notifications}
          onChanged={refresh}
          onFeedback={setFeedback}
          onOpenTask={(activeTaskId) => navigate(`/tasks/${encodeURIComponent(activeTaskId)}`)}
        />
      </header>
      <main className="task-detail">
        <section className="task-overview" data-task-section="overview">
          {feedback === undefined ? null : (
            <p className={`feedback ${feedback.role}`} role={feedback.role}>{feedback.text}</p>
          )}
          <div className="task-hero">
            <div className="task-heading">
              <p className="eyebrow">{task.id}{task.archived ? " · Archived" : ""}</p>
              <h1>{task.title}</h1>
            </div>
          </div>
        </section>

        <div className="detail-grid">
          <div className="detail-primary-column">
            <section
              className="detail-panel task-description"
              data-task-section="description"
              aria-labelledby="description-heading"
            >
              <div className="detail-panel-heading">
                <h2 id="description-heading">Description</h2>
                <div className="task-actions">
                  {task.archived ? (
                    <button
                      disabled={archivalPending}
                      onClick={() => {
                        setArchivalPending(true);
                        void unarchiveTask(task.id, crypto.randomUUID())
                          .then(async () => {
                            await refresh();
                            setFeedback({ role: "status", text: `Unarchived ${task.id}. A later activation will create a new workspace from the process starting ref.` });
                          })
                          .catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }))
                          .finally(() => setArchivalPending(false));
                      }}
                    >{archivalPending ? "Unarchiving…" : "Unarchive task"}</button>
                  ) : (
                    <>
                      <button className="secondary" onClick={() => setEditing(true)}>Edit task</button>
                      {task.columnId === "completion" ? (
                        <button disabled={archivalPending} onClick={() => performArchive()}>
                          {archivalPending ? "Archiving…" : "Archive task"}
                        </button>
                      ) : (
                        <details className="more-actions">
                          <summary>More actions</summary>
                          <button className="secondary" disabled={archivalPending} onClick={() => performArchive()}>
                            {archivalPending ? "Archiving…" : "Archive task"}
                          </button>
                        </details>
                      )}
                    </>
                  )}
                </div>
              </div>
              <p className="description">{task.description}</p>
            </section>

            <div data-task-section="activity">
              <AgentActivityPanel
                state={{
                  taskId: task.id,
                  automation: detail.automation,
                  collaborators: detail.collaborators,
                  inspection,
                  activeRun: detail.activeRun,
                  activations: task.activations,
                  highlightedReasonId,
                }}
                onChanged={refresh}
                onFeedback={setFeedback}
              />
            </div>

            {task.archived ? null : <div data-task-section="comment"><CommentForm
              taskId={task.id}
              onCommented={async () => {
                await refresh();
                setFeedback({ role: "status", text: `Commented on ${task.id}.` });
              }}
            /></div>}

            <div data-task-section="timeline"><TaskTimeline
              comments={task.comments}
              activity={task.activity}
              activations={task.activations}
              agents={detail.collaborators}
              columns={board.columns}
              transcriptsAvailable={!task.archived}
            /></div>
          </div>

          <div className="detail-column">
            <div data-task-section="workspace">
              <TaskWorkspacePanel
                taskId={task.id}
                workspace={inspection.workspace}
                attemptRunning={detail.activeRun !== null}
              />
            </div>
            {task.archived ? null : (
              <div data-task-section="move">
                <MoveTaskPanel
                  columns={board.columns}
                  currentColumnId={task.columnId}
                  currentColumnName={board.columns.find((column) => column.id === task.columnId)?.name ?? task.columnId}
                  {...(currentColumnMovement === undefined ? {} : { currentColumnSourceId: currentColumnMovement.id })}
                  pending={pendingTaskId !== undefined}
                  onMove={async (column) => move({ id: task.id, revision: task.revision }, column)}
                />
              </div>
            )}
            <div data-task-section="relationships">
            <TaskRelationshipsPanel
              detail={detail}
              navigate={navigate}
              onChanged={refresh}
              onFeedback={setFeedback}
            />
            </div>
          </div>
        </div>
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
      {discardConfirmation ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="modal discard-confirmation"
            role="dialog"
            aria-modal="true"
            aria-labelledby="discard-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Destructive archive</p>
                <h2 id="discard-title">Discard workspace changes?</h2>
              </div>
            </div>
            <p>
              This task workspace is dirty. Continuing will permanently delete uncommitted
              and untracked changes along with the workspace and retained transcripts.
            </p>
            <p>Open the task workspace first if you need to inspect or preserve those files.</p>
            <div className="form-actions">
              <button
                autoFocus
                className="secondary"
                onClick={() => setDiscardConfirmation(false)}
              >
                Keep workspace
              </button>
              <button
                className="destructive"
                disabled={archivalPending}
                onClick={() => {
                  setDiscardConfirmation(false);
                  performArchive(true);
                }}
              >
                {archivalPending ? "Archiving…" : "Discard changes and archive"}
              </button>
            </div>
          </section>
        </div>
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
      <h2 id="comment-heading">Add comment</h2>
      <form onSubmit={(event) => void submit(event)}>
        <textarea aria-label="Comment" rows={2} value={body} onChange={(event) => setBody(event.currentTarget.value)} />
        {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
        <button disabled={pending || body.trim().length === 0} type="submit">
          {pending ? "Posting…" : "Post"}
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

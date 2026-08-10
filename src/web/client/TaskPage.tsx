import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import type { BoardColumnView } from "../../application/coordination-contract.ts";
import {
  addTaskComment,
  addTaskDependency,
  ApiError,
  archiveTask,
  editTask,
  interruptTask,
  continueInterruptedTask,
  readTask,
  type BrowserTaskDetail,
  unarchiveTask,
} from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { AttentionReasonResolution } from "./AttentionReasonAction.tsx";
import { errorMessage, mutationFeedback } from "./feedback.ts";
import { Loading } from "./Loading.tsx";
import type { NavigationState, Navigate } from "./navigation.ts";
import { useTaskMovement } from "./task-movement.ts";
import { TaskTimeline } from "./Timeline.tsx";
import { TaskCreationDialog } from "./TaskCreationDialog.tsx";
import { TaskWorkspacePanel } from "./TaskWorkspacePanel.tsx";

export function TaskPage({ taskId, navigate }: { taskId: string; navigate: Navigate }): ReactNode {
  const [detail, setDetail] = useState<BrowserTaskDetail>();
  const [editing, setEditing] = useState(false);
  const [archivalPending, setArchivalPending] = useState(false);
  const [discardConfirmation, setDiscardConfirmation] = useState(false);
  const refreshSequence = useRef(0);
  const refresh = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    const next = await readTask(taskId);
    if (sequence === refreshSequence.current) setDetail(next);
  }, [taskId]);
  const { feedback, setFeedback, pendingTaskId, move } = useTaskMovement(refresh);

  useEffect(() => {
    void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
  }, [refresh, setFeedback]);
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
  const currentIndex = board.columns.findIndex((column) => column.id === task.columnId);
  const currentColumn = board.columns[currentIndex];
  const highlightedReasonId = new URLSearchParams(window.location.search).get("attention");

  const performMove = async (column: BoardColumnView): Promise<void> => {
    await move({ id: task.id, revision: task.revision }, column);
  };
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
      <header className="detail-topbar">
        <a href="/" className="back-link" onClick={back}>← Back to board</a>
        <span className="revision">{task.archived ? "Archived · " : ""}Revision {task.revision}</span>
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
          <div className="form-actions">
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
              {inspection.currentActivation === null ? null : (
                <>
                  <div>
                    <dt>Current activation</dt>
                    <dd>{inspection.currentActivation.targetAgentId}</dd>
                  </div>
                  <div>
                    <dt>Requested model</dt>
                    <dd>{inspection.currentActivation.model ?? "Codex default"}</dd>
                  </div>
                  <div>
                    <dt>Requested reasoning</dt>
                    <dd>{inspection.currentActivation.reasoningEffort ?? "Codex default"}</dd>
                  </div>
                </>
              )}
            </dl>
            {detail.activeRun === null ? null : (
              <div className="attempt-control">
                <p>
                  Current attempt · {detail.activeRun.agentId} · {detail.activeRun.status} ·{" "}
                  <ElapsedTime startedAt={detail.activeRun.startedAt} />
                </p>
                <button
                  disabled={detail.activeRun.status === "interrupting"}
                  onClick={() => {
                    setFeedback({ role: "status", text: `Interrupting ${task.id}…` });
                    void interruptTask(task.id, crypto.randomUUID())
                      .then(async () => {
                        await refresh();
                        setFeedback({ role: "status", text: `Interrupted ${task.id}. Automation is suspended.` });
                      })
                      .catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
                  }}
                >
                  {detail.activeRun.status === "interrupting" ? "Interrupting…" : "Interrupt current attempt"}
                </button>
              </div>
            )}
            {inspection.automationSuspended ? (
              <ContinueAutomationControl
                taskId={task.id}
                onContinued={async () => {
                  await refresh();
                  setFeedback({ role: "status", text: `Continued ${task.id}.` });
                }}
                onError={(error) => setFeedback({ role: "alert", text: errorMessage(error) })}
              />
            ) : null}
            {inspection.unresolvedAttention.length === 0 ? (
              <p className="quiet">No unresolved attention.</p>
            ) : (
              <ul className="attention-list">
                {inspection.unresolvedAttention.map((attention) => (
                  <li
                    key={attention.id}
                    className={highlightedReasonId === attention.id ? "highlighted" : ""}
                  >
                    <AttentionReasonResolution
                      reason={attention}
                      labelPrefix="Needs attention: "
                      onResolved={refresh}
                      onError={(error) =>
                        setFeedback({ role: "alert", text: errorMessage(error) })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="detail-column">
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
            {task.archived ? null : <RelationshipForms
              detail={detail}
              onChanged={async (message) => {
                await refresh();
                setFeedback({ role: "status", text: message });
              }}
            />}
            </section>
            <TaskWorkspacePanel
              taskId={task.id}
              workspace={inspection.workspace}
              attemptRunning={detail.activeRun !== null}
            />
          </div>
        </div>

        {task.archived ? null : <section className="move-panel" aria-labelledby="move-heading" aria-busy={pendingTaskId !== undefined}>
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
        </section>}

        {task.archived ? null : <CommentForm
          taskId={task.id}
          onCommented={async () => {
            await refresh();
            setFeedback({ role: "status", text: `Commented on ${task.id}.` });
          }}
        />}

        <TaskTimeline
          comments={task.comments}
          activity={task.activity}
          activations={task.activations}
          transcriptsAvailable={!task.archived}
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

function ContinueAutomationControl({
  taskId,
  onContinued,
  onError,
}: {
  taskId: string;
  onContinued(): Promise<void>;
  onError(error: unknown): void;
}): ReactNode {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="attempt-control">
      <p>Task automation is suspended. The interrupted activation remains first in line.</p>
      <label>
        Continuation message (optional)
        <textarea rows={3} value={message} onChange={(event) => setMessage(event.currentTarget.value)} />
      </label>
      <button
        disabled={pending}
        onClick={() => {
          setPending(true);
          void continueInterruptedTask(taskId, message, crypto.randomUUID())
            .then(onContinued)
            .catch(onError)
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Continuing…" : "Continue interrupted activation"}
      </button>
    </div>
  );
}

function RelationshipForms({
  detail,
  onChanged,
}: {
  detail: BrowserTaskDetail;
  onChanged(message: string): Promise<void>;
}): ReactNode {
  const [targetTaskId, setTargetTaskId] = useState("");
  const [creatingChild, setCreatingChild] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);

  const addDependency = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      await addTaskDependency(detail.task.id, targetTaskId.trim(), crypto.randomUUID());
      setTargetTaskId("");
      await onChanged(`Added dependency for ${detail.task.id}.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <details className="relationship-actions">
        <summary>Manage relationships</summary>
        <div className="relationship-action-content">
          <form onSubmit={(event) => void addDependency(event)}>
            <h3>Add dependency</h3>
            <label>Blocking task ID<input value={targetTaskId} onChange={(event) => setTargetTaskId(event.currentTarget.value)} /></label>
            <button disabled={pending || targetTaskId.trim().length === 0}>Add dependency</button>
          </form>
          <button type="button" className="secondary" onClick={() => setCreatingChild(true)}>
            Create child task
          </button>
          {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
        </div>
      </details>
      {creatingChild ? (
        <TaskCreationDialog
          initial={{
            boardId: detail.task.boardId,
            columnId: detail.board.columns.find((column) => column.taskCreationAllowed)?.id ?? "",
          }}
          columns={detail.board.columns}
          parent={{ id: detail.task.id, title: detail.task.title }}
          onClose={() => setCreatingChild(false)}
          onCreated={async (task) => {
            setCreatingChild(false);
            await onChanged(`Created child ${task.id}.`);
          }}
        />
      ) : null}
    </>
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

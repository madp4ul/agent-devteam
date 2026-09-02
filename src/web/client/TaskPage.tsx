import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import {
  ApiError,
  archiveTask,
  editTask,
  readTask,
  type BrowserTaskDetail,
  unarchiveTask,
} from "./api.ts";
import { AgentActivityPanel } from "./AgentActivityPanel.tsx";
import { AgentInspectableMarker } from "./AgentInspectableMarker.tsx";
import { AutomationControls } from "./AutomationControls.tsx";
import { CloseIconButton } from "./CloseIconButton.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { errorMessage, mutationFeedback } from "./feedback.ts";
import { Loading } from "./Loading.tsx";
import { CopyMarkdownButton } from "./CopyMarkdownButton.tsx";
import { MarkdownContent } from "./MarkdownContent.tsx";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { Modal } from "./Modal.tsx";
import type { NavigationState, Navigate } from "./navigation.ts";
import { useTaskMovement } from "./task-movement.ts";
import { TaskTimeline } from "./Timeline.tsx";
import { TaskWorkspacePanel } from "./TaskWorkspacePanel.tsx";
import { MoveTaskPanel } from "./MoveTaskPanel.tsx";
import { TaskRelationshipsPanel } from "./TaskRelationshipsPanel.tsx";
import { TaskAttentionPanel } from "./TaskAttentionPanel.tsx";
import { acknowledgeUserMention } from "./AttentionReasonAction.tsx";
import { TaskConversationsPanel } from "./TaskConversationsPanel.tsx";
import {
  TaskCommentComposition,
  type TaskCommentReplyIntent,
} from "./TaskCommentComposition.tsx";
import {
  captureTimelineViewportAnchor,
  restoreTimelineViewportAnchor,
  type TimelineViewportAnchor,
} from "./timeline-scroll-anchor.ts";
import {
  captureTextSelectionWithin,
  restoreCapturedTextSelection,
  type CapturedTextSelection,
} from "./text-selection.ts";

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
  const [timelineSourceRequest, setTimelineSourceRequest] = useState<{ sourceId: string; sequence: number }>();
  const [commentReplyIntent, setCommentReplyIntent] = useState<TaskCommentReplyIntent>();
  const pendingTimelineAnchor = useRef<TimelineViewportAnchor | null>(null);
  const taskDetailRef = useRef<HTMLElement>(null);
  const pendingTextSelection = useRef<CapturedTextSelection | null>(null);
  const refresh = useLatestRefresh(
    () => readTask(taskId),
    (next) => {
      pendingTimelineAnchor.current = captureTimelineViewportAnchor();
      pendingTextSelection.current = captureTextSelectionWithin(
        taskDetailRef.current,
        document.querySelector(".transcript-content"),
      );
      setDetail(next);
    },
  );
  const { feedback, setFeedback, pendingTaskId, move } = useTaskMovement(refresh);

  useEffect(() => {
    void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
  }, [refresh, setFeedback, taskId]);
  useLayoutEffect(() => {
    restoreTimelineViewportAnchor(pendingTimelineAnchor.current);
    pendingTimelineAnchor.current = null;
    restoreCapturedTextSelection(pendingTextSelection.current);
    pendingTextSelection.current = null;
  }, [detail]);
  usePolling(
    refresh,
    1_000,
    (error) => setFeedback({ role: "alert", text: errorMessage(error) }),
  );

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
  const inspectableTaskFields = new Set(detail.agentInspectableContent.taskFields);
  const currentColumnMovement = task.activity
    .filter((entry) => entry.type === "task.moved" && entry.details.toColumnId === task.columnId)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  const highlightedReasonId = new URLSearchParams(window.location.search).get("attention");
  const interruptedActivation = task.activations.find((activation) =>
    activation.id === inspection.currentActivation?.id || (
      activation.status === "queued" &&
      activation.attempts.at(-1)?.outcome?.status === "user-interrupted"
    ));
  const interruptedActivationId = inspection.currentActivation?.state === "interrupted"
    ? inspection.currentActivation.id
    : interruptedActivation?.id;
  const interruptedAgentId = inspection.currentActivation?.state === "interrupted"
    ? inspection.currentActivation.targetAgentId
    : interruptedActivation?.targetAgentId;
  const mostRecentTaskAgentId = findMostRecentlyRunAgentId(task.activations);
  const interruption = interruptedActivationId === undefined || interruptedAgentId === undefined
    ? undefined
    : {
        taskId: task.id,
        activationId: interruptedActivationId,
        agentName: detail.collaborators.find((agent) => agent.id === interruptedAgentId)?.name ?? interruptedAgentId,
        canDismiss: interruptedActivation?.dismissal !== null,
        ...(interruptedActivation?.dismissal?.mayStartNext === undefined
          ? {}
          : { mayStartNext: interruptedActivation.dismissal.mayStartNext }),
        reasonDescription: interruptionReasonDescription(interruptedActivation?.reason.type),
      };
  const replyToAttentionRequest = async (agentId: string, attentionReasonId?: string): Promise<void> => {
    if (attentionReasonId !== undefined) {
      const resolved = await acknowledgeUserMention(
        attentionReasonId,
        crypto.randomUUID(),
        refresh,
        (error) => setFeedback({ role: "alert", text: errorMessage(error) }),
      );
      if (!resolved) return;
    }
    setCommentReplyIntent((current) => ({
      taskId: task.id,
      agentId,
      sequence: (current?.sequence ?? 0) + 1,
    }));
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
      <header className="topbar detail-topbar">
        <a href="/" className="back-link" onClick={back}>← Back to board</a>
        <AutomationControls
          automation={detail.automation}
          activeRuns={detail.activeRuns}
          notifications={notifications}
          canResume={detail.startup.mode !== "paused" ||
            (detail.startup.processImpact?.staleActivations.length ?? 0) === 0}
          onChanged={refresh}
          onFeedback={setFeedback}
        />
      </header>
      <main ref={taskDetailRef} className="task-detail">
        <section className="task-overview" data-task-section="overview">
          {feedback === undefined ? null : (
            <p className={`feedback ${feedback.role}`} role={feedback.role}>{feedback.text}</p>
          )}
          <div className="task-hero">
            <div className="task-heading">
              <div className="agent-inspectable-heading">
                <div>
                  <p className="eyebrow">{task.id}{task.archived ? " · Archived" : ""}</p>
                  <h1>{task.title}</h1>
                </div>
                {inspectableTaskFields.has("title") ? <AgentInspectableMarker /> : null}
              </div>
            </div>
          </div>
        </section>

        <div className="detail-grid">
          <div className="detail-primary-column">
            {inspection.unresolvedAttention.length === 0 ? null : (
              <div data-task-section="attention">
                <TaskAttentionPanel
                  reasons={inspection.unresolvedAttention}
                  highlightedReasonId={highlightedReasonId}
                  interruption={interruption}
                  onChanged={refresh}
                  onFeedback={setFeedback}
                />
              </div>
            )}

            <section
              className="detail-panel task-description"
              data-task-section="description"
              aria-labelledby="description-heading"
            >
              <div className="detail-panel-heading">
                <div className="detail-heading-title">
                  <h2 id="description-heading">Description</h2>
                  <CopyMarkdownButton source={task.description} label="Copy description Markdown" />
                </div>
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
                  {inspectableTaskFields.has("description") ? <AgentInspectableMarker /> : null}
                </div>
              </div>
              <MarkdownContent source={task.description} className="description" />
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
                }}
                onChanged={refresh}
                onFeedback={setFeedback}
              />
            </div>

            <TaskCommentComposition
              key={task.id}
              taskId={task.id}
              collaborators={detail.collaborators}
              mostRecentTaskAgentId={mostRecentTaskAgentId}
              replyIntent={commentReplyIntent}
              composerAvailable={!task.archived}
              onCommentAccepted={async () => {
                await refresh();
                setFeedback({ role: "status", text: `Commented on ${task.id}.` });
              }}
            >
              <TaskTimeline
                taskId={task.id}
                comments={task.comments}
                activity={task.activity}
                activations={task.activations}
                agents={detail.collaborators}
                columns={board.columns}
                tasks={detail.timelineRelationshipTasks}
                unresolvedAttention={inspection.unresolvedAttention}
                transcriptsAvailable={!task.archived}
                onAttentionChanged={refresh}
                onAttentionError={(error) => setFeedback({ role: "alert", text: errorMessage(error) })}
                agentInspectableContent={detail.agentInspectableContent}
                {...(timelineSourceRequest === undefined ? {} : { sourceRequest: timelineSourceRequest })}
                {...(task.archived ? {} : { onReplyToAgent: replyToAttentionRequest })}
              />
            </TaskCommentComposition>
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
                  inspectable={inspectableTaskFields.has("column")}
                />
              </div>
            )}
            <div data-task-section="relationships">
            <TaskRelationshipsPanel
              detail={detail}
              onChanged={refresh}
              onFeedback={setFeedback}
            />
            </div>
            {detail.conversations.length === 0 ? null : (
              <div data-task-section="conversations">
                <TaskConversationsPanel
                  taskId={task.id}
                  conversations={detail.conversations}
                  conversationCost={detail.conversationCost}
                  agentInspectableContent={detail.agentInspectableContent}
                  onCommentSource={(sourceId) => setTimelineSourceRequest((current) => ({
                    sourceId,
                    sequence: (current?.sequence ?? 0) + 1,
                  }))}
                />
              </div>
            )}
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
        <Modal
          labelledBy="discard-title"
          className="discard-confirmation"
          onClose={() => setDiscardConfirmation(false)}
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
        </Modal>
      ) : null}
    </div>
  );
}

function findMostRecentlyRunAgentId(
  activations: BrowserTaskDetail["task"]["activations"],
): string | undefined {
  let mostRecent: { agentId: string; startedAt: string } | undefined;
  for (const activation of activations) {
    for (const attempt of activation.attempts) {
      if (mostRecent === undefined || attempt.startedAt > mostRecent.startedAt) {
        mostRecent = { agentId: activation.targetAgentId, startedAt: attempt.startedAt };
      }
    }
  }
  return mostRecent?.agentId;
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
    <Modal labelledBy="edit-title" onClose={onClose}>
        <div className="modal-heading">
          <h2 id="edit-title">Edit {detail.task.id}</h2>
          <CloseIconButton label="Close task editing" onClick={onClose} />
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
    </Modal>
  );
}

function interruptionReasonDescription(reason: string | undefined): string {
  if (reason === "column-entry") return "column entry";
  if (reason === "blockers-cleared") return "blockers being cleared";
  if (reason === "user-follow-up") return "a user follow-up";
  return "a mention in a comment";
}

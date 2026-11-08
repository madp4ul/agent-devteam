import { useEffect, useRef, useState, type ReactNode } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

import type { TaskOverviewView } from "../../application/browser-transport-contract.ts";
import type { BrowserBoardState } from "./api.ts";
import { WorkspacePreparation } from "./WorkspacePreparation.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { taskCardSignals } from "./task-card-signals.ts";

export function TaskCard({
  task,
  pending,
  highlighted,
  activeRun,
  onOpen,
}: {
  task: TaskOverviewView;
  pending: boolean;
  highlighted: boolean;
  activeRun?: BrowserBoardState["activeRuns"][number] | undefined;
  onOpen(taskId: string): void;
}): ReactNode {
  const signals = taskCardSignals(task);
  const cardRef = useRef<HTMLLIElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const element = cardRef.current;
    const dragHandle = handleRef.current;
    if (task.archived || element === null || dragHandle === null) return;
    return draggable({
      element,
      dragHandle,
      getInitialData: () => ({ taskId: task.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [task.archived, task.id]);
  return (
    <li
      ref={cardRef}
      data-task-id={task.id}
      tabIndex={-1}
      className={`task-card${task.archived ? " archived" : ""}${pending ? " pending" : ""}${dragging ? " dragging" : ""}${highlighted ? " highlighted" : ""}`}
      aria-busy={pending}
    >
      <div className="card-topline">
        <span className="task-id">{task.id}</span>
        {task.archived ? null : (
          <button
            ref={handleRef}
            className="drag-handle"
            aria-label={`Drag ${task.id}`}
            title="Drag task"
          >
            ⠿
          </button>
        )}
      </div>
      <a
        aria-label={`${task.id} ${task.title}`}
        href={`/tasks/${encodeURIComponent(task.id)}`}
        onClick={(event) => {
          event.preventDefault();
          onOpen(task.id);
        }}
      >
        <span className="card-title">{task.title}</span>
      </a>
      {task.workspacePreparation === undefined ? null : <WorkspacePreparation preparation={task.workspacePreparation} />}
      <div className="card-signals">
        {signals.archived ? <span className="signal archived">Archived</span> : null}
        {signals.waiting ? (
          <span className="signal waiting">Waiting on · {task.waitingOn.taskIds.join(", ")}</span>
        ) : null}
        {signals.attention ? (
          <span className="signal attention">Needs attention · {task.unresolvedAttention.length}</span>
        ) : null}
        {signals.queued ? (
          <span className="signal queued">Queued · {task.run.queuedActivationCount}</span>
        ) : null}
        {signals.failed ? (
          <span className="signal failed">Failed · {task.run.failedActivationCount}</span>
        ) : null}
        {!signals.active ? null : (
          <span className="signal running">
            <span className="activity-spinner" aria-hidden="true" />
            {activeRun?.executionStarted === false || activeRun?.status === "starting" ? "Starting agent" : "Active"} · {task.run.activeAgentId}
            {activeRun === undefined || activeRun.status === "starting" || activeRun.executionStarted === false ? null : <> · <ElapsedTime startedAt={activeRun.startedAt} /></>}
          </span>
        )}
      </div>
      {signals.startupFailure === undefined ? null : (
        <div className="startup-diagnostic">
          <strong>Startup failed before attempt · {signals.startupFailure.boundary}</strong>
          <p>{signals.startupFailure.diagnostic}</p>
        </div>
      )}
    </li>
  );
}

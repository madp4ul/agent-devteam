import { useEffect, useRef, useState, type ReactNode } from "react";
import { draggable } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

import type { TaskOverviewView } from "../../application/coordination-contract.ts";
import type { BrowserBoardState } from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";

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
      <div className="card-signals">
        {task.archived ? <span className="signal archived">Archived</span> : null}
        {task.blocking.blocked ? (
          <span className="signal blocked">Blocked · {task.blocking.blockerTaskIds.join(", ")}</span>
        ) : null}
        {task.unresolvedAttention.length > 0 ? (
          <span className="signal attention">Needs attention · {task.unresolvedAttention.length}</span>
        ) : null}
        {task.run.queuedActivationCount > 0 ? (
          <span className="signal queued">Queued · {task.run.queuedActivationCount}</span>
        ) : null}
        {task.run.failedActivationCount > 0 ? (
          <span className="signal failed">Failed · {task.run.failedActivationCount}</span>
        ) : null}
        {task.run.activeAgentId === null ? null : (
          <span className="signal running">
            Active · {task.run.activeAgentId}
            {activeRun === undefined ? null : <> · <ElapsedTime startedAt={activeRun.startedAt} /></>}
          </span>
        )}
      </div>
      {task.startupFailure === undefined ? null : (
        <div className="startup-diagnostic">
          <strong>Startup failed before attempt · {task.startupFailure.boundary}</strong>
          <p>{task.startupFailure.diagnostic}</p>
        </div>
      )}
    </li>
  );
}

import { useEffect, useRef, useState, type ReactNode } from "react";
import { dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

import type { TaskOverviewView } from "../../application/coordination-contract.ts";
import type { BrowserBoardState, BrowserColumnView } from "./api.ts";
import { TaskCard } from "./TaskCard.tsx";

export type BoardLayout = "row" | "column";

export function BoardColumn({
  boardId,
  column,
  archivedTasks,
  layout,
  filter,
  pendingTaskId,
  highlightedTaskId,
  activeRuns,
  onTaskStrip,
  onTaskStripScroll,
  onOpen,
  onCreate,
  onArchiveCompleted,
}: {
  boardId: string;
  column: BrowserColumnView;
  archivedTasks: TaskOverviewView[];
  layout: BoardLayout;
  filter: string;
  pendingTaskId?: string | undefined;
  highlightedTaskId?: string | undefined;
  activeRuns: BrowserBoardState["activeRuns"];
  onTaskStrip(element: HTMLOListElement | null): void;
  onTaskStripScroll(position: number): void;
  onOpen(taskId: string): void;
  onCreate(): void;
  onArchiveCompleted(): void;
}): ReactNode {
  const elementRef = useRef<HTMLElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const element = elementRef.current;
    if (element === null) return;
    return dropTargetForElements({
      element,
      getData: () => ({ boardId, columnId: column.id }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false),
    });
  }, [boardId, column.id]);
  const needle = filter.trim().toLocaleLowerCase();
  const tasks = [...column.tasks, ...archivedTasks].filter(
    (task) =>
      needle.length === 0 ||
      `${task.id} ${task.title}`.toLocaleLowerCase().includes(needle),
  );
  const headingId = `column-${boardId}-${column.id}`;
  return (
    <section
      ref={elementRef}
      data-testid={`column-${column.id}`}
      className={`board-column${
        column.watchingAgent === null && !column.frameworkOwned ? " user-owned" : ""
      }${over ? " drop-target" : ""}`}
      aria-labelledby={headingId}
    >
      <header className="column-header">
        <div className="column-heading">
          <div>
            <h3 id={headingId}>{column.name}</h3>
            {column.frameworkOwned ? null : (
              <p>{column.watchingAgent?.name ?? "User"}</p>
            )}
          </div>
          <span className="task-count">{tasks.length}</span>
          {layout === "row" && column.taskCreationAllowed ? (
            <button
              className="row-create"
              aria-label={`Create task in ${column.name}`}
              title={`Create task in ${column.name}`}
              onClick={onCreate}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                <path d="M10 4v12M4 10h12" />
              </svg>
            </button>
          ) : null}
        </div>
        {column.id === "completion" && column.tasks.length > 0 ? (
          <button
            className="archive-completed"
            aria-label="Archive completed tasks"
            title="Archive completed tasks"
            onClick={onArchiveCompleted}
          >Archive</button>
        ) : null}
      </header>
      <ol
        ref={layout === "row" ? onTaskStrip : undefined}
        className="task-list"
        data-testid="task-strip"
        tabIndex={layout === "row" ? 0 : undefined}
        onScroll={layout === "row"
          ? (event) => onTaskStripScroll(event.currentTarget.scrollLeft)
          : undefined}
      >
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            pending={pendingTaskId === task.id}
            highlighted={highlightedTaskId === task.id}
            activeRun={activeRuns.find((run) => run.taskId === task.id)}
            onOpen={onOpen}
          />
        ))}
      </ol>
      {layout === "column" && column.taskCreationAllowed ? <button className="create-column" onClick={onCreate}>
        + Create task in {column.name}
      </button> : null}
    </section>
  );
}

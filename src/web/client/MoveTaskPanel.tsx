import type { ReactNode } from "react";

import type { BoardColumnView, CollaboratorView, TaskActivityView } from "../../application/browser-transport-contract.ts";
import { AgentInspectableMarker } from "./AgentInspectableMarker.tsx";
import { TaskMovementMap } from "./TaskMovementMap.tsx";
import { focusTimelineSource, timelineSourceElementId } from "./timeline-scroll-anchor.ts";

export function MoveTaskPanel({
  columns,
  currentColumnId,
  currentColumnName,
  currentColumnSourceId,
  movementCount,
  movements,
  agents,
  pending,
  onMove,
  inspectable,
}: {
  columns: BoardColumnView[];
  currentColumnId: string;
  currentColumnName: string;
  currentColumnSourceId?: string;
  movementCount: number;
  movements: Array<TaskActivityView & { type: "task.moved" }>;
  agents: Pick<CollaboratorView, "id" | "name">[];
  pending: boolean;
  onMove(column: BoardColumnView): Promise<void>;
  inspectable: boolean;
}): ReactNode {
  const currentColumnIndex = columns.findIndex((column) => column.id === currentColumnId);
  const nextColumn = currentColumnIndex < 0 ? undefined : columns[currentColumnIndex + 1];
  const currentColumnMapped = currentColumnIndex >= 0;

  return (
    <section className="detail-panel move-panel" aria-labelledby="move-heading" aria-busy={pending}>
      <div className="detail-panel-heading">
        <h2 id="move-heading">Task position</h2>
        <span className="movement-count-summary">
          {movementCount === 0 ? "Not moved yet" : movementCount === 1 ? "Moved once" : `Moved ${movementCount} times`}
        </span>
      </div>
      <div className="move-column-heading agent-inspectable-content-heading">
        <label htmlFor="move-task-destination">Column</label>
        {inspectable ? <AgentInspectableMarker /> : null}
      </div>
      <div className="move-destination-controls">
        <select
          id="move-task-destination"
          aria-label="Move task"
          disabled={pending}
          value={currentColumnId}
          onChange={(event) => {
            const destination = columns.find((column) => column.id === event.currentTarget.value);
            if (destination !== undefined && destination.id !== currentColumnId) void onMove(destination);
          }}
        >
          {currentColumnMapped ? null : (
            <option value={currentColumnId} disabled>Unmapped: {currentColumnName}</option>
          )}
          {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
        <button
          type="button"
          className="secondary move-next-column"
          disabled={pending || nextColumn === undefined}
          aria-label={nextColumn === undefined ? "No next column" : `Move to ${nextColumn.name}`}
          title={nextColumn === undefined ? "No next column" : `Move to ${nextColumn.name}`}
          onClick={() => {
            if (nextColumn !== undefined) void onMove(nextColumn);
          }}
        >
          Next
        </button>
      </div>
      {currentColumnSourceId === undefined ? null : (
        <a
          className="current-column-source"
          href={`#${timelineSourceElementId(currentColumnSourceId)}`}
          onClick={(event) => {
            event.preventDefault();
            focusTimelineSource(currentColumnSourceId);
          }}
        >View move to {currentColumnName} in timeline</a>
      )}
      <TaskMovementMap movements={movements} columns={columns} agents={agents} />
    </section>
  );
}

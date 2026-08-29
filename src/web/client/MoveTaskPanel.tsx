import type { ReactNode } from "react";

import type { BoardColumnView } from "../../application/browser-transport-contract.ts";
import { AgentInspectableMarker } from "./AgentInspectableMarker.tsx";
import { focusTimelineSource, timelineSourceElementId } from "./timeline-scroll-anchor.ts";

export function MoveTaskPanel({
  columns,
  currentColumnId,
  currentColumnName,
  currentColumnSourceId,
  pending,
  onMove,
  inspectable,
}: {
  columns: BoardColumnView[];
  currentColumnId: string;
  currentColumnName: string;
  currentColumnSourceId?: string;
  pending: boolean;
  onMove(column: BoardColumnView): Promise<void>;
  inspectable: boolean;
}): ReactNode {
  return (
    <section className="detail-panel move-panel" aria-labelledby="move-heading" aria-busy={pending}>
      <h2 id="move-heading">Move task</h2>
      <label className="move-select">
        <span className="agent-inspectable-content-heading">
          Column
          {inspectable ? <AgentInspectableMarker /> : null}
        </span>
        <select
          aria-label="Move task"
          disabled={pending}
          value={currentColumnId}
          onChange={(event) => {
            const destination = columns.find((column) => column.id === event.currentTarget.value);
            if (destination !== undefined && destination.id !== currentColumnId) void onMove(destination);
          }}
        >
          {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
        </select>
      </label>
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
    </section>
  );
}

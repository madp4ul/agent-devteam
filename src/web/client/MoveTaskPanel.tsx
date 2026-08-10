import type { ReactNode } from "react";

import type { BoardColumnView } from "../../application/coordination-contract.ts";

export function MoveTaskPanel({
  columns,
  currentColumnId,
  pending,
  onMove,
}: {
  columns: BoardColumnView[];
  currentColumnId: string;
  pending: boolean;
  onMove(column: BoardColumnView): Promise<void>;
}): ReactNode {
  return (
    <section className="detail-panel move-panel" aria-labelledby="move-heading" aria-busy={pending}>
      <h2 id="move-heading">Move task</h2>
      <label className="move-select">
        Column
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
    </section>
  );
}

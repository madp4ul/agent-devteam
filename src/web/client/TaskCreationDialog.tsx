import { useState, type FormEvent, type ReactNode } from "react";

import { createTask, type BrowserColumnView } from "./api.ts";
import { errorMessage } from "./feedback.ts";

export function TaskCreationDialog({
  initial,
  columns,
  onClose,
  onCreated,
}: {
  initial: { boardId: string; columnId: string };
  columns: BrowserColumnView[];
  onClose(): void;
  onCreated(task: { id: string }, column: BrowserColumnView): Promise<void>;
}): ReactNode {
  const [columnId, setColumnId] = useState(initial.columnId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const result = await createTask({
        boardId: initial.boardId,
        columnId,
        title,
        description,
        idempotencyKey,
      });
      const column = columns.find((candidate) => candidate.id === columnId);
      if (column === undefined) throw new Error("The selected column is unavailable.");
      await onCreated(result.task, column);
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
      >
        <div className="modal-heading">
          <div><p className="eyebrow">New coordination work</p><h2 id="create-title">Create task</h2></div>
          <button className="icon-button" aria-label="Close task creation" onClick={onClose}>×</button>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Starting column
            <select
              aria-label="Starting column"
              value={columnId}
              onChange={(event) => setColumnId(event.currentTarget.value)}
            >
              {columns.map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
          </label>
          <label>
            Outcome-oriented title
            <input autoFocus value={title} onChange={(event) => setTitle(event.currentTarget.value)} />
          </label>
          <label>
            Complete description
            <textarea rows={8} value={description} onChange={(event) => setDescription(event.currentTarget.value)} />
          </label>
          {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button disabled={pending} type="submit">{pending ? "Creating…" : "Create task"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

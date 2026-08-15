import { useState, type FormEvent, type ReactNode } from "react";

import { createChildTask, createTask } from "./api.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import { errorMessage } from "./feedback.ts";
import { Modal } from "./Modal.tsx";

interface CreationColumn {
  id: string;
  name: string;
  taskCreationAllowed: boolean;
}

export function TaskCreationDialog({
  initial,
  columns,
  parent,
  onClose,
  onCreated,
}: {
  initial: { boardId: string; columnId: string };
  columns: CreationColumn[];
  parent?: { id: string; title: string };
  onClose(): void;
  onCreated(task: { id: string }, column: CreationColumn): Promise<void>;
}): ReactNode {
  const availableColumns = columns.filter((column) => column.taskCreationAllowed);
  const [columnId, setColumnId] = useState(() =>
    availableColumns.some((column) => column.id === initial.columnId)
      ? initial.columnId
      : availableColumns[0]?.id ?? "",
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [startingRef, setStartingRef] = useState("");
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const input = {
        boardId: initial.boardId,
        columnId,
        title,
        description,
        idempotencyKey,
      };
      const result = parent === undefined
        ? await createTask(input)
        : await createChildTask(parent.id, {
            ...input,
            ...(startingRef.trim().length === 0 ? {} : { startingRef: startingRef.trim() }),
          });
      const column = availableColumns.find((candidate) => candidate.id === columnId);
      if (column === undefined) throw new Error("The selected column is unavailable.");
      await onCreated(result.task, column);
    } catch (caught) {
      setError(errorMessage(caught));
      setPending(false);
    }
  };
  const childMode = parent !== undefined;
  return (
    <Modal labelledBy="create-title" className="create-modal" onClose={onClose}>
        <div className="modal-heading">
          <div>
            <p className="eyebrow">
              {parent === undefined ? "New coordination work" : `Parent ${parent.id} · ${parent.title}`}
            </p>
            <h2 id="create-title">{childMode ? "Create child task" : "Create task"}</h2>
          </div>
          <CloseIconButton label="Close task creation" onClick={onClose} />
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Starting column
            <select
              aria-label="Starting column"
              value={columnId}
              onChange={(event) => setColumnId(event.currentTarget.value)}
            >
              {availableColumns.map((column) => (
                <option key={column.id} value={column.id}>{column.name}</option>
              ))}
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
          {childMode ? (
            <details className="create-advanced">
              <summary>Advanced</summary>
              <label>
                Starting Git ref (optional)
                <input value={startingRef} onChange={(event) => setStartingRef(event.currentTarget.value)} />
              </label>
            </details>
          ) : null}
          {error === undefined ? null : <p role="alert" className="feedback alert">{error}</p>}
          <div className="form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancel</button>
            <button disabled={pending} type="submit">
              {pending ? "Creating…" : childMode ? "Create child task" : "Create task"}
            </button>
          </div>
        </form>
    </Modal>
  );
}

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { TaskRelationshipView } from "../../application/browser-transport-contract.ts";
import {
  addTaskDependency,
  readBoard,
  removeTaskRelationship,
  type BrowserRelationshipTask,
  type BrowserTaskDetail,
} from "./api.ts";
import { errorMessage } from "./feedback.ts";
import { Modal } from "./Modal.tsx";
import type { Navigate } from "./navigation.ts";
import { TaskCreationDialog } from "./TaskCreationDialog.tsx";

type RelationshipGroup = "Parent tasks" | "Child tasks" | "Depends on" | "Blocking tasks";

interface RelationshipEntry {
  relationship: TaskRelationshipView;
  related: BrowserRelationshipTask;
  group: RelationshipGroup;
  label: string;
  unresolved: boolean;
  blocksCurrentTask: boolean;
}

export function TaskRelationshipsPanel({
  detail,
  navigate,
  onChanged,
  onFeedback,
}: {
  detail: BrowserTaskDetail;
  navigate: Navigate;
  onChanged(): Promise<void>;
  onFeedback(feedback: { role: "status" | "alert"; text: string }): void;
}): ReactNode {
  const [candidates, setCandidates] = useState<BrowserRelationshipTask[]>([]);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [finderFocused, setFinderFocused] = useState(false);
  const [pending, setPending] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [removing, setRemoving] = useState<RelationshipEntry>();
  const finderRef = useRef<HTMLInputElement>(null);
  const relatedById = useMemo(
    () => new Map(detail.relationshipTasks.map((task) => [task.id, task])),
    [detail.relationshipTasks],
  );
  const entries = relationshipEntries(detail, relatedById);
  const duplicateDependencyIds = new Set(
    detail.task.relationships
      .filter((relationship) => relationship.type === "dependency" && relationship.sourceTaskId === detail.task.id)
      .map((relationship) => relationship.targetTaskId),
  );
  const filtered = candidates.filter((task) => {
    if (task.id === detail.task.id || duplicateDependencyIds.has(task.id)) return false;
    const normalized = query.trim().toLocaleLowerCase();
    return normalized.length === 0 || task.id.toLocaleLowerCase().includes(normalized) ||
      task.title.toLocaleLowerCase().includes(normalized);
  });

  const resetFinder = ({ clearCandidates = false }: { clearCandidates?: boolean } = {}): void => {
    setQuery("");
    setActiveIndex(-1);
    setFinderFocused(false);
    if (clearCandidates) setCandidates([]);
    finderRef.current?.blur();
  };

  const loadCandidates = async (): Promise<void> => {
    try {
      const board = await readBoard();
      setCandidates(board.boards.flatMap((candidateBoard) =>
        candidateBoard.columns.flatMap((column) => column.tasks.map((task) => ({
          id: task.id,
          title: task.title,
          boardId: candidateBoard.id,
          boardName: candidateBoard.name,
          column: task.column,
          blocking: task.blocking,
          ...(task.archived ? { archived: true as const } : {}),
        }))),
      ));
    } catch (error) {
      onFeedback({ role: "alert", text: errorMessage(error) });
    }
  };

  const addDependency = async (task: BrowserRelationshipTask): Promise<void> => {
    if (pending) return;
    setPending(true);
    try {
      await addTaskDependency(detail.task.id, task.id, crypto.randomUUID());
      resetFinder({ clearCandidates: true });
      await onChanged();
      onFeedback({ role: "status", text: `Added dependency on ${task.title}.` });
    } catch (error) {
      await onChanged();
      onFeedback({ role: "alert", text: `${errorMessage(error)} Relationship state was refreshed.` });
    } finally {
      setPending(false);
    }
  };

  const onFinderKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      resetFinder();
      return;
    }
    if (filtered.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        const starting = current < 0 ? (direction > 0 ? -1 : 0) : current;
        return (starting + direction + filtered.length) % filtered.length;
      });
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const task = filtered[activeIndex];
      if (task !== undefined) void addDependency(task);
    }
  };

  const confirmRemoval = async (): Promise<void> => {
    if (removing === undefined) return;
    setPending(true);
    try {
      await removeTaskRelationship(detail.task.id, removing.relationship.id, crypto.randomUUID());
      setRemoving(undefined);
      await onChanged();
      onFeedback({ role: "status", text: `Removed ${removing.label.toLocaleLowerCase()}.` });
    } catch (error) {
      setRemoving(undefined);
      await onChanged();
      onFeedback({ role: "alert", text: `${errorMessage(error)} Relationship state was refreshed.` });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="detail-panel relationship-panel" aria-labelledby="relationships-heading">
      <h2 id="relationships-heading">Relationships</h2>
      {entries.length === 0 ? <p className="quiet">No task relationships.</p> : (
        <div className="relationship-groups">
          {(["Parent tasks", "Child tasks", "Depends on", "Blocking tasks"] as const).map((group) => {
            const grouped = entries.filter((entry) => entry.group === group);
            return grouped.length === 0 ? null : (
              <section key={group} aria-labelledby={`relationship-${group.replaceAll(" ", "-").toLowerCase()}`}>
                <h3 id={`relationship-${group.replaceAll(" ", "-").toLowerCase()}`}>{group}</h3>
                <ul className="relationship-list">
                  {grouped.map((entry) => (
                    <li key={entry.relationship.id} className="relationship-row">
                      <div>
                        <a
                          href={`/tasks/${encodeURIComponent(entry.related.id)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            navigate(`/tasks/${encodeURIComponent(entry.related.id)}`);
                          }}
                        >{entry.related.title}</a>
                        <span className="relationship-context">
                          {entry.related.id} · {entry.related.boardName} / {entry.related.column.name}
                        </span>
                        {entry.blocksCurrentTask ? <span className="signal blocked">Blocking</span> : null}
                        {entry.related.column.id === "completion" ? <span className="signal">Completed · nonblocking</span> : null}
                        {entry.related.archived ? <span className="signal">Archived</span> : null}
                      </div>
                      {detail.task.archived ? null : (
                        <button
                          type="button"
                          className="relationship-remove"
                          aria-label={`Remove ${entry.label.toLocaleLowerCase()} with ${entry.related.title}`}
                          title={`Remove ${entry.label.toLocaleLowerCase()}`}
                          onClick={() => setRemoving(entry)}
                        >
                          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                            <path d="M5 5l10 10M15 5L5 15" />
                          </svg>
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {detail.task.archived ? null : (
        <div className="relationship-actions" role="group" aria-label="Add relationship">
          <div className="relationship-action relationship-child-action">
            <span className="relationship-action-label">Child task</span>
            <button
              type="button"
              className="secondary"
              aria-label="Create child task"
              onClick={() => setCreatingChild(true)}
            >
              Create
            </button>
          </div>
          <div className="relationship-action relationship-finder">
            <label htmlFor="relationship-task-search">Depends on</label>
            <input
              ref={finderRef}
              id="relationship-task-search"
              role="combobox"
              aria-autocomplete="list"
              aria-controls="relationship-task-options"
              aria-expanded={finderFocused && filtered.length > 0}
              aria-activedescendant={activeIndex < 0 ? undefined : `relationship-option-${filtered[activeIndex]?.id}`}
              autoComplete="off"
              placeholder="Find a task"
              value={query}
              disabled={pending}
              onFocus={() => {
                setFinderFocused(true);
                if (candidates.length === 0) void loadCandidates();
              }}
              onBlur={() => setFinderFocused(false)}
              onChange={(event) => {
                setQuery(event.currentTarget.value);
                setActiveIndex(-1);
              }}
              onKeyDown={onFinderKeyDown}
            />
            {finderFocused ? filtered.length === 0 ? (
              <p className="relationship-options relationship-empty">No matching active tasks.</p>
            ) : (
                <ul
                  id="relationship-task-options"
                  role="listbox"
                  aria-label="Available dependency tasks"
                  className="relationship-options"
                >
                  {filtered.map((task, index) => (
                    <li
                      id={`relationship-option-${task.id}`}
                      key={task.id}
                      role="option"
                      aria-selected={activeIndex === index}
                      className={activeIndex === index ? "active" : undefined}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => void addDependency(task)}
                    >
                      <strong>{task.title}</strong>
                      <span>{task.id} · {task.boardName} / {task.column.name}</span>
                      {task.column.id === "completion" ? <span>Completed · nonblocking</span> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
          </div>
        </div>
      )}
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
            await onChanged();
            onFeedback({ role: "status", text: `Created child ${task.id}.` });
          }}
        />
      ) : null}
      {removing === undefined ? null : (
        <RemovalConfirmation
          entry={removing}
          detail={detail}
          pending={pending}
          onCancel={() => setRemoving(undefined)}
          onConfirm={() => void confirmRemoval()}
        />
      )}
    </section>
  );
}

function relationshipEntries(
  detail: BrowserTaskDetail,
  relatedById: Map<string, BrowserRelationshipTask>,
): RelationshipEntry[] {
  return detail.task.relationships.flatMap((relationship) => {
    const currentIsSource = relationship.sourceTaskId === detail.task.id;
    const relatedId = currentIsSource ? relationship.targetTaskId : relationship.sourceTaskId;
    const related = relatedById.get(relatedId);
    if (related === undefined) return [];
    const group: RelationshipGroup = relationship.type === "parent-child"
      ? currentIsSource ? "Child tasks" : "Parent tasks"
      : currentIsSource ? "Depends on" : "Blocking tasks";
    const label = relationship.type === "parent-child"
      ? currentIsSource ? "Child relationship" : "Parent relationship"
      : currentIsSource ? "Dependency" : "Blocking dependency";
    const target = currentIsSource ? related : currentTaskReference(detail);
    const unresolved = target.column.id !== "completion";
    return [{
      relationship,
      related,
      group,
      label,
      unresolved,
      blocksCurrentTask: currentIsSource && unresolved,
    }];
  });
}

function currentTaskReference(detail: BrowserTaskDetail): BrowserRelationshipTask {
  return {
    id: detail.task.id,
    title: detail.task.title,
    boardId: detail.task.boardId,
    boardName: detail.board.name,
    column: detail.inspection.column,
    blocking: detail.inspection.blocking,
    ...(detail.task.archived ? { archived: true as const } : {}),
  };
}

function RemovalConfirmation({
  entry,
  detail,
  pending,
  onCancel,
  onConfirm,
}: {
  entry: RelationshipEntry;
  detail: BrowserTaskDetail;
  pending: boolean;
  onCancel(): void;
  onConfirm(): void;
}): ReactNode {
  const source = entry.relationship.sourceTaskId === detail.task.id
    ? currentTaskReference(detail)
    : entry.related;
  const clearsFinalBlocker = entry.unresolved && source.blocking.blockerTaskIds.length === 1;
  return (
    <Modal labelledBy="remove-relationship-title" onClose={onCancel}>
        <h2 id="remove-relationship-title">Remove {entry.label.toLocaleLowerCase()}?</h2>
        <p>
          Remove the relationship between {detail.task.title} and {entry.related.title}?
          Neither task will be deleted, and earlier relationship activity remains in both timelines.
        </p>
        <p>
          {clearsFinalBlocker
            ? `This will clear the final blocker for ${source.title} and may queue its current column's watching agent.`
            : entry.unresolved
              ? `${source.title} will remain blocked by other unresolved work.`
              : "This relationship is already nonblocking, so removal will not queue an agent."}
        </p>
        <div className="form-actions">
          <button type="button" className="secondary" autoFocus onClick={onCancel}>Cancel</button>
          <button type="button" className="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Removing…" : "Remove relationship"}
          </button>
        </div>
    </Modal>
  );
}

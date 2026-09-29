import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import type { TaskRelationshipView } from "../../application/browser-transport-contract.ts";
import { AgentInspectableMarker } from "./AgentInspectableMarker.tsx";
import {
  addTaskDependency,
  editTaskRelationshipResumeAgent,
  readBoard,
  removeTaskRelationship,
  type BrowserRelationshipTask,
  type BrowserTaskDetail,
} from "./api.ts";
import { DisclosureIcon } from "./DisclosureIcon.tsx";
import { errorMessage } from "./feedback.ts";
import { Modal } from "./Modal.tsx";
import { TaskCreationDialog } from "./TaskCreationDialog.tsx";

type RelationshipGroup = "Parent tasks" | "Child tasks" | "Depends on" | "Waiting tasks";

interface RelationshipEntry {
  relationship: TaskRelationshipView;
  related: BrowserRelationshipTask;
  group: RelationshipGroup;
  label: string;
  unresolved: boolean;
  currentTaskIsWaiting: boolean;
}

export function TaskRelationshipsPanel({
  detail,
  onChanged,
  onFeedback,
}: {
  detail: BrowserTaskDetail;
  onChanged(): Promise<void>;
  onFeedback(feedback: { role: "status" | "alert"; text: string }): void;
}): ReactNode {
  const [pending, setPending] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [creatingDependency, setCreatingDependency] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [removing, setRemoving] = useState<RelationshipEntry>();
  const relatedById = useMemo(
    () => new Map(detail.relationshipTasks.map((task) => [task.id, task])),
    [detail.relationshipTasks],
  );
  const entries = relationshipEntries(detail, relatedById);
  const addDependency = async (task: BrowserRelationshipTask, resumeAgentId: string): Promise<void> => {
    if (pending) return;
    setPending(true);
    try {
      await addTaskDependency(detail.task.id, task.id, resumeAgentId, crypto.randomUUID());
      setCreatingDependency(false);
      await onChanged();
      onFeedback({ role: "status", text: `Added dependency on ${task.title}.` });
    } catch (error) {
      await onChanged();
      onFeedback({ role: "alert", text: `${errorMessage(error)} Relationship state was refreshed.` });
    } finally {
      setPending(false);
    }
  };

  const changeResumeAgent = async (entry: RelationshipEntry, agentId: string): Promise<void> => {
    setPending(true);
    try {
      await editTaskRelationshipResumeAgent(
        detail.task.id,
        entry.relationship.id,
        agentId,
        crypto.randomUUID(),
      );
      await onChanged();
      onFeedback({ role: "status", text: "Updated resume agent." });
    } catch (error) {
      await onChanged();
      onFeedback({ role: "alert", text: `${errorMessage(error)} Relationship state was refreshed.` });
    } finally {
      setPending(false);
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
          {(["Parent tasks", "Child tasks", "Depends on", "Waiting tasks"] as const).map((group) => {
            const grouped = entries.filter((entry) => entry.group === group);
            return grouped.length === 0 ? null : (
              <section key={group} aria-labelledby={`relationship-${group.replaceAll(" ", "-").toLowerCase()}`}>
                <h3 id={`relationship-${group.replaceAll(" ", "-").toLowerCase()}`}>{group}</h3>
                <ul className="relationship-list">
                  {grouped.map((entry) => (
                    <li key={entry.relationship.id} className="relationship-row">
                      <div>
                        <span className="relationship-title">
                          <a
                            href={`/tasks/${encodeURIComponent(entry.related.id)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >{entry.related.title}</a>
                        </span>
                        <span className="relationship-context">
                          {entry.related.id} · {entry.related.boardName} / {entry.related.column.name}
                        </span>
                        {entry.currentTaskIsWaiting ? <span className="signal waiting">Waiting on</span> : null}
                        {entry.related.column.id === "completion" ? <span className="signal">Completed</span> : null}
                        {entry.related.archived ? <span className="signal">Archived</span> : null}
                        <span className="relationship-context">
                          Resume agent · {detail.collaborators.find(({ id }) => id === entry.relationship.resumeAgentId)?.name
                            ?? entry.relationship.resumeAgentId
                            ?? "Needs assignment"}
                        </span>
                        {entry.currentTaskIsWaiting && !detail.task.archived ? (
                          <select
                            className="relationship-resume-select"
                            aria-label={`Change resume agent for ${entry.related.title}`}
                            title="Change resume agent"
                            value={entry.relationship.resumeAgentId ?? ""}
                            disabled={pending}
                            onChange={(event) => void changeResumeAgent(entry, event.currentTarget.value)}
                          >
                            <option value="" disabled>Select an agent</option>
                            {detail.collaborators.map((agent) => (
                              <option key={agent.id} value={agent.id}>{agent.name}</option>
                            ))}
                          </select>
                        ) : null}
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
                      {detail.agentInspectableContent.relationshipIds.includes(entry.relationship.id)
                        ? <AgentInspectableMarker />
                        : null}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {detail.task.archived ? null : (
        <div className="relationship-actions" role="group" aria-label="Create relationship">
          <span className="relationship-action-label">Create</span>
          <div className="relationship-create-control">
            <button
              type="button"
              className="relationship-create-primary"
              aria-label="Create child task"
              onClick={() => setCreatingChild(true)}
            >
              Child task
            </button>
            <div className="relationship-create-menu">
              <button
                type="button"
                className="relationship-create-disclosure"
                aria-label="More relationship types"
                aria-expanded={createMenuOpen}
                aria-haspopup="menu"
                onClick={() => setCreateMenuOpen((current) => !current)}
              >
                <DisclosureIcon />
              </button>
              {createMenuOpen ? (
                <div className="relationship-create-options" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setCreateMenuOpen(false);
                      setCreatingDependency(true);
                    }}
                  >
                    Dependency
                  </button>
                </div>
              ) : null}
            </div>
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
          collaborators={detail.collaborators}
          onClose={() => setCreatingChild(false)}
          onCreated={async (task) => {
            setCreatingChild(false);
            await onChanged();
            onFeedback({ role: "status", text: `Created child ${task.id}.` });
          }}
        />
      ) : null}
      {creatingDependency ? (
        <DependencyCreationDialog
          detail={detail}
          pending={pending}
          onClose={() => setCreatingDependency(false)}
          onCreate={(task, resumeAgentId) => addDependency(task, resumeAgentId)}
          onFeedback={onFeedback}
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

function DependencyCreationDialog({
  detail,
  pending,
  onClose,
  onCreate,
  onFeedback,
}: {
  detail: BrowserTaskDetail;
  pending: boolean;
  onClose(): void;
  onCreate(task: BrowserRelationshipTask, resumeAgentId: string): Promise<void>;
  onFeedback(feedback: { role: "status" | "alert"; text: string }): void;
}): ReactNode {
  const [candidates, setCandidates] = useState<BrowserRelationshipTask[]>([]);
  const [candidatesLoaded, setCandidatesLoaded] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [resultsOpen, setResultsOpen] = useState(true);
  const [selectedTask, setSelectedTask] = useState<BrowserRelationshipTask>();
  const [resumeAgentId, setResumeAgentId] = useState("");
  const finderRef = useRef<HTMLInputElement>(null);
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
          waitingOn: task.waitingOn,
          ...(task.archived ? { archived: true as const } : {}),
        }))),
      ));
      setCandidatesLoaded(true);
    } catch (error) {
      setCandidatesLoaded(true);
      onFeedback({ role: "alert", text: errorMessage(error) });
    }
  };

  const chooseTask = (task: BrowserRelationshipTask): void => {
    setSelectedTask(task);
    setQuery(task.title);
    setActiveIndex(-1);
    setResultsOpen(false);
  };

  const onFinderKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape" && resultsOpen) {
      event.preventDefault();
      event.stopPropagation();
      setActiveIndex(-1);
      setResultsOpen(false);
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
      if (task !== undefined) chooseTask(task);
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedTask !== undefined && resumeAgentId.length > 0 && !pending) {
      void onCreate(selectedTask, resumeAgentId);
    }
  };

  return (
    <Modal
      labelledBy="create-dependency-title"
      className="dependency-dialog"
      initialFocusRef={finderRef}
      onClose={onClose}
    >
      <div className="modal-heading">
        <div>
          <p className="eyebrow">Relationship</p>
          <h2 id="create-dependency-title">Create dependency</h2>
        </div>
      </div>
      <form onSubmit={submit}>
        <label htmlFor="relationship-task-search">
          Task to wait on
          <input
            ref={finderRef}
            id="relationship-task-search"
            role="combobox"
            aria-autocomplete="list"
            aria-controls="relationship-task-options"
            aria-expanded={resultsOpen && candidatesLoaded && filtered.length > 0}
            aria-activedescendant={activeIndex < 0 ? undefined : `relationship-option-${filtered[activeIndex]?.id}`}
            autoComplete="off"
            placeholder="Find a task by title or ID"
            value={query}
            disabled={pending}
            onFocus={() => {
              setResultsOpen(true);
              if (candidates.length === 0) void loadCandidates();
            }}
            onChange={(event) => {
              setQuery(event.currentTarget.value);
              setSelectedTask(undefined);
              setActiveIndex(-1);
              setResultsOpen(true);
            }}
            onKeyDown={onFinderKeyDown}
          />
        </label>
        <div className="relationship-task-results">
          {resultsOpen ? !candidatesLoaded ? (
            <p className="relationship-results-message">Loading tasks…</p>
          ) : filtered.length === 0 ? (
            <p className="relationship-results-message relationship-empty">No matching active tasks.</p>
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
                  aria-selected={selectedTask?.id === task.id}
                  className={activeIndex === index ? "active" : undefined}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => chooseTask(task)}
                >
                  <strong>{task.title}</strong>
                  <span>{task.id} · {task.boardName} / {task.column.name}</span>
                  {task.column.id === "completion" ? <span>Completed</span> : null}
                </li>
              ))}
            </ul>
          ) : selectedTask === undefined ? (
            <p className="relationship-results-message">Task suggestions are hidden. Focus the task field to show them.</p>
          ) : (
            <p className="relationship-selection">
              Selected task · <strong>{selectedTask.title}</strong>
              <span>{selectedTask.id} · {selectedTask.boardName} / {selectedTask.column.name}</span>
            </p>
          )}
        </div>
        <label htmlFor="relationship-resume-agent">
          Resume agent
          <select
            id="relationship-resume-agent"
            required
            value={resumeAgentId}
            disabled={pending}
            onChange={(event) => setResumeAgentId(event.currentTarget.value)}
          >
            <option value="">Select an agent</option>
            {detail.collaborators.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label>
        <div className="form-actions">
          <button type="button" className="secondary" disabled={pending} onClick={onClose}>Cancel</button>
          <button type="submit" disabled={pending || selectedTask === undefined || resumeAgentId.length === 0}>
            {pending ? "Creating…" : "Create dependency"}
          </button>
        </div>
      </form>
    </Modal>
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
      : currentIsSource ? "Depends on" : "Waiting tasks";
    const label = relationship.type === "parent-child"
      ? currentIsSource ? "Child relationship" : "Parent relationship"
      : currentIsSource ? "Dependency" : "Dependent relationship";
    const target = currentIsSource ? related : currentTaskReference(detail);
    const unresolved = target.column.id !== "completion";
    return [{
      relationship,
      related,
      group,
      label,
      unresolved,
      currentTaskIsWaiting: currentIsSource && unresolved,
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
    waitingOn: detail.inspection.waitingOn,
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
  return (
    <Modal labelledBy="remove-relationship-title" onClose={onCancel}>
        <h2 id="remove-relationship-title">Remove {entry.label.toLocaleLowerCase()}?</h2>
        <p>
          Remove the relationship between {detail.task.title} and {entry.related.title}?
          Neither task will be deleted, and earlier relationship activity remains in both timelines.
        </p>
        <p>
          {entry.unresolved
            ? `${source.title} will stop waiting on this relationship. Removing it will not queue an agent.`
            : "This relationship is already satisfied. Removing it will not queue an agent."}
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

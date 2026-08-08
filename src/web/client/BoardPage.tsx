import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

import type { TaskOverviewView } from "../../application/coordination-contract.ts";
import {
  createTask,
  dismissStaleActivation,
  pauseAutomation,
  readBoard,
  resumeAutomation,
  resumeWithCurrentProcess,
  type BrowserBoardState,
  type BrowserColumnView,
} from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";
import { AttentionReasonResolution } from "./AttentionReasonAction.tsx";
import { Loading } from "./Loading.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import type { Navigate, NavigationState } from "./navigation.ts";
import { useTaskMovement } from "./task-movement.ts";

export function BoardPage({
  navigate,
  notifications,
}: {
  navigate: Navigate;
  notifications: DesktopNotificationControl;
}): ReactNode {
  const initialContext = (window.history.state as NavigationState | null)?.boardContext;
  const [state, setState] = useState<BrowserBoardState>();
  const [filter, setFilter] = useState(
    initialContext?.filter ?? new URLSearchParams(location.search).get("q") ?? "",
  );
  const [creation, setCreation] = useState<{ boardId: string; columnId: string }>();
  const [highlightedTaskId, setHighlightedTaskId] = useState<string>();
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const refresh = useCallback(async () => setState(await readBoard()), []);
  const processImpact = state?.startup.mode === "paused" ? state.startup.processImpact : undefined;
  const { feedback, setFeedback, pendingTaskId, move } = useTaskMovement(refresh);

  useEffect(() => {
    void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
  }, [refresh, setFeedback]);
  useEffect(() => {
    if (state === undefined || (state.activeRuns.length === 0 && state.automation.state !== "pausing")) return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, state]);
  useLayoutEffect(() => {
    const lane = initialContext === undefined
      ? undefined
      : laneRefs.current.get(initialContext.boardId);
    if (state !== undefined && lane !== undefined && initialContext !== undefined) {
      lane.scrollLeft = initialContext.scrollLeft;
    }
  }, [state, initialContext]);

  const rememberContext = useCallback((boardId: string) => {
    const boardContext = {
      boardId,
      filter,
      scrollLeft: laneRefs.current.get(boardId)?.scrollLeft ?? 0,
    };
    window.history.replaceState(
      { boardContext },
      "",
      filter.length === 0 ? "/" : `/?q=${encodeURIComponent(filter)}`,
    );
  }, [filter]);
  const openTask = useCallback((taskId: string, boardId: string) => {
    rememberContext(boardId);
    navigate(`/tasks/${encodeURIComponent(taskId)}`, { returnToBoard: true });
  }, [navigate, rememberContext]);
  const locateTask = useCallback((taskId: string, boardId: string) => {
    setFilter("");
    setHighlightedTaskId(taskId);
    queueMicrotask(() => {
      const card = document.querySelector<HTMLElement>(`[data-task-id="${CSS.escape(taskId)}"]`);
      card?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
      card?.focus({ preventScroll: true });
    });
    rememberContext(boardId);
  }, [rememberContext]);

  useEffect(
    () =>
      monitorForElements({
        onDrop: ({ source, location }) => {
          const taskId = source.data.taskId;
          const columnId = location.current.dropTargets[0]?.data.columnId;
          const boardId = location.current.dropTargets[0]?.data.boardId;
          if (
            typeof taskId !== "string" ||
            typeof columnId !== "string" ||
            typeof boardId !== "string" ||
            state === undefined
          ) {
            return;
          }
          const task = state.boards
            .flatMap((board) => board.columns.flatMap((column) => column.tasks))
            .find((candidate) => candidate.id === taskId);
          const destination = state.boards
            .find((board) => board.id === boardId)
            ?.columns.find((column) => column.id === columnId);
          if (task !== undefined && task.boardId === boardId && destination !== undefined) {
            void move(task, destination);
          }
        },
      }),
    [move, state],
  );

  if (state === undefined) return <Loading />;
  if (state.startup.mode === "configuration-error") {
    return (
      <main className="configuration-error">
        <p className="eyebrow">Startup blocked</p>
        <h1>Configuration error</h1>
        <p>Automation and board mutation are unavailable until these diagnostics are corrected.</p>
        <ol>
          {state.startup.diagnostics.map((diagnostic) => (
            <li key={`${diagnostic.file}:${diagnostic.line}:${diagnostic.column}`}>
              <strong>{diagnostic.file}:{diagnostic.line}:{diagnostic.column}</strong>
              <p>Invalid value: <code>{formatDiagnosticValue(diagnostic.invalidValue)}</code></p>
              <p>{diagnostic.rule}</p>
              <p>{diagnostic.consequence}</p>
              {diagnostic.correction === undefined ? null : <p>{diagnostic.correction}</p>}
            </li>
          ))}
        </ol>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">{state.startup.processName}</p>
          <h1>Coordination board</h1>
        </div>
        <div className="automation-control">
          <span className={`status-dot ${state.automation.state}`} aria-hidden="true" />
          <span>Automation {state.automation.state}</span>
          {state.automation.state === "paused" && (processImpact?.staleActivations.length ?? 0) === 0 ? (
            <button
              className="secondary"
              onClick={() =>
                void resumeAutomation()
                  .then(refresh)
                  .catch((error) =>
                    setFeedback({ role: "alert", text: errorMessage(error) }),
                  )}
            >
              Resume
            </button>
          ) : null}
          {state.automation.state === "running" || state.automation.state === "pausing" ? (
            <button
              className="secondary"
              disabled={state.automation.state === "pausing"}
              onClick={() => void pauseAutomation().then(refresh).catch((error) =>
                setFeedback({ role: "alert", text: errorMessage(error) }))}
            >
              {state.automation.state === "pausing" ? "Draining active runs…" : "Pause"}
            </button>
          ) : null}
          {state.automation.state === "paused" ? <span>No agents are changing boards.</span> : null}
          <details className="live-runs">
            <summary>Current runs · {state.activeRuns.length}</summary>
            {state.activeRuns.length === 0 ? <p>No active agents.</p> : (
              <ul>
                {state.activeRuns.map((run) => (
                  <li key={run.attemptId}>
                    <button className="secondary" onClick={() => openTask(run.taskId, run.boardId)}>
                      {run.agentId} · {run.taskId} · {run.boardName} / {run.columnName} · {run.status} ·{" "}
                      <ElapsedTime startedAt={run.startedAt} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </details>
          {notifications.available ? (
            <button className="secondary" onClick={() => void notifications.toggle()}>
              Desktop notifications {notifications.enabled ? "on" : "off"}
            </button>
          ) : (
            <span>Desktop notifications unavailable</span>
          )}
        </div>
      </header>
      <main>
        {processImpact === undefined ? null : (
          <section className="process-impact" aria-labelledby="process-impact-heading">
            <p className="eyebrow">Process definition changed</p>
            <h2 id="process-impact-heading">Review startup impact</h2>
            <p>
              Live state was preserved. Stale activations will not run until explicitly approved
              for the current process, and unmapped tasks remain dormant until a user remaps them.
            </p>
            <h3>Unmapped tasks Â· {processImpact.unmappedTasks.length}</h3>
            {processImpact.unmappedTasks.length === 0 ? <p>All retained tasks are mapped.</p> : (
              <ul>
                {processImpact.unmappedTasks.map((task) => (
                  <li key={task.taskId}>
                    <button className="secondary" onClick={() => openTask(task.taskId, task.boardId)}>
                      {task.taskId} Â· {task.title} Â· former {task.boardName} / {task.columnName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <h3>Stale activations Â· {processImpact.staleActivations.length}</h3>
            <ul>
              {processImpact.staleActivations.map((activation) => (
                <li key={activation.activationId}>
                  <span>
                    {activation.taskId} Â· {activation.targetAgentId} Â· {activation.priorStatus}
                    {activation.targetAvailable ? " Â· current target available" : " Â· target agent removed"}
                    {activation.taskMapped ? " Â· task mapped" : " Â· task unmapped"}
                  </span>
                  <button
                    className="secondary"
                    onClick={() => void dismissStaleActivation(
                      activation.activationId,
                      crypto.randomUUID(),
                    ).then(refresh).catch((error) =>
                      setFeedback({ role: "alert", text: errorMessage(error) }))}
                  >
                    Dismiss stale activation
                  </button>
                </li>
              ))}
            </ul>
            {processImpact.staleActivations.some((activation) => activation.targetAvailable) ? (
              <button onClick={() => void resumeWithCurrentProcess().then(refresh).catch((error) =>
                setFeedback({ role: "alert", text: errorMessage(error) }))}>
                Resume with current process
              </button>
            ) : null}
          </section>
        )}
        <section className="needs-attention" aria-labelledby="needs-attention-heading">
          <div className="board-heading">
            <div>
              <p className="eyebrow">Explicit action required</p>
              <h2 id="needs-attention-heading">Needs attention</h2>
            </div>
          </div>
          {state.attention.length === 0 ? (
            <p className="quiet">No tasks need attention.</p>
          ) : (
            <ol className="attention-groups">
              {state.attention.map(({ task, reasons }) => (
                <li key={task.id}>
                  <div>
                    <strong>{task.id} · {task.title}</strong>
                    <small>{task.boardName}</small>
                  </div>
                  <ul>
                    {reasons.map((reason) => (
                      <li
                        key={reason.id}
                        className={new URLSearchParams(location.search).get("attention") === reason.id ? "highlighted" : ""}
                      >
                        <AttentionReasonResolution
                          reason={reason}
                          onResolved={refresh}
                          onError={(error) =>
                            setFeedback({ role: "alert", text: errorMessage(error) })}
                        />
                      </li>
                    ))}
                  </ul>
                  <div className="attention-actions">
                    <button className="secondary" onClick={() => locateTask(task.id, task.boardId)}>Locate card</button>
                    <button onClick={() => openTask(task.id, task.boardId)}>Open details</button>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="board-toolbar">
          <label className="filter-field">
            <span>Filter tasks</span>
            <input
              aria-label="Filter tasks"
              type="search"
              value={filter}
              placeholder="ID or outcome"
              onChange={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
          <p className="lane-hint">Workflow runs left to right · scroll horizontally</p>
        </div>
        {feedback === undefined ? null : (
          <p className={`feedback ${feedback.role}`} role={feedback.role}>{feedback.text}</p>
        )}
        {state.boards.map((board) => (
          <section key={board.id} aria-labelledby={`board-${board.id}`}>
            <div className="board-heading">
              <div><p className="eyebrow">Board</p><h2 id={`board-${board.id}`}>{board.name}</h2></div>
            </div>
            <div
              className="board-lane"
              data-testid="board-lane"
              ref={(element) => {
                if (element === null) laneRefs.current.delete(board.id);
                else laneRefs.current.set(board.id, element);
              }}
              tabIndex={0}
              aria-label={`${board.name} workflow columns`}
            >
              {board.columns.map((column) => (
                <BoardColumn
                  key={column.id}
                  boardId={board.id}
                  column={column}
                  filter={filter}
                  pendingTaskId={pendingTaskId}
                  highlightedTaskId={highlightedTaskId}
                  activeRuns={state.activeRuns}
                  onOpen={(taskId) => openTask(taskId, board.id)}
                  onCreate={() => setCreation({ boardId: board.id, columnId: column.id })}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
      {creation === undefined ? null : (
        <CreationDialog
          initial={creation}
          columns={state.boards.find((board) => board.id === creation.boardId)?.columns ?? []}
          onClose={() => setCreation(undefined)}
          onCreated={async (task, column) => {
            await refresh();
            setCreation(undefined);
            setFeedback({ role: "status", text: `Created ${task.id} in ${column.name}.` });
          }}
        />
      )}
    </div>
  );
}

function formatDiagnosticValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}

function BoardColumn({
  boardId,
  column,
  filter,
  pendingTaskId,
  highlightedTaskId,
  activeRuns,
  onOpen,
  onCreate,
}: {
  boardId: string;
  column: BrowserColumnView;
  filter: string;
  pendingTaskId?: string | undefined;
  highlightedTaskId?: string | undefined;
  activeRuns: BrowserBoardState["activeRuns"];
  onOpen(taskId: string): void;
  onCreate(): void;
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
  const tasks = column.tasks.filter(
    (task) =>
      needle.length === 0 ||
      `${task.id} ${task.title}`.toLocaleLowerCase().includes(needle),
  );
  const headingId = `column-${boardId}-${column.id}`;
  return (
    <section
      ref={elementRef}
      data-testid={`column-${column.id}`}
      className={`board-column${over ? " drop-target" : ""}`}
      aria-labelledby={headingId}
    >
      <header className="column-header">
        <div>
          <h3 id={headingId}>{column.name}</h3>
          <span className="task-count">{tasks.length}</span>
        </div>
        <p>
          {column.watchingAgent === null
            ? "No watching agent"
            : `Watched by ${column.watchingAgent.name}`}
        </p>
      </header>
      <ol className="task-list">
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
      <button className="create-column" onClick={onCreate}>
        + Create task in {column.name}
      </button>
    </section>
  );
}

function TaskCard({
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
    if (element === null || dragHandle === null) return;
    return draggable({
      element,
      dragHandle,
      getInitialData: () => ({ taskId: task.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false),
    });
  }, [task.id]);
  return (
    <li
      ref={cardRef}
      data-task-id={task.id}
      tabIndex={-1}
      className={`task-card${pending ? " pending" : ""}${dragging ? " dragging" : ""}${highlighted ? " highlighted" : ""}`}
      aria-busy={pending}
    >
      <div className="card-topline">
        <span className="task-id">{task.id}</span>
        <button
          ref={handleRef}
          className="drag-handle"
          aria-label={`Drag ${task.id}`}
          title="Drag task"
        >
          ⠿
        </button>
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

function CreationDialog({
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

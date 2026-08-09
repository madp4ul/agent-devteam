import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
  monitorForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";

import {
  archiveCompletedTasks,
  dismissStaleActivation,
  pauseAutomation,
  readBoard,
  readArchivedTasks,
  resumeAutomation,
  resumeWithCurrentProcess,
  type BrowserBoardState,
} from "./api.ts";
import type { TaskOverviewView } from "../../application/coordination-contract.ts";
import { BoardColumn, type BoardLayout } from "./BoardColumn.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";
import { AttentionReasonResolution } from "./AttentionReasonAction.tsx";
import { Loading } from "./Loading.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import type { Navigate, NavigationState } from "./navigation.ts";
import { TaskCreationDialog } from "./TaskCreationDialog.tsx";
import { useTaskMovement } from "./task-movement.ts";

const layoutPreferenceKey = "coordination-board-layout";

export function BoardPage({
  navigate,
  notifications,
}: {
  navigate: Navigate;
  notifications: DesktopNotificationControl;
}): ReactNode {
  const pendingInitialContext = useRef(
    (window.history.state as NavigationState | null)?.boardContext,
  );
  const pendingScrollRestore = useRef(pendingInitialContext.current !== undefined);
  const scrollPositions = useRef(new Map<string, number>(
    Object.entries(pendingInitialContext.current?.scrollPositions ?? {}),
  ));
  const unfilteredScrollPositions = useRef<Map<string, number> | undefined>(undefined);
  if (
    pendingInitialContext.current !== undefined &&
    !scrollPositions.current.has(`column:${pendingInitialContext.current.boardId}`)
  ) {
    scrollPositions.current.set(
      `column:${pendingInitialContext.current.boardId}`,
      pendingInitialContext.current.scrollLeft,
    );
  }
  const [state, setState] = useState<BrowserBoardState>();
  const [filter, setFilter] = useState(
    pendingInitialContext.current?.filter ?? new URLSearchParams(location.search).get("q") ?? "",
  );
  const [layout, setLayout] = useState<BoardLayout>(readLayoutPreference);
  const [creation, setCreation] = useState<{ boardId: string; columnId: string }>();
  const [highlightedTaskId, setHighlightedTaskId] = useState<string>();
  const [archivedTasks, setArchivedTasks] = useState<TaskOverviewView[]>();
  const laneRefs = useRef(new Map<string, HTMLDivElement>());
  const scrollElements = useRef(new Map<string, HTMLElement>());
  const refresh = useCallback(async () => setState(await readBoard()), []);
  const processImpact = state?.startup.mode === "paused" ? state.startup.processImpact : undefined;
  const { feedback, setFeedback, pendingTaskId, move } = useTaskMovement(refresh);
  const captureScrollPositions = useCallback(() => {
    for (const [key, element] of scrollElements.current) {
      scrollPositions.current.set(key, element.scrollLeft);
    }
  }, []);
  const chooseLayout = useCallback((choice: BoardLayout) => {
    captureScrollPositions();
    pendingScrollRestore.current = true;
    setLayout(choice);
    try {
      localStorage.setItem(layoutPreferenceKey, choice);
    } catch {
      // The in-memory preference still applies when device storage is unavailable.
    }
  }, [captureScrollPositions]);
  const changeFilter = useCallback((nextFilter: string) => {
    if (filter.length === 0 && nextFilter.length > 0) {
      captureScrollPositions();
      unfilteredScrollPositions.current = new Map(scrollPositions.current);
    } else if (filter.length > 0 && nextFilter.length === 0) {
      if (unfilteredScrollPositions.current !== undefined) {
        scrollPositions.current = unfilteredScrollPositions.current;
        unfilteredScrollPositions.current = undefined;
      }
      pendingScrollRestore.current = true;
    }
    setFilter(nextFilter);
  }, [captureScrollPositions, filter]);

  useEffect(() => {
    void refresh().catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }));
  }, [refresh, setFeedback]);
  useEffect(() => {
    if (state === undefined || (state.activeRuns.length === 0 && state.automation.state !== "pausing")) return;
    const timer = window.setInterval(() => void refresh(), 1_000);
    return () => window.clearInterval(timer);
  }, [refresh, state]);
  useLayoutEffect(() => {
    if (state === undefined || !pendingScrollRestore.current) return;
    let restored = false;
    for (const [key, element] of scrollElements.current) {
      const position = scrollPositions.current.get(key);
      if (position === undefined) continue;
      element.scrollLeft = position;
      restored = true;
    }
    if (restored) {
      pendingScrollRestore.current = false;
      pendingInitialContext.current = undefined;
    }
  }, [filter, layout, state]);

  const rememberContext = useCallback((boardId: string) => {
    captureScrollPositions();
    const boardContext = {
      boardId,
      filter,
      scrollLeft: laneRefs.current.get(boardId)?.scrollLeft ?? 0,
      scrollPositions: Object.fromEntries(scrollPositions.current),
    };
    window.history.replaceState(
      { boardContext },
      "",
      filter.length === 0 ? "/" : `/?q=${encodeURIComponent(filter)}`,
    );
  }, [captureScrollPositions, filter]);
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
          <button
            className="secondary"
            onClick={() => void readArchivedTasks()
              .then(setArchivedTasks)
              .catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }))}
          >Archived tasks</button>
          <button
            className="secondary"
            onClick={() => void archiveCompletedTasks(crypto.randomUUID())
              .then(async (result) => {
                await refresh();
                setFeedback({
                  role: result.rejected.length === 0 ? "status" : "alert",
                  text: `Archived ${result.archivedTaskIds.length} completed task(s).${result.rejected.length === 0 ? "" : ` ${result.rejected.length} could not be archived.`}`,
                });
              })
              .catch((error) => setFeedback({ role: "alert", text: errorMessage(error) }))}
          >Archive completed</button>
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
      {archivedTasks === undefined ? null : (
        <aside className="archived-task-panel" aria-label="Archived tasks">
          <div className="panel-heading">
            <h2>Archived tasks</h2>
            <button className="secondary" onClick={() => setArchivedTasks(undefined)}>Close</button>
          </div>
          {archivedTasks.length === 0 ? <p>No archived tasks.</p> : (
            <ul>{archivedTasks.map((task) => (
              <li key={task.id}>
                <button className="secondary" onClick={() => openTask(task.id, task.boardId)}>
                  {task.id} · {task.title} · {task.column.name}
                </button>
              </li>
            ))}</ul>
          )}
        </aside>
      )}
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
        {state.attention.length === 0 ? null : (
          <section className="needs-attention" aria-labelledby="needs-attention-heading">
            <div className="board-heading">
              <div>
                <p className="eyebrow">Explicit action required</p>
                <h2 id="needs-attention-heading">Needs attention</h2>
              </div>
            </div>
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
          </section>
        )}
        <div className="board-toolbar">
          <label className="filter-field">
            <span>Filter tasks</span>
            <input
              aria-label="Filter tasks"
              type="search"
              value={filter}
              placeholder="ID or outcome"
              onChange={(event) => changeFilter(event.currentTarget.value)}
            />
          </label>
          <fieldset className="layout-control">
            <legend>Board layout</legend>
            <label>
              <input type="radio" name="board-layout" checked={layout === "row"} onChange={() => chooseLayout("row")} />
              Row layout
            </label>
            <label>
              <input type="radio" name="board-layout" checked={layout === "column"} onChange={() => chooseLayout("column")} />
              Column layout
            </label>
          </fieldset>
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
              className={`board-lane ${layout}-layout`}
              data-testid="board-lane"
              ref={(element) => {
                const key = `column:${board.id}`;
                if (element === null) {
                  laneRefs.current.delete(board.id);
                  scrollElements.current.delete(key);
                } else {
                  laneRefs.current.set(board.id, element);
                  scrollElements.current.set(key, element);
                }
              }}
              onScroll={(event) => scrollPositions.current.set(
                `column:${board.id}`,
                event.currentTarget.scrollLeft,
              )}
              tabIndex={0}
              aria-label={`${board.name} workflow columns`}
            >
              {board.columns.map((column) => (
                <BoardColumn
                  key={column.id}
                  boardId={board.id}
                  column={column}
                  layout={layout}
                  filter={filter}
                  pendingTaskId={pendingTaskId}
                  highlightedTaskId={highlightedTaskId}
                  activeRuns={state.activeRuns}
                  onTaskStrip={(element) => {
                    const key = `row:${board.id}:${column.id}`;
                    if (element === null) scrollElements.current.delete(key);
                    else scrollElements.current.set(key, element);
                  }}
                  onTaskStripScroll={(position) => scrollPositions.current.set(
                    `row:${board.id}:${column.id}`,
                    position,
                  )}
                  onOpen={(taskId) => openTask(taskId, board.id)}
                  onCreate={() => setCreation({ boardId: board.id, columnId: column.id })}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
      {creation === undefined ? null : (
        <TaskCreationDialog
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

function readLayoutPreference(): BoardLayout {
  try {
    return localStorage.getItem(layoutPreferenceKey) === "column" ? "column" : "row";
  } catch {
    return "row";
  }
}

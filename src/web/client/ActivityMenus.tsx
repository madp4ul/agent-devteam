import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ActivityMenuEntry, ActivityMenuHistory, ActivityMenuOverview, ArchivalMenuPage, ArchivalMenuTask } from "../../application/activity-menu-contract.ts";
import type { ActiveRunView, WorkspacePreparationView } from "../../application/automation-contract.ts";
import { ApiError, clearActivityMenuHistory, readActivityMenuHistory, readActivityMenuOverview, readArchivalMenu } from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage, type Feedback } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";
import { runStatusLabel } from "./RunCleanup.tsx";
import { WorkspacePreparation } from "./WorkspacePreparation.tsx";
import { retainOlderMenuEntries, uniqueMenuEntries } from "./menu-history-retention.ts";

function ActivityMenu({ label, title, children, onOpenChanged }: { label: string; title: string; children: ReactNode; onOpenChanged(open: boolean): void }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target) && ref.current) ref.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => { document.removeEventListener("pointerdown", closeOutside); document.removeEventListener("keydown", closeOnEscape); };
  }, []);
  return <details ref={ref} className="live-runs" name="activity-menu" onToggle={(event) => onOpenChanged(event.currentTarget.open)}>
    <summary className="topbar-control">{label}</summary>
    <div className="live-runs-popover activity-menu-popover" role="region" aria-label={title}>{children}</div>
  </details>;
}

function History({ entries, pending, dismiss }: { entries: ActivityMenuEntry[]; pending: boolean; dismiss(): void }) {
  if (!entries.length) return null;
  return <section className="activity-menu-history" aria-label="History">
    <div className="activity-history-heading"><h2>History</h2><button type="button" className="secondary" disabled={pending} onClick={dismiss}>Dismiss history</button></div>
    <ul>{entries.map((entry) => <li key={entry.id}>
      <a className="live-run-link" href={`/tasks/${encodeURIComponent(entry.taskId)}`}>
        <span className="activity-menu-item-heading"><span className="live-run-identity">{entry.taskId} · {entry.taskTitle}</span>
          {entry.status !== "prepared" && <ResultChip state={entry.status} />}
        </span>
        {entry.kind === "run" && <span>{entry.agentName ?? entry.agentId}</span>}
        {entry.finishedAt && <time className="quiet" dateTime={entry.finishedAt}>{new Date(entry.finishedAt).toLocaleString()}</time>}
        {(entry.status === "failed" || entry.status === "interrupted") && entry.summary && <span className="activity-history-summary">{entry.summary}</span>}
      </a>
    </li>)}</ul>
  </section>;
}

function ResultChip({ state }: { state: ActivityMenuEntry["status"] | ArchivalMenuTask["state"] }) {
  const completed = state === "completed" || state === "archived";
  const label = state === "running" ? "Archiving" : state[0]!.toUpperCase() + state.slice(1);
  return <span className={`signal ${completed ? "completed" : state === "failed" ? "failed" : state === "running" ? "running" : state === "interrupted" ? "waiting" : "queued"}`}>{label}</span>;
}

function ArchiveTaskEntry({ entry }: { entry: ArchivalMenuTask }) {
  return <li><a className="live-run-link" href={`/tasks/${encodeURIComponent(entry.taskId)}`}>
    <span className="activity-menu-item-heading"><span className="live-run-identity">{entry.taskId} · {entry.title}</span><ResultChip state={entry.state} /></span>
    <time className="quiet" dateTime={entry.updatedAt}>{new Date(entry.updatedAt).toLocaleString()}</time>
    {entry.failure && <span className="activity-history-summary">{entry.failure.reason === "workspace-dirty"
      ? "This workspace has uncommitted or untracked changes. Open the task to review them and confirm individual archival."
      : errorMessage(new ApiError(409, entry.failure))}</span>}
  </a></li>;
}

export function ActivityMenus({ activeRuns, workspacePreparations, onFeedback }: {
  activeRuns: ActiveRunView[]; workspacePreparations: WorkspacePreparationView[]; onFeedback(feedback: Feedback): void;
}) {
  const [history, setHistory] = useState<ActivityMenuHistory>({ preparations: [], runs: [] });
  const [overview, setOverview] = useState<ActivityMenuOverview>({ revision: "", preparations: { active: 0, history: 0 }, archives: { active: 0, history: 0 } });
  const [archivePage, setArchivePage] = useState<ArchivalMenuPage>({ entries: [], cursor: null });
  const [olderPreparations, setOlderPreparations] = useState<ActivityMenuEntry[]>([]);
  const [olderArchives, setOlderArchives] = useState<ArchivalMenuTask[]>([]);
  const [preparationCursor, setPreparationCursor] = useState<number | null>();
  const [archiveCursor, setArchiveCursor] = useState<number | null>();
  const [openMenu, setOpenMenu] = useState<"preparation" | "run" | "archival">();
  const [pending, setPending] = useState(false);
  const [readFailed, setReadFailed] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const refresh = useLatestRefresh(readActivityMenuOverview, (next) => {
    if (next.preparations.history < overview.preparations.history) { setOlderPreparations([]); setPreparationCursor(undefined); }
    if (next.archives.history < overview.archives.history) { setOlderArchives([]); setArchiveCursor(undefined); }
    if ((openMenu === "preparation" && !next.preparations.active && !next.preparations.history && !workspacePreparations.length) ||
      (openMenu === "archival" && !next.archives.active && !next.archives.history)) setOpenMenu(undefined);
    setOverview(next); setReadFailed(false);
  });
  useEffect(() => { void refresh().catch(() => setReadFailed(true)); }, [refresh]);
  usePolling(refresh, 1000, () => setReadFailed(true));
  const refreshDetails = useLatestRefresh(async () => ({
    history: openMenu === "preparation" || openMenu === "run" ? await readActivityMenuHistory() : undefined,
    archives: openMenu === "archival" ? await readArchivalMenu() : undefined,
  }), (next) => {
    if (next.history) {
      const finished = (entry: ActivityMenuEntry) => entry.finishedAt !== null;
      setOlderPreparations((older) => retainOlderMenuEntries(next.history!.preparations.filter(finished), history.preparations.filter(finished), older));
      setHistory(next.history);
    }
    if (next.archives) {
      const finished = (entry: ArchivalMenuTask) => entry.state !== "queued" && entry.state !== "running";
      setOlderArchives((older) => retainOlderMenuEntries(next.archives!.entries.filter(finished), archivePage.entries.filter(finished), older));
      setArchivePage(next.archives);
    }
    setReadFailed(false);
  });
  useEffect(() => {
    if (openMenu) {
      setDetailsLoading(true);
      void refreshDetails().catch(() => setReadFailed(true)).finally(() => setDetailsLoading(false));
    }
  }, [openMenu, overview.revision, refreshDetails]);
  const opened = (kind: "preparation" | "run" | "archival") => (open: boolean) => {
    if (open) { setOlderPreparations([]); setOlderArchives([]); setPreparationCursor(undefined); setArchiveCursor(undefined); }
    setOpenMenu((current) => open ? kind : current === kind ? undefined : current);
  };
  const archivalTasks = uniqueMenuEntries([...archivePage.entries, ...olderArchives]);
  const activeArchives = archivalTasks.filter((entry) => entry.state === "queued" || entry.state === "running");
  const finishedArchives = archivalTasks.filter((entry) => entry.state !== "queued" && entry.state !== "running");
  const preparationHistory = uniqueMenuEntries([...history.preparations, ...olderPreparations]).filter((entry) => entry.finishedAt !== null);
  const pendingPreparations = history.preparations.filter((entry) => entry.finishedAt === null &&
    !workspacePreparations.some((preparation) => preparation.taskId === entry.taskId));
  const dismiss = async (kind: "preparation" | "run" | "archival") => {
    setPending(true);
    try {
      await clearActivityMenuHistory(kind);
      setOlderPreparations([]); setOlderArchives([]); setPreparationCursor(undefined); setArchiveCursor(undefined);
      await refreshDetails();
      await refresh();
    } catch (error) { onFeedback({ role: "alert", text: errorMessage(error) }); }
    finally { setPending(false); }
  };
  const loadOlder = async (kind: "preparation" | "archival") => {
    setPending(true);
    try {
      if (kind === "preparation") {
        const page = await readActivityMenuHistory(preparationCursor ?? history.preparationCursor ?? undefined);
        setOlderPreparations((current) => uniqueMenuEntries([...current, ...page.preparations.filter((entry) => entry.finishedAt !== null)])); setPreparationCursor(page.preparationCursor ?? null);
      } else {
        const page = await readArchivalMenu(archiveCursor ?? archivePage.cursor ?? undefined);
        setOlderArchives((current) => uniqueMenuEntries([...current, ...page.entries.filter((entry) => entry.state !== "queued" && entry.state !== "running")])); setArchiveCursor(page.cursor);
      }
    }
    catch (error) { onFeedback({ role: "alert", text: errorMessage(error) }); }
    finally { setPending(false); }
  };
  return <>
    {workspacePreparations.length || overview.preparations.active || overview.preparations.history ? <ActivityMenu label={`${Math.max(workspacePreparations.length, overview.preparations.active)} preparing`} title="Workspace preparations" onOpenChanged={opened("preparation")}>
      {workspacePreparations.length || pendingPreparations.length ? <section aria-label="Active preparations"><h2>Preparing workspaces</h2><ul>{workspacePreparations.map((preparation) =>
        <li key={preparation.taskId}><a className="live-run-link" href={`/tasks/${encodeURIComponent(preparation.taskId)}`}>
          <span className="live-run-identity">{preparation.taskId} · {preparation.taskTitle ?? history.preparations.find((entry) => entry.taskId === preparation.taskId)?.taskTitle}</span>
          <WorkspacePreparation preparation={preparation} showAgent={false} />
        </a></li>)}
        {pendingPreparations.map((entry) => <li key={entry.id}><a className="live-run-link" href={`/tasks/${encodeURIComponent(entry.taskId)}`}>
          <span className="live-run-identity">{entry.taskId} · {entry.taskTitle}</span><span>Preparing workspace</span>
        </a></li>)}
      </ul></section> : null}
      {!workspacePreparations.length && !pendingPreparations.length && !overview.preparations.active ? <p className="activity-menu-empty">No active preparations.</p> : null}
      {readFailed && <p role="status">History is temporarily unavailable.</p>}
      {detailsLoading && !preparationHistory.length && <p role="status">Loading preparation history…</p>}
      <History entries={preparationHistory} pending={pending} dismiss={() => void dismiss("preparation")} />
      {preparationHistory.length < overview.preparations.history && (preparationCursor ?? history.preparationCursor) ? <button type="button" className="secondary" disabled={pending} onClick={() => void loadOlder("preparation")}>Load older history</button> : null}
    </ActivityMenu> : null}
    <ActivityMenu label={`${activeRuns.filter((run) => run.status === "running" && run.executionStarted !== false).length} running`} title="Agent runs" onOpenChanged={opened("run")}>
      {!activeRuns.length ? <p className="activity-menu-empty">No active runs.</p> : <section aria-label="Active runs"><h2>Active runs</h2><ul>{activeRuns.map((run) =>
        <li key={run.attemptId}><a className="live-run-link" href={`/tasks/${encodeURIComponent(run.taskId)}`} target="_blank" rel="noopener noreferrer">
          <span className="live-run-identity">{run.taskId} · {run.taskTitle}</span>
          <span>{run.agentName ?? run.agentId}</span>
          <span className="quiet">{run.boardName} / {run.columnName}</span>
          <span className="quiet">{runStatusLabel(run)}{run.status === "running" && run.executionStarted !== false ? <> · <ElapsedTime startedAt={run.startedAt} /> elapsed</> : null}</span>
        </a></li>)}</ul></section>}
      {readFailed && <p role="status">History is temporarily unavailable.</p>}
      <History entries={history.runs} pending={pending} dismiss={() => void dismiss("run")} />
      {detailsLoading && !history.runs.length && <p role="status">Loading run history…</p>}
    </ActivityMenu>
    {overview.archives.active || overview.archives.history ? <ActivityMenu label={`${overview.archives.active} archiving`} title="Archival operations" onOpenChanged={opened("archival")}>
      {readFailed && <p role="status">Archival progress is temporarily unavailable.</p>}
      {detailsLoading && !archivalTasks.length && <p role="status">Loading archival progress…</p>}
      {activeArchives.length ? <section aria-label="Active archivals"><h2>Queued and running</h2><ul>{activeArchives.map((entry) => <ArchiveTaskEntry key={entry.id} entry={entry} />)}</ul></section> : null}
      {!activeArchives.length && !overview.archives.active ? <p className="activity-menu-empty">No active archivals.</p> : null}
      {finishedArchives.length ? <section className="activity-menu-history" aria-label="Archival history">
        <div className="activity-history-heading"><h2>History</h2><button type="button" className="secondary" disabled={pending} onClick={() => void dismiss("archival")}>Dismiss history</button></div>
        <ul>{finishedArchives.map((entry) => <ArchiveTaskEntry key={entry.id} entry={entry} />)}</ul>
      </section> : null}
      {finishedArchives.length < overview.archives.history && (archiveCursor ?? archivePage.cursor) ? <button type="button" className="secondary" disabled={pending} onClick={() => void loadOlder("archival")}>Load older history</button> : null}
    </ActivityMenu> : null}
  </>;
}

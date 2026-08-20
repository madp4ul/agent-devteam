import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { TaskWorkspaceGitStateView, TaskWorkspaceView } from "../../application/browser-transport-contract.ts";
import {
  openTaskWorkspace,
  openTaskWorkspaceInVisualStudioCode,
  readTaskWorkspaceGitState,
} from "./api.ts";
import { errorMessage } from "./feedback.ts";

export function TaskWorkspacePanel({
  taskId,
  workspace,
  attemptRunning,
}: {
  taskId: string;
  workspace: TaskWorkspaceView | null;
  attemptRunning: boolean;
}): ReactNode {
  const [actionFeedback, setActionFeedback] = useState<{ role: "status" | "alert"; text: string }>();
  const [opening, setOpening] = useState<"folder" | "vscode">();
  const [menuOpen, setMenuOpen] = useState(false);
  const [gitState, setGitState] = useState<TaskWorkspaceGitStateView>();
  const [gitUnavailable, setGitUnavailable] = useState(false);
  const attemptRunningRef = useRef(attemptRunning);
  attemptRunningRef.current = attemptRunning;

  useEffect(() => {
    setGitState(undefined);
    setGitUnavailable(false);
    if (workspace === null) return;

    let disposed = false;
    let timer: number | undefined;
    let scanInProgress = false;
    let scanRequested = false;
    const pageIsHidden = (): boolean => document.visibilityState === "hidden";
    const clearTimer = (): void => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (milliseconds: number): void => {
      clearTimer();
      timer = window.setTimeout(() => void scan(), milliseconds);
    };
    const scan = async (): Promise<void> => {
      if (disposed || pageIsHidden()) return;
      if (scanInProgress) {
        scanRequested = true;
        return;
      }
      scanInProgress = true;
      let failed = false;
      try {
        const next = await readTaskWorkspaceGitState(taskId);
        if (!disposed) {
          setGitState(next);
          setGitUnavailable(false);
        }
      } catch {
        failed = true;
        if (!disposed) setGitUnavailable(true);
      } finally {
        scanInProgress = false;
        if (disposed || pageIsHidden()) return;
        if (scanRequested) {
          scanRequested = false;
          void scan();
        } else {
          schedule(failed || !attemptRunningRef.current ? 30_000 : 5_000);
        }
      }
    };
    const handleVisibilityChange = (): void => {
      clearTimer();
      if (!pageIsHidden()) void scan();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void scan();
    return () => {
      disposed = true;
      clearTimer();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [taskId, workspace?.path]);

  const requestOpen = useCallback((target: "folder" | "vscode") => {
    setMenuOpen(false);
    setOpening(target);
    setActionFeedback({ role: "status", text: "Sending open request…" });
    const request = target === "folder"
      ? openTaskWorkspace(taskId)
      : openTaskWorkspaceInVisualStudioCode(taskId);
    void request
      .then(() => setActionFeedback({
        role: "status",
        text: target === "folder"
          ? "Open request sent to the default folder application."
          : "Open request sent to Visual Studio Code.",
      }))
      .catch((error) => setActionFeedback({ role: "alert", text: errorMessage(error) }))
      .finally(() => setOpening(undefined));
  }, [taskId]);

  return (
    <section className="detail-panel workspace-panel" aria-labelledby="workspace-heading">
      <div className="workspace-heading">
        <h2 id="workspace-heading">Workspace</h2>
      </div>
      {workspace === null ? null : (
        <div className="workspace-actions">
            <button
              className="secondary workspace-copy-button"
              onClick={() => {
                void navigator.clipboard.writeText(workspace.path)
                  .then(() => setActionFeedback({ role: "status", text: "Copied task workspace path." }))
                  .catch((error) => setActionFeedback({ role: "alert", text: errorMessage(error) }));
              }}
            >
              Copy path
            </button>
            <div className="workspace-open-control">
              <button
                className="workspace-open-primary"
                disabled={opening !== undefined}
                onClick={() => requestOpen("folder")}
              >
                {opening === "folder" ? "Opening…" : "Open folder"}
              </button>
              <div className="workspace-open-menu">
                <button
                  className="workspace-open-disclosure"
                  aria-label="More ways to open workspace"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  disabled={opening !== undefined}
                  onClick={() => setMenuOpen((current) => !current)}
                >
                  <span aria-hidden="true">▾</span>
                </button>
                {menuOpen ? <div className="workspace-open-options" role="menu">
                  <button
                    role="menuitem"
                    disabled={opening !== undefined}
                    onClick={() => requestOpen("vscode")}
                  >
                    {opening === "vscode" ? "Opening…" : "Open in Visual Studio Code"}
                  </button>
                </div> : null}
              </div>
            </div>
        </div>
      )}
      {workspace === null ? (
        <p className="quiet">
          No task workspace exists yet. A Git worktree will be created before the first runnable activation.
        </p>
      ) : (
        <>
          <WorkspaceGitSummary
            startingCommit={workspace.commit}
            state={gitState}
            unavailable={gitUnavailable}
          />
          {actionFeedback === undefined ? null : (
            <p className={`workspace-feedback ${actionFeedback.role}`} role={actionFeedback.role}>
              {actionFeedback.text}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function WorkspaceGitSummary({
  startingCommit,
  state,
  unavailable,
}: {
  startingCommit: string;
  state: TaskWorkspaceGitStateView | undefined;
  unavailable: boolean;
}): ReactNode {
  const historyLabel = state === undefined
    ? "Reading Git status…"
    : state.history.kind === "diverged"
      ? "History diverged from task start"
      : `${state.history.commitsSinceTaskStart} ${state.history.commitsSinceTaskStart === 1 ? "commit" : "commits"} since task start`;

  return (
    <section className="workspace-git-summary" aria-label="Workspace Git summary">
      <div className="workspace-history-flow" aria-label="Workspace history">
        <div className="workspace-history-node">
          <span className="workspace-history-marker" aria-hidden="true" />
          <div>
            <span className="workspace-git-label">Task start</span>
            <code title={startingCommit}>{startingCommit.slice(0, 7)}</code>
          </div>
        </div>
        <div className={`workspace-history-connector ${state?.history.kind === "diverged" ? "diverged" : ""}`}>
          <span>{historyLabel}</span>
        </div>
        <div className="workspace-history-node current">
          <span className="workspace-history-marker" aria-hidden="true" />
          <div>
            <span className="workspace-git-label">Current HEAD</span>
            {state === undefined ? (
              <span className="quiet">Pending</span>
            ) : state.head.kind === "branch" ? (
              <span className="workspace-head">
                <strong title={state.head.name}>{state.head.name}</strong>
                <code>{state.head.shortHash}</code>
              </span>
            ) : (
              <strong>Detached at <code>{state.head.shortHash}</code></strong>
            )}
          </div>
        </div>
      </div>
      {state === undefined ? null : (
        <div className="workspace-git-card workspace-changes-card">
          <p className="workspace-git-label">Workspace changes</p>
          <p className="workspace-line-totals">
            <strong className="additions">+{state.changes.additions}</strong>
            <strong className="deletions">−{state.changes.deletions}</strong>
            <span>tracked lines</span>
          </p>
          {state.changes.stagedFiles === 0 &&
          state.changes.unstagedFiles === 0 &&
          state.changes.untrackedFiles === 0 ? (
            <p className="workspace-clean">No uncommitted changes</p>
          ) : (
            <ul className="workspace-change-counts">
              {state.changes.stagedFiles === 0 ? null : <li>{state.changes.stagedFiles} staged</li>}
              {state.changes.unstagedFiles === 0 ? null : <li>{state.changes.unstagedFiles} unstaged</li>}
              {state.changes.untrackedFiles === 0 ? null : <li>{state.changes.untrackedFiles} untracked</li>}
            </ul>
          )}
        </div>
      )}
      {unavailable ? <p className="workspace-git-warning">Git status unavailable</p> : null}
    </section>
  );
}

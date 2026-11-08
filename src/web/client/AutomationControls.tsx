import { useState, type ReactNode } from "react";

import type { ActiveRunView, AutomationView, WorkspacePreparationView } from "../../application/browser-transport-contract.ts";
import { pauseAutomation, resumeAutomation } from "./api.ts";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { WorkspacePreparation } from "./WorkspacePreparation.tsx";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage, type Feedback } from "./feedback.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";

export function AutomationControls({
  automation,
  activeRuns,
  workspacePreparations = [],
  canResume = true,
  notifications,
  onChanged,
  onFeedback,
}: {
  automation: AutomationView;
  activeRuns: ActiveRunView[];
  workspacePreparations?: WorkspacePreparationView[] | undefined;
  canResume?: boolean;
  notifications: DesktopNotificationControl;
  onChanged(): Promise<void>;
  onFeedback(feedback: Feedback): void;
}): ReactNode {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reportFailure = (error: unknown): void => onFeedback({ role: "alert", text: errorMessage(error) });

  return (
    <div className="automation-control">
      {automation.state === "paused" || automation.state === "pausing" ? (
        <button className="topbar-control automation-status-action" disabled={!canResume}
          aria-label={automation.state === "pausing" ? "Resume automation" : undefined}
          title={automation.state === "pausing" ? "New dispatch is paused; existing agents and workspace preparations are finishing." : undefined}
          onClick={() => void resumeAutomation().then(onChanged).catch(reportFailure)}>
          {automation.state === "pausing" ? <span className="activity-spinner" aria-hidden="true" /> : <span className="status-dot paused" aria-hidden="true" />} Resume
          {automation.state === "pausing" ? <small>Existing work finishing</small> : null}
        </button>
      ) : null}
      {automation.state === "running" ? (
        <button className="topbar-control automation-status-action"
          onClick={() => void pauseAutomation().then(onChanged).catch(reportFailure)}>
          <span className="status-dot running" aria-hidden="true" /> Pause
        </button>
      ) : null}
      <details className="live-runs">
        <summary className="topbar-control">Current runs · {activeRuns.filter((run) => run.status !== "starting" && run.executionStarted !== false).length}{workspacePreparations.length === 0 ? "" : ` · Preparing ${workspacePreparations.length}`}</summary>
        {activeRuns.length === 0 ? <p>No active agents.</p> : (
          <ul>{activeRuns.map((run) => (
            <li key={run.attemptId}>
              <a
                className="secondary"
                href={`/tasks/${encodeURIComponent(run.taskId)}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {run.agentId} · {run.taskId} · {run.boardName} / {run.columnName} · {run.status} ·{" "}
                {run.executionStarted === false || run.status === "starting" ? (run.status === "interrupting" ? "Stopping startup" : "Starting agent") : <ElapsedTime startedAt={run.startedAt} />}
              </a>
            </li>
          ))}</ul>
        )}
        {workspacePreparations.length === 0 ? null : <>
          <p>Preparing workspaces · {workspacePreparations.length}</p>
          <ul>{workspacePreparations.map((preparation) => <li key={preparation.taskId}>
            <a href={`/tasks/${encodeURIComponent(preparation.taskId)}`}>{preparation.taskId}</a>
            <WorkspacePreparation preparation={preparation} />
          </li>)}</ul>
        </>}
      </details>
      <button className="topbar-control settings-action"
        aria-label={notifications.deliveryMismatch ? "Settings, notifications need attention" : "Settings"}
        onClick={() => setSettingsOpen(true)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.1-1.2 2-1.6-2-3.4-2.4 1a8.7 8.7 0 0 0-2-1.2L15.2 3h-4l-.4 2.6a8.7 8.7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6A8 8 0 0 0 6.3 12c0 .4 0 .8.1 1.2l-2 1.6 2 3.4 2.4-1c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6a8.7 8.7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6.1-.4.1-.8V12Z" /></svg>
        <span>Settings</span>{notifications.deliveryMismatch ? <span className="warning-badge" aria-hidden="true">!</span> : null}
      </button>
      {settingsOpen ? <SettingsDialog notifications={notifications} onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

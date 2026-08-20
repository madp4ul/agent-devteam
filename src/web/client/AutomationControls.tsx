import { useState, type ReactNode } from "react";

import type { ActiveRunView, AutomationView } from "../../application/browser-transport-contract.ts";
import { pauseAutomation, resumeAutomation } from "./api.ts";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage, type Feedback } from "./feedback.ts";
import { SettingsDialog } from "./SettingsDialog.tsx";

export function AutomationControls({
  automation,
  activeRuns,
  canResume = true,
  notifications,
  onChanged,
  onFeedback,
  onOpenTask,
}: {
  automation: AutomationView;
  activeRuns: ActiveRunView[];
  canResume?: boolean;
  notifications: DesktopNotificationControl;
  onChanged(): Promise<void>;
  onFeedback(feedback: Feedback): void;
  onOpenTask(taskId: string, boardId: string): void;
}): ReactNode {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const reportFailure = (error: unknown): void => onFeedback({ role: "alert", text: errorMessage(error) });

  return (
    <div className="automation-control">
      {automation.state === "paused" ? (
        <button className="topbar-control automation-status-action" disabled={!canResume}
          onClick={() => void resumeAutomation().then(onChanged).catch(reportFailure)}>
          <span className="status-dot paused" aria-hidden="true" /> Resume
        </button>
      ) : null}
      {automation.state === "running" || automation.state === "pausing" ? (
        <button className="topbar-control automation-status-action" disabled={automation.state === "pausing"}
          onClick={() => void pauseAutomation().then(onChanged).catch(reportFailure)}>
          <span className={`status-dot ${automation.state}`} aria-hidden="true" />
          {automation.state === "pausing" ? "Pausing…" : "Pause"}
        </button>
      ) : null}
      <details className="live-runs">
        <summary className="topbar-control">Current runs · {activeRuns.length}</summary>
        {activeRuns.length === 0 ? <p>No active agents.</p> : (
          <ul>{activeRuns.map((run) => (
            <li key={run.attemptId}>
              <button className="secondary" onClick={() => onOpenTask(run.taskId, run.boardId)}>
                {run.agentId} · {run.taskId} · {run.boardName} / {run.columnName} · {run.status} ·{" "}
                <ElapsedTime startedAt={run.startedAt} />
              </button>
            </li>
          ))}</ul>
        )}
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

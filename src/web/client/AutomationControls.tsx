import type { ReactNode } from "react";

import type { ActiveRunView, AutomationView } from "../../application/coordination-contract.ts";
import { pauseAutomation, resumeAutomation } from "./api.ts";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage, type Feedback } from "./feedback.ts";
import { ThemeControl } from "./ThemeControl.tsx";

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
  const reportFailure = (error: unknown): void => onFeedback({ role: "alert", text: errorMessage(error) });

  return (
    <div className="automation-control">
      <span className={`status-dot ${automation.state}`} aria-hidden="true" />
      <span>Automation {automation.state}</span>
      {automation.state === "paused" && canResume ? (
        <button
          className="secondary"
          onClick={() => void resumeAutomation().then(onChanged).catch(reportFailure)}
        >
          Resume
        </button>
      ) : null}
      {automation.state === "running" || automation.state === "pausing" ? (
        <button
          className="secondary"
          disabled={automation.state === "pausing"}
          onClick={() => void pauseAutomation().then(onChanged).catch(reportFailure)}
        >
          {automation.state === "pausing" ? "Draining active runs…" : "Pause"}
        </button>
      ) : null}
      {automation.state === "paused" ? <span>No agents are changing boards.</span> : null}
      <details className="live-runs">
        <summary>Current runs · {activeRuns.length}</summary>
        {activeRuns.length === 0 ? <p>No active agents.</p> : (
          <ul>
            {activeRuns.map((run) => (
              <li key={run.attemptId}>
                <button className="secondary" onClick={() => onOpenTask(run.taskId, run.boardId)}>
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
      <ThemeControl />
    </div>
  );
}

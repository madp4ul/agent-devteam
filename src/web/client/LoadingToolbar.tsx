import { useEffect, useState } from "react";
import { AutomationControls } from "./AutomationControls.tsx";
import { readBoard, type BrowserBoardState } from "./api.ts";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import type { Feedback } from "./feedback.ts";
import { useLatestRefresh, usePolling } from "./live-refresh.ts";

/** Keep project controls reachable while the requested page is slow or unavailable. */
export function LoadingToolbar({ notifications, onFeedback, loadProjectState = true }: {
  notifications: DesktopNotificationControl; onFeedback(feedback: Feedback): void;
  loadProjectState?: boolean;
}) {
  const [board, setBoard] = useState<BrowserBoardState>();
  const refresh = useLatestRefresh(readBoard, setBoard);
  useEffect(() => { if (loadProjectState) void refresh().catch(() => {}); }, [refresh, loadProjectState]);
  usePolling(refresh, loadProjectState ? 1000 : undefined, () => {});
  return <header className="topbar detail-topbar">
    <div className="task-header-context"><a href="/" className="back-link">Back to board</a></div>
    <AutomationControls automation={board?.automation ?? { state: "blocked", attemptsMayStart: false }}
      activeRuns={board?.activeRuns ?? []} workspacePreparations={board?.workspacePreparations ?? []}
      canResume={board?.startup.mode === "paused" &&
        (board.startup.processImpact?.staleActivations.length ?? 0) === 0 &&
        (board.startup.processImpact?.unavailableResumeAssignments.length ?? 0) === 0 &&
        (board.startup.processImpact?.unavailableResourceAssignments?.length ?? 0) === 0}
      notifications={notifications} onChanged={refresh} onFeedback={onFeedback} />
  </header>;
}

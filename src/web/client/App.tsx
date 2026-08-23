import { useCallback, useEffect, useState, type ReactNode } from "react";

import { BoardPage } from "./BoardPage.tsx";
import { useDesktopNotifications } from "./desktop-notifications.ts";
import type { Navigate, NavigationState } from "./navigation.ts";
import { TaskPage } from "./TaskPage.tsx";
import { NotificationConsentDialog } from "./SettingsDialog.tsx";
import { useThemePreference } from "./ThemeControl.tsx";

export function App(): ReactNode {
  useThemePreference();
  const [locationKey, setLocationKey] = useState(0);
  useEffect(() => {
    const preventFileNavigation = (event: DragEvent): void => {
      if (
        (event.dataTransfer?.files.length ?? 0) > 0 ||
        Array.from(event.dataTransfer?.types ?? []).includes("Files")
      ) event.preventDefault();
    };
    window.addEventListener("dragover", preventFileNavigation);
    window.addEventListener("drop", preventFileNavigation);
    return () => {
      window.removeEventListener("dragover", preventFileNavigation);
      window.removeEventListener("drop", preventFileNavigation);
    };
  }, []);
  useEffect(() => {
    const onPopState = (): void => setLocationKey((value) => value + 1);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback<Navigate>((path: string, state?: NavigationState) => {
    window.history.pushState(state ?? {}, "", path);
    setLocationKey((value) => value + 1);
  }, []);
  const notifications = useDesktopNotifications(navigate);
  const taskMatch = /^\/tasks\/([^/]+)$/.exec(window.location.pathname);
  return <>
    {taskMatch?.[1] === undefined ? (
      <BoardPage key={`board-${locationKey}`} navigate={navigate} notifications={notifications} />
    ) : (
      <TaskPage key={`task-${locationKey}`} taskId={decodeURIComponent(taskMatch[1])}
        navigate={navigate} notifications={notifications} />
    )}
    <NotificationConsentDialog notifications={notifications} />
  </>;
}

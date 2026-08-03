import { useCallback, useEffect, useState, type ReactNode } from "react";

import { BoardPage } from "./BoardPage.tsx";
import type { Navigate, NavigationState } from "./navigation.ts";
import { TaskPage } from "./TaskPage.tsx";

export function App(): ReactNode {
  const [locationKey, setLocationKey] = useState(0);
  useEffect(() => {
    const onPopState = (): void => setLocationKey((value) => value + 1);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback<Navigate>((path: string, state?: NavigationState) => {
    window.history.pushState(state ?? {}, "", path);
    setLocationKey((value) => value + 1);
  }, []);
  const taskMatch = /^\/tasks\/([^/]+)$/.exec(window.location.pathname);
  return taskMatch?.[1] === undefined ? (
    <BoardPage key={`board-${locationKey}`} navigate={navigate} />
  ) : (
    <TaskPage
      key={`task-${locationKey}`}
      taskId={decodeURIComponent(taskMatch[1])}
      navigate={navigate}
    />
  );
}

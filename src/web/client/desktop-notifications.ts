import { useCallback, useEffect, useRef, useState } from "react";

import { readBoard } from "./api.ts";
import type { Navigate } from "./navigation.ts";

const settingKey = "coordination.desktop-notifications.enabled";

export interface DesktopNotificationControl {
  available: boolean;
  enabled: boolean;
  permission: NotificationPermission | "unavailable";
  toggle(): Promise<void>;
}

export function useDesktopNotifications(navigate: Navigate): DesktopNotificationControl {
  const available = "Notification" in window;
  const [enabled, setEnabled] = useState(
    () =>
      available &&
      Notification.permission === "granted" &&
      localStorage.getItem(settingKey) === "true",
  );
  const [permission, setPermission] = useState<NotificationPermission | "unavailable">(
    () => available ? Notification.permission : "unavailable",
  );
  const seen = useRef(new Set<string>());
  const initialized = useRef(false);

  const observe = useCallback(async (deliver: boolean): Promise<void> => {
    const state = await readBoard();
    const activeTaskId = /^\/tasks\/([^/]+)$/.exec(window.location.pathname)?.[1];
    for (const group of state.attention) {
      for (const reason of group.reasons) {
        if (seen.current.has(reason.id)) continue;
        seen.current.add(reason.id);
        if (!initialized.current || !deliver || decodeURIComponent(activeTaskId ?? "") === group.task.id) {
          continue;
        }
        try {
          const notification = new Notification(
            `${group.task.boardName} · ${group.task.id}`,
            { body: `${group.task.title} · ${reason.type.replaceAll("-", " ")}`, tag: reason.id },
          );
          notification.onclick = () => {
            window.focus();
            navigate(
              `/tasks/${encodeURIComponent(group.task.id)}?attention=${encodeURIComponent(reason.id)}`,
            );
            notification.close();
          };
        } catch {
          // Delivery is best-effort; the durable board reason remains authoritative.
        }
      }
    }
    initialized.current = true;
  }, [navigate]);

  useEffect(() => {
    let disposed = false;
    const poll = async (): Promise<void> => {
      if (disposed) return;
      try {
        await observe(enabled && permission === "granted");
      } catch {
        // A polling or delivery failure cannot alter authoritative attention state.
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [enabled, observe, permission]);

  const toggle = useCallback(async (): Promise<void> => {
    if (!available) return;
    if (enabled) {
      localStorage.setItem(settingKey, "false");
      setEnabled(false);
      return;
    }
    await observe(false);
    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission === "granted") {
      localStorage.setItem(settingKey, "true");
      setEnabled(true);
    }
  }, [available, enabled, observe]);

  return { available, enabled, permission, toggle };
}

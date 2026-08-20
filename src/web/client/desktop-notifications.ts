import { useCallback, useEffect, useRef, useState } from "react";

import type {
  NotificationPolicyView,
  UpdateNotificationPolicyCommand,
} from "../../application/browser-transport-contract.ts";
import {
  readNotificationOccurrences,
  readNotificationPolicy,
  updateNotificationPolicy,
} from "./api.ts";
import type { Navigate } from "./navigation.ts";

const consentKey = "coordination.desktop-notifications.consent";

export type BrowserNotificationState =
  | "granted"
  | "locally-declined"
  | "denied"
  | "unsupported"
  | "eligible";

export interface DesktopNotificationControl {
  policy: NotificationPolicyView | undefined;
  browserState: BrowserNotificationState;
  consentPromptOpen: boolean;
  deliveryMismatch: boolean;
  updatePolicy(change: UpdateNotificationPolicyCommand["change"]): Promise<void>;
  allow(): Promise<void>;
  decline(): void;
}

export function useDesktopNotifications(navigate: Navigate): DesktopNotificationControl {
  const available = "Notification" in window;
  const [policy, setPolicy] = useState<NotificationPolicyView>();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => available ? Notification.permission : "unsupported",
  );
  const [consent, setConsent] = useState<"accepted" | "declined" | null>(() => {
    const stored = localStorage.getItem(consentKey);
    return stored === "accepted" || stored === "declined" ? stored : null;
  });
  const cursor = useRef<number | undefined>(undefined);

  useEffect(() => {
    void readNotificationPolicy().then(setPolicy);
  }, []);

  const browserState: BrowserNotificationState = permission === "unsupported"
    ? "unsupported"
    : permission === "granted"
      ? "granted"
      : permission === "denied"
        ? "denied"
        : consent === "declined"
          ? "locally-declined"
          : "eligible";
  const consentPromptOpen = policy?.enabled === true && browserState === "eligible" && consent === null;
  const canDeliver = browserState === "granted";

  const observe = useCallback(async (): Promise<void> => {
    const batch = await readNotificationOccurrences(cursor.current);
    cursor.current = batch.cursor;
    const currentPermission = available ? Notification.permission : "unsupported";
    if (currentPermission !== permission) setPermission(currentPermission);
    if (currentPermission !== "granted") return;
    for (const occurrence of batch.occurrences) {
      try {
        const reason = occurrence.type === "column-entry"
          ? `entered ${occurrence.destination?.columnName ?? "a workflow column"}`
          : occurrence.type === "user-mention"
            ? "mentioned you"
            : "agent run failed";
        const notification = new Notification(
          `${occurrence.task.boardName} · ${occurrence.task.id}`,
          { body: `${occurrence.task.title} · ${reason}`, tag: occurrence.id },
        );
        notification.onclick = () => {
          window.focus();
          const attention = occurrence.attentionReasonId === undefined
            ? ""
            : `?attention=${encodeURIComponent(occurrence.attentionReasonId)}`;
          navigate(`/tasks/${encodeURIComponent(occurrence.task.id)}${attention}`);
          notification.close();
        };
      } catch {
        // Delivery is best-effort and each occurrence is attempted only once by this tab.
      }
    }
  }, [available, navigate, permission]);

  useEffect(() => {
    let disposed = false;
    const poll = async (): Promise<void> => {
      if (disposed) return;
      try {
        await observe();
      } catch {
        // Polling cannot alter authoritative occurrence or attention state.
      }
    };
    void poll();
    const interval = window.setInterval(() => void poll(), 1_500);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [observe]);

  const allow = useCallback(async (): Promise<void> => {
    if (!available) return;
    localStorage.setItem(consentKey, "accepted");
    setConsent("accepted");
    const next = await Notification.requestPermission();
    setPermission(next);
  }, [available]);

  const decline = useCallback((): void => {
    localStorage.setItem(consentKey, "declined");
    setConsent("declined");
  }, []);

  const changePolicy = useCallback(async (
    change: UpdateNotificationPolicyCommand["change"],
  ): Promise<void> => {
    setPolicy((current) => current === undefined ? current : applyPolicyChange(current, change));
    try {
      const authoritative = await updateNotificationPolicy(change);
      setPolicy(authoritative);
    } catch (error) {
      setPolicy(await readNotificationPolicy());
      throw error;
    }
  }, []);

  return {
    policy,
    browserState,
    consentPromptOpen,
    deliveryMismatch: policy?.enabled === true && !canDeliver,
    updatePolicy: changePolicy,
    allow,
    decline,
  };
}

function applyPolicyChange(
  policy: NotificationPolicyView,
  change: UpdateNotificationPolicyCommand["change"],
): NotificationPolicyView {
  if (change.type === "global") return { ...policy, enabled: change.enabled };
  if (change.type === "cause") {
    return {
      ...policy,
      causes: {
        ...policy.causes,
        [change.cause === "user-mention" ? "userMention" : "failedRun"]: change.enabled,
      },
    };
  }
  return {
    ...policy,
    boards: policy.boards.map((board) => board.id !== change.boardId ? board : ({
      ...board,
      columns: board.columns.map((column) => column.id === change.columnId
        ? { ...column, enabled: change.enabled }
        : column),
    })),
  };
}

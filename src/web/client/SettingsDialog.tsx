import { useEffect, useRef, useState, type ReactNode } from "react";

import type { UpdateNotificationPolicyCommand } from "../../application/coordination-contract.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { errorMessage } from "./feedback.ts";
import { ThemeControl } from "./ThemeControl.tsx";

export function SettingsDialog({ notifications, onClose }: {
  notifications: DesktopNotificationControl;
  onClose(): void;
}): ReactNode {
  const [category, setCategory] = useState<"notifications" | "appearance">("notifications");
  const [error, setError] = useState<string>();
  const firstCategory = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    firstCategory.current?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const focusable = [...(dialog.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [])];
        const first = focusable[0];
        const last = focusable.at(-1);
        if (first === undefined || last === undefined) return;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault(); first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const change = (policyChange: UpdateNotificationPolicyCommand["change"]): void => {
    setError(undefined);
    void notifications.updatePolicy(policyChange).catch((caught) => setError(errorMessage(caught)));
  };
  const policy = notifications.policy;
  return (
    <div className="modal-backdrop settings-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section ref={dialog} className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-heading">
          <div><p className="eyebrow">Process and browser preferences</p><h2 id="settings-title">Settings</h2></div>
          <CloseIconButton label="Close settings" onClick={onClose} />
        </header>
        <div className="settings-layout">
          <nav className="settings-categories" aria-label="Settings categories">
            <button ref={firstCategory} aria-current={category === "notifications" ? "page" : undefined}
              onClick={() => setCategory("notifications")}>Notifications</button>
            <button aria-current={category === "appearance" ? "page" : undefined}
              onClick={() => setCategory("appearance")}>Appearance</button>
          </nav>
          <div className="settings-content">
            {category === "appearance" ? (
              <section aria-labelledby="appearance-settings-heading">
                <h3 id="appearance-settings-heading">Appearance</h3>
                <p>Stored in this browser and shared across projects.</p>
                <ThemeControl />
              </section>
            ) : (
              <section aria-labelledby="notification-settings-heading">
                <h3 id="notification-settings-heading">Notifications</h3>
                {policy === undefined ? <p>Loading notification policy…</p> : (
                  <>
                    <SettingToggle label="Enable shared notifications" checked={policy.enabled}
                      onChange={(enabled) => change({ type: "global", enabled })} />
                    <fieldset className="notification-causes">
                      <legend>Causes</legend>
                      <SettingToggle label="Agent mentions you" checked={policy.causes.userMention}
                        onChange={(enabled) => change({ type: "cause", cause: "user-mention", enabled })} />
                      <SettingToggle label="Agent run failures" checked={policy.causes.failedRun}
                        onChange={(enabled) => change({ type: "cause", cause: "failed-run", enabled })} />
                    </fieldset>
                    <div>
                      <h4>Column entry</h4>
                      {policy.boards.map((board) => (
                        <fieldset key={board.id}>
                          <legend>{board.name}</legend>
                          {board.columns.map((column) => (
                            <SettingToggle key={column.id} label={column.name} checked={column.enabled}
                              onChange={(enabled) => change({
                                type: "column", boardId: board.id, columnId: column.id, enabled,
                              })} />
                          ))}
                        </fieldset>
                      ))}
                    </div>
                    <BrowserDelivery notifications={notifications} />
                  </>
                )}
                {error === undefined ? null : <p className="feedback alert" role="alert">{error}</p>}
              </section>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

export function NotificationConsentDialog({ notifications }: {
  notifications: DesktopNotificationControl;
}): ReactNode {
  if (!notifications.consentPromptOpen) return null;
  return (
    <div className="modal-backdrop consent-backdrop" role="presentation">
      <section className="modal consent-modal" role="dialog" aria-modal="true" aria-labelledby="consent-title">
        <h2 id="consent-title">Allow desktop notifications?</h2>
        <p>This browser can show enabled process notifications while an application tab is open.</p>
        <div className="dialog-actions">
          <button autoFocus onClick={() => void notifications.allow()}>Yes, ask browser</button>
          <button className="secondary" onClick={notifications.decline}>No</button>
        </div>
      </section>
    </div>
  );
}

function SettingToggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange(checked: boolean): void;
}): ReactNode {
  return <label className="setting-toggle"><input type="checkbox" checked={checked}
    onChange={(event) => onChange(event.currentTarget.checked)} /><span>{label}</span></label>;
}

function BrowserDelivery({ notifications }: { notifications: DesktopNotificationControl }): ReactNode {
  const copy = {
    granted: "This browser is allowed to deliver notifications.",
    "locally-declined": "This browser was locally declined. Shared policy is unchanged.",
    denied: "Notifications are denied or revoked. Use browser controls to allow them again.",
    unsupported: "This browser does not support desktop notifications.",
    eligible: "This browser is still eligible to ask for notification permission.",
  }[notifications.browserState];
  return <section className="browser-delivery" aria-labelledby="browser-delivery-heading">
    <h4 id="browser-delivery-heading">This browser</h4><p>{copy}</p>
    {notifications.browserState === "eligible" || notifications.browserState === "locally-declined"
      ? <button className="secondary" onClick={() => void notifications.allow()}>Allow notifications</button>
      : null}
  </section>;
}

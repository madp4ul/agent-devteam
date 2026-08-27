import { useEffect, useRef, useState, type ReactNode } from "react";

import type {
  ProcessCostStatisticsView,
  UpdateNotificationPolicyCommand,
} from "../../application/browser-transport-contract.ts";
import { readProcessCostStatistics } from "./api.ts";
import { CloseIconButton } from "./CloseIconButton.tsx";
import type { DesktopNotificationControl } from "./desktop-notifications.ts";
import { errorMessage } from "./feedback.ts";
import { Modal } from "./Modal.tsx";
import { ThemeControl } from "./ThemeControl.tsx";

export function SettingsDialog({ notifications, onClose }: {
  notifications: DesktopNotificationControl;
  onClose(): void;
}): ReactNode {
  const [category, setCategory] = useState<"notifications" | "appearance" | "cost-statistics">("notifications");
  const [error, setError] = useState<string>();
  const firstCategory = useRef<HTMLButtonElement>(null);

  const change = (policyChange: UpdateNotificationPolicyCommand["change"]): void => {
    setError(undefined);
    void notifications.updatePolicy(policyChange).catch((caught) => setError(errorMessage(caught)));
  };
  const policy = notifications.policy;
  return (
    <Modal
      labelledBy="settings-title"
      className="settings-modal"
      backdropClassName="settings-backdrop"
      initialFocusRef={firstCategory}
      onClose={onClose}
    >
        <header className="modal-heading">
          <h2 id="settings-title">Settings</h2>
          <CloseIconButton label="Close settings" onClick={onClose} />
        </header>
        <div className="settings-layout">
          <nav className="settings-categories" aria-label="Settings categories">
            <button ref={firstCategory} aria-current={category === "notifications" ? "page" : undefined}
              onClick={() => setCategory("notifications")}>Notifications</button>
            <button aria-current={category === "appearance" ? "page" : undefined}
              onClick={() => setCategory("appearance")}>Appearance</button>
            <button aria-current={category === "cost-statistics" ? "page" : undefined}
              onClick={() => setCategory("cost-statistics")}>Cost statistics</button>
          </nav>
          <div className="settings-content">
            {category === "cost-statistics" ? <CostStatisticsSection /> : category === "appearance" ? (
              <section>
                <p>Stored in this browser and shared across projects.</p>
                <ThemeControl />
              </section>
            ) : (
              <section>
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
    </Modal>
  );
}

function CostStatisticsSection(): ReactNode {
  const [statistics, setStatistics] = useState<ProcessCostStatisticsView>();
  const [loadError, setLoadError] = useState<string>();
  useEffect(() => {
    let current = true;
    void readProcessCostStatistics()
      .then((loaded) => {
        if (current) setStatistics(loaded);
      })
      .catch((caught) => {
        if (current) setLoadError(errorMessage(caught));
      });
    return () => { current = false; };
  }, []);

  return (
    <section>
      {loadError === undefined ? null : <p className="feedback alert" role="alert">{loadError}</p>}
      {statistics === undefined && loadError === undefined ? <p>Loading cost statistics…</p> : null}
      {statistics === undefined ? null : (
        <>
          <dl className="cost-statistics-summary" aria-label="Accumulated cost summary">
            <div className="cost-statistic-primary">
              <dt>Total cost</dt>
              <dd>{statistics.totalCostEstimate === undefined
                ? "Not yet available"
                : `${statistics.hasUnpricedSettledRuns ? "≥" : ""}${formatStatisticUsd(statistics.totalCostEstimate.amount)}`}</dd>
            </div>
            <div>
              <dt>Tasks</dt>
              <dd>{statistics.contributingTaskCount}</dd>
            </div>
            <div>
              <dt>AVG cost per task</dt>
              <dd>{statistics.averageCostPerContributingTask === undefined
                ? "—"
                : formatStatisticUsd(statistics.averageCostPerContributingTask.amount)}</dd>
            </div>
          </dl>
          {statistics.costPending ? (
            <p className="cost-statistics-note cost-statistics-pending" role="status">
              Running work may add cost when its usage becomes available.
            </p>
          ) : null}
          {statistics.hasUnpricedSettledRuns ? (
            <p className="cost-statistics-note">
              This is a known-cost lower bound because one or more settled runs have no priceable usage.
              The average covers only the tasks counted as having priced usage.
            </p>
          ) : null}
          <section className="configured-rates" aria-labelledby="configured-rates-heading">
            <h4 id="configured-rates-heading">Configured model rates</h4>
            <p>Current USD price per one million tokens.</p>
            {statistics.configuredModelPrices.length === 0 ? (
              <p className="cost-statistics-empty">No model prices are configured in the loaded process.</p>
            ) : (
              <div className="cost-rate-table-scroll">
                <table aria-label="Configured model rates">
                  <thead><tr>
                    <th scope="col">Model</th>
                    <th scope="col">Input</th>
                    <th scope="col">Cached input</th>
                    <th scope="col">Cache write</th>
                    <th scope="col">Output</th>
                  </tr></thead>
                  <tbody>{statistics.configuredModelPrices.map(({ model, usdPerMillionTokens }) => (
                    <tr key={model}>
                      <th scope="row"><code>{model}</code></th>
                      <td>{formatRate(usdPerMillionTokens.input)}</td>
                      <td>{formatRate(usdPerMillionTokens.cachedInput)}</td>
                      <td>{formatRate(usdPerMillionTokens.cacheWriteInput)}</td>
                      <td>{formatRate(usdPerMillionTokens.output)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}

function formatStatisticUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(amount);
}

function formatRate(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

export function NotificationConsentDialog({ notifications }: {
  notifications: DesktopNotificationControl;
}): ReactNode {
  if (!notifications.consentPromptOpen) return null;
  return (
    <Modal
      labelledBy="consent-title"
      className="consent-modal"
      backdropClassName="consent-backdrop"
      onClose={notifications.decline}
    >
        <h2 id="consent-title">Allow desktop notifications?</h2>
        <p>This browser can show enabled process notifications while an application tab is open.</p>
        <div className="dialog-actions">
          <button autoFocus onClick={() => void notifications.allow()}>Yes, ask browser</button>
          <button className="secondary" onClick={notifications.decline}>No</button>
        </div>
    </Modal>
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

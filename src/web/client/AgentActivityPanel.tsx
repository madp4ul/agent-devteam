import { useState, type ReactNode } from "react";

import type {
  ActiveRunView,
  ActivationView,
  AutomationView,
  CollaboratorView,
  UserTaskInspectionView,
} from "../../application/browser-transport-contract.ts";
import { dismissActivation, interruptTask } from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";
import { Modal } from "./Modal.tsx";

interface AgentActivityState {
  taskId: string;
  automation: AutomationView;
  collaborators: CollaboratorView[];
  inspection: UserTaskInspectionView;
  activeRun: ActiveRunView | null;
  activations: ActivationView[];
}

export function AgentActivityPanel({
  state,
  onChanged,
  onFeedback,
}: {
  state: AgentActivityState;
  onChanged(): Promise<void>;
  onFeedback(feedback: { role: "status" | "alert"; text: string }): void;
}): ReactNode {
  const [waitingReasonsExpanded, setWaitingReasonsExpanded] = useState(false);
  const [dismissal, setDismissal] = useState<ActivationView | null>(null);
  const [dismissalPending, setDismissalPending] = useState(false);
  const names = new Map(state.collaborators.map((agent) => [agent.id, agent.name]));
  const agentName = (id: string): string => names.get(id) ?? id;
  const queued = state.activations.filter((activation) => activation.status === "queued");
  const interruptedCurrent = state.inspection.currentActivation?.state === "interrupted"
    ? state.inspection.currentActivation
    : null;
  const laterQueued = interruptedCurrent === null
    ? queued
    : queued.filter((activation) => activation.id !== interruptedCurrent.id);
  const waitingReasons = waitingReasonsFor(state);
  const hasWaitingWork = queued.length > 0 || state.inspection.run.status === "failed" ||
    state.inspection.automationSuspended ||
    state.activations.some((activation) => activation.recovery !== null);
  const isIdle = state.activeRun === null && !hasWaitingWork &&
    state.inspection.unresolvedAttention.length === 0;

  return (
    <section
      className={`detail-panel agent-activity-panel${isIdle ? " idle" : ""}`}
      aria-labelledby="agent-activity-heading"
    >
      <h2 id="agent-activity-heading">Agent activity</h2>

      {state.activeRun !== null ? (
        <div className="activity-current running">
          <div>
            <strong>{agentName(state.activeRun.agentId)}</strong>
            <span>Running · <ElapsedTime startedAt={state.activeRun.startedAt} /></span>
          </div>
          <button
            disabled={state.activeRun.status === "interrupting"}
            onClick={() => {
              onFeedback({ role: "status", text: `Interrupting ${state.taskId}…` });
              void interruptTask(state.taskId, crypto.randomUUID())
                .then(async () => {
                  await onChanged();
                  onFeedback({ role: "status", text: `Interrupted ${state.taskId}. Automation is suspended.` });
                })
                .catch((error) => onFeedback({ role: "alert", text: errorMessage(error) }));
            }}
          >
            {state.activeRun.status === "interrupting" ? (
              <><span className="activity-spinner" aria-hidden="true" /> Interrupting…</>
            ) : "Interrupt current attempt"}
          </button>
        </div>
      ) : interruptedCurrent !== null ? (
        <div className="activity-current waiting interrupted">
          <div>
            <strong>{agentName(interruptedCurrent.targetAgentId)}</strong>
            <span>Interrupted · awaiting your decision</span>
          </div>
        </div>
      ) : hasWaitingWork && waitingReasons.length > 0 ? (
        <div className="activity-current waiting">
          <div>
            <strong>{waitingReasons[0]}</strong>
            <span>Waiting</span>
          </div>
          {waitingReasons.length > 1 ? (
            <details
              className="waiting-reasons"
              open={waitingReasonsExpanded}
              onToggle={(event) => setWaitingReasonsExpanded(event.currentTarget.open)}
            >
              <summary>{waitingReasons.length - 1} more {waitingReasons.length === 2 ? "reason" : "reasons"}</summary>
              <ul>{waitingReasons.slice(1).map((reason) => <li key={reason}>{reason}</li>)}</ul>
            </details>
          ) : null}
        </div>
      ) : null}

      {laterQueued.length === 0 ? (
        state.activeRun === null && (!hasWaitingWork || waitingReasons.length === 0)
          ? <p className="quiet">No agent work is running or queued.</p>
          : null
      ) : (
        <div className="activation-queue">
          <h3>Activation queue</h3>
          <ol>
            {laterQueued.map((activation) => (
              <li key={activation.id}>
                <div>
                  <strong>{agentName(activation.targetAgentId)}</strong>
                  <span>Activated by {activationReasonLabel(activation).toLocaleLowerCase()}</span>
                </div>
                {activation.dismissal != null ? (
                  <button
                    type="button"
                    className="activation-dismiss"
                    aria-label={`Dismiss activation for ${agentName(activation.targetAgentId)}`}
                    title={`Dismiss activation for ${agentName(activation.targetAgentId)}`}
                    onClick={() => setDismissal(activation)}
                  >
                    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
                      <path d="M5 5l10 10M15 5L5 15" />
                    </svg>
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        </div>
      )}

      {dismissal !== null ? (
        <DismissActivationConfirmation
          activation={dismissal}
          agentName={agentName(dismissal.targetAgentId)}
          mayStartNext={dismissal.dismissal?.mayStartNext === true}
          pending={dismissalPending}
          onCancel={() => setDismissal(null)}
          onConfirm={() => {
            setDismissalPending(true);
            void dismissActivation(dismissal.id, crypto.randomUUID())
              .then(async () => {
                setDismissal(null);
                await onChanged();
                onFeedback({ role: "status", text: `Dismissed activation for ${agentName(dismissal.targetAgentId)}.` });
              })
              .catch(async (error) => {
                setDismissal(null);
                await onChanged();
                onFeedback({ role: "alert", text: errorMessage(error) });
              })
              .finally(() => setDismissalPending(false));
          }}
        />
      ) : null}
    </section>
  );
}

function waitingReasonsFor(state: AgentActivityState): string[] {
  const reasons: string[] = [];
  if (state.inspection.automationSuspended) reasons.push("Task automation is suspended");
  if (state.inspection.blocking.blocked) {
    reasons.push(`Blocked by ${state.inspection.blocking.blockerTaskIds.join(", ")}`);
  }
  const scheduled = state.activations.find((activation) => activation.recovery?.state === "scheduled");
  if (scheduled?.recovery?.state === "scheduled") {
    reasons.push(`Retry scheduled for ${new Date(scheduled.recovery.dueAt).toLocaleString()}`);
  }
  const recovery = state.activations.find(
    (activation) => activation.recovery?.state === "awaiting-retry" ||
      activation.recovery?.state === "permission-blocked",
  )?.recovery;
  if (recovery?.state === "awaiting-retry") reasons.push("Failed activation needs retry or dismissal");
  if (recovery?.state === "permission-blocked") reasons.push("Permission-blocked activation needs continuation");
  if (state.automation.state !== "running") {
    reasons.push(state.automation.state === "pausing"
      ? "Process automation is pausing"
      : state.automation.state === "blocked"
        ? "Process automation is unavailable"
        : "Process automation is paused");
  }
  if (state.activations.some((activation) => activation.status === "queued" && activation.stale)) {
    reasons.push("Queued work needs process-change approval");
  }
  const startupFailure = state.activations.find(
    (activation) => activation.startupFailure !== null && activation.startupFailure.resolvedAt === null,
  );
  if (startupFailure?.startupFailure !== null && startupFailure?.startupFailure !== undefined) {
    reasons.push(`Startup failed at ${startupFailure.startupFailure.boundary}`);
  }
  return reasons;
}

function activationReasonLabel(activation: ActivationView): string {
  if (activation.reason.type === "column-entry") return "Column entry";
  if (activation.reason.type === "blockers-cleared") return "Blockers cleared";
  return "Mentioned in a comment";
}

function DismissActivationConfirmation({
  activation,
  agentName,
  mayStartNext,
  pending,
  onCancel,
  onConfirm,
}: {
  activation: ActivationView;
  agentName: string;
  mayStartNext: boolean;
  pending: boolean;
  onCancel(): void;
  onConfirm(): void;
}): ReactNode {
  return (
    <Modal labelledBy="dismiss-activation-title" onClose={onCancel}>
        <h2 id="dismiss-activation-title">Dismiss activation?</h2>
        <p>
          Dismiss the activation for <strong>{agentName}</strong>, activated by {activationReasonLabel(activation).toLocaleLowerCase()}?
          It will never run again, but the decision and original activation remain in task history.
        </p>
        <p>
          {mayStartNext
            ? "The next queued activation may start immediately."
            : "Every other activation keeps its current order and eligibility."}
        </p>
        <div className="form-actions">
          <button type="button" className="secondary" autoFocus disabled={pending} onClick={onCancel}>Cancel</button>
          <button type="button" className="destructive" disabled={pending} onClick={onConfirm}>
            {pending ? "Dismissing…" : "Dismiss activation"}
          </button>
        </div>
    </Modal>
  );
}

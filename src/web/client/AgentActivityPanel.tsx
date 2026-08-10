import { useState, type ReactNode } from "react";

import type {
  ActiveRunView,
  ActivationView,
  AutomationView,
  CollaboratorView,
  TaskAttentionView,
  UserTaskInspectionView,
} from "../../application/coordination-contract.ts";
import { AttentionReasonResolution } from "./AttentionReasonAction.tsx";
import { continueInterruptedTask, interruptTask } from "./api.ts";
import { ElapsedTime } from "./ElapsedTime.tsx";
import { errorMessage } from "./feedback.ts";

interface AgentActivityState {
  taskId: string;
  automation: AutomationView;
  collaborators: CollaboratorView[];
  inspection: UserTaskInspectionView;
  activeRun: ActiveRunView | null;
  activations: ActivationView[];
  highlightedReasonId: string | null;
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
  const names = new Map(state.collaborators.map((agent) => [agent.id, agent.name]));
  const agentName = (id: string): string => names.get(id) ?? id;
  const queued = state.activations.filter((activation) => activation.status === "queued");
  const waitingReasons = waitingReasonsFor(state);
  const hasWaitingWork = queued.length > 0 || state.inspection.run.status === "failed" ||
    state.inspection.automationSuspended ||
    state.activations.some((activation) => activation.recovery !== null);

  return (
    <section className="detail-panel agent-activity-panel" aria-labelledby="agent-activity-heading">
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
            {state.activeRun.status === "interrupting" ? "Interrupting…" : "Interrupt current attempt"}
          </button>
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

      {state.inspection.automationSuspended ? (
        <ContinueAutomationControl
          taskId={state.taskId}
          onContinued={async () => {
            await onChanged();
            onFeedback({ role: "status", text: `Continued ${state.taskId}.` });
          }}
          onError={(error) => onFeedback({ role: "alert", text: errorMessage(error) })}
        />
      ) : null}

      {queued.length === 0 ? (
        state.activeRun === null && (!hasWaitingWork || waitingReasons.length === 0)
          ? <p className="quiet">No agent work is running or queued.</p>
          : null
      ) : (
        <div className="activation-queue">
          <h3>Activation queue</h3>
          <ol>
            {queued.map((activation) => (
              <li key={activation.id}>
                <strong>{agentName(activation.targetAgentId)}</strong>
                <span>Activation reason: {activationReasonLabel(activation)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <AttentionList
        reasons={state.inspection.unresolvedAttention}
        highlightedReasonId={state.highlightedReasonId}
        onChanged={onChanged}
        onFeedback={onFeedback}
      />
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

function AttentionList({
  reasons,
  highlightedReasonId,
  onChanged,
  onFeedback,
}: {
  reasons: TaskAttentionView[];
  highlightedReasonId: string | null;
  onChanged(): Promise<void>;
  onFeedback(feedback: { role: "status" | "alert"; text: string }): void;
}): ReactNode {
  if (reasons.length === 0) return null;
  return (
    <ul className="attention-list">
      {reasons.map((attention) => (
        <li key={attention.id} className={highlightedReasonId === attention.id ? "highlighted" : ""}>
          <AttentionReasonResolution
            reason={attention}
            labelPrefix="Needs attention: "
            onResolved={onChanged}
            onError={(error) => onFeedback({ role: "alert", text: errorMessage(error) })}
          />
        </li>
      ))}
    </ul>
  );
}

function ContinueAutomationControl({
  taskId,
  onContinued,
  onError,
}: {
  taskId: string;
  onContinued(): Promise<void>;
  onError(error: unknown): void;
}): ReactNode {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="attempt-control">
      <p>Task automation is suspended. The interrupted activation remains first in line.</p>
      <label>
        Continuation message (optional)
        <textarea rows={3} value={message} onChange={(event) => setMessage(event.currentTarget.value)} />
      </label>
      <button
        disabled={pending}
        onClick={() => {
          setPending(true);
          void continueInterruptedTask(taskId, message, crypto.randomUUID())
            .then(onContinued)
            .catch(onError)
            .finally(() => setPending(false));
        }}
      >
        {pending ? "Continuing…" : "Continue interrupted activation"}
      </button>
    </div>
  );
}

import { useState, type ReactNode } from "react";

import type {
  ActivationRecoveryAction,
  TaskAttentionView,
} from "../../application/browser-transport-contract.ts";
import {
  continueInterruptedTask,
  dismissActivation,
  markUserMentionAddressed,
  recoverFailedActivation,
} from "./api.ts";
import { AgentInspectableMarker } from "./AgentInspectableMarker.tsx";
import { Modal } from "./Modal.tsx";

export function MarkUserMentionAddressed({
  attentionReasonId,
  onResolved,
  onError,
}: {
  attentionReasonId: string;
  onResolved(): Promise<void>;
  onError(error: unknown): void;
}): ReactNode {
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const resolve = async (): Promise<void> => {
    setPending(true);
    const resolved = await acknowledgeUserMention(
      attentionReasonId,
      idempotencyKey,
      onResolved,
      onError,
    );
    if (!resolved) setPending(false);
  };
  return (
    <button className="secondary" disabled={pending} onClick={() => void resolve()}>
      {pending ? "Marking addressed…" : "Mark addressed"}
    </button>
  );
}

export async function acknowledgeUserMention(
  attentionReasonId: string,
  idempotencyKey: string,
  onResolved: () => Promise<void>,
  onError: (error: unknown) => void,
): Promise<boolean> {
  try {
    await markUserMentionAddressed(attentionReasonId, idempotencyKey);
    await onResolved();
    return true;
  } catch (error) {
    await onResolved().catch(() => undefined);
    onError(error);
    return false;
  }
}

export function ActivationRecoveryActions({
  attentionReasonId,
  actions,
  recoveryKind,
  onResolved,
  onError,
}: {
  attentionReasonId: string;
  actions: ActivationRecoveryAction[];
  recoveryKind: "technical-failure" | "permission-block";
  onResolved(): Promise<void>;
  onError(error: unknown): void;
}): ReactNode {
  const [idempotencyKeys] = useState(() => new Map(
    actions.map((action) => [action, crypto.randomUUID()]),
  ));
  const [pending, setPending] = useState<string | null>(null);
  const [continuationMessage, setContinuationMessage] = useState("");
  const act = async (action: ActivationRecoveryAction, message?: string): Promise<void> => {
    setPending(action);
    try {
      await recoverFailedActivation(attentionReasonId, action, idempotencyKeys.get(action)!, message);
      await onResolved();
    } catch (error) {
      setPending(null);
      onError(error);
    }
  };
  if (recoveryKind === "permission-block") {
    return (
      <form
        className="permission-continuation"
        onSubmit={(event) => {
          event.preventDefault();
          void act("continue", continuationMessage.trim());
        }}
      >
        <label>
          Authorization or change
          <textarea
            value={continuationMessage}
            onChange={(event) => setContinuationMessage(event.target.value)}
            placeholder="Describe the exact retry you authorize, the managed policy you changed, or the operation you completed externally."
            rows={3}
          />
        </label>
        <button disabled={pending !== null || continuationMessage.trim().length === 0} type="submit">
          {pending === "continue" ? "Continuing…" : "Continue"}
        </button>
      </form>
    );
  }
  return (
    <span className="inline-actions">
      {actions.map((action) => (
        <button
          key={action}
          className={action === "dismiss" ? "secondary" : undefined}
          disabled={pending !== null}
          onClick={() => void act(action)}
        >
          {pending === action ? `${label(action)}…` : label(action)}
        </button>
      ))}
    </span>
  );
}

function label(action: ActivationRecoveryAction): string {
  return action[0]!.toUpperCase() + action.slice(1);
}

export function AttentionReasonResolution({
  reason,
  labelPrefix = "",
  highlighted = false,
  onOpenMention,
  interruption,
  onInterruptionCompleted,
  onResolved,
  onError,
  inspectable = false,
}: {
  reason: TaskAttentionView;
  labelPrefix?: string;
  highlighted?: boolean;
  onOpenMention?: (sourceEventId: string | null) => void;
  interruption?: {
    taskId: string;
    activationId: string;
    agentName: string;
    canDismiss: boolean;
    mayStartNext?: boolean;
    reasonDescription: string;
  };
  onInterruptionCompleted?: (action: "continue" | "dismiss") => void;
  onResolved(): Promise<void>;
  onError(error: unknown): void;
  inspectable?: boolean;
}): ReactNode {
  return (
    <>
      <span className="agent-inspectable-content-heading">
        <span>
          {labelPrefix}{reason.type === "automation-suspended"
            ? "automation suspended — Continue required"
            : reason.type.replaceAll("-", " ")}
          {reason.recovery === undefined ? "" : ` — ${reason.recovery.summary}`}
        </span>
        {inspectable ? <AgentInspectableMarker /> : null}
      </span>
      {reason.recovery?.explanation === undefined ? null : (
        <small className="recovery-explanation">{reason.recovery.explanation}</small>
      )}
      {reason.type === "user-mention" ? (
        onOpenMention === undefined ? null : (
          <button
            className="secondary"
            autoFocus={highlighted}
            onClick={() => onOpenMention(reason.sourceEventId)}
          >
            View request
          </button>
        )
      ) : reason.type === "automation-suspended" && interruption !== undefined ? (
        <InterruptionResolution
          taskId={interruption.taskId}
          activationId={interruption.activationId}
          agentName={interruption.agentName}
          canDismiss={interruption.canDismiss}
          {...(interruption.mayStartNext === undefined ? {} : { mayStartNext: interruption.mayStartNext })}
          reasonDescription={interruption.reasonDescription}
          autoFocus={highlighted}
          onResolved={onResolved}
          onError={onError}
          {...(onInterruptionCompleted === undefined ? {} : { onCompleted: onInterruptionCompleted })}
        />
      ) : reason.recovery === undefined ? null : (
        <ActivationRecoveryActions
          attentionReasonId={reason.id}
          actions={reason.recovery.actions}
          recoveryKind={reason.recovery.kind}
          onResolved={onResolved}
          onError={onError}
        />
      )}
    </>
  );
}

function InterruptionResolution({
  taskId,
  activationId,
  agentName,
  canDismiss,
  mayStartNext,
  reasonDescription,
  autoFocus,
  onResolved,
  onError,
  onCompleted,
}: {
  taskId: string;
  activationId: string;
  agentName: string;
  canDismiss: boolean;
  mayStartNext?: boolean;
  reasonDescription: string;
  autoFocus: boolean;
  onResolved(): Promise<void>;
  onError(error: unknown): void;
  onCompleted?: (action: "continue" | "dismiss") => void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const [confirmDismissal, setConfirmDismissal] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<"continue" | "dismiss" | null>(null);
  const [idempotencyKeys] = useState(() => ({
    continue: crypto.randomUUID(),
    dismiss: crypto.randomUUID(),
  }));
  const resolveInterruption = async (action: "continue" | "dismiss"): Promise<void> => {
    setPending(action);
    try {
      if (action === "continue") {
        await continueInterruptedTask(taskId, message, idempotencyKeys.continue);
      } else {
        await dismissActivation(activationId, idempotencyKeys.dismiss);
      }
      setOpen(false);
      setConfirmDismissal(false);
      await onResolved();
      onCompleted?.(action);
    } catch (error) {
      setOpen(false);
      setConfirmDismissal(false);
      await onResolved().catch(() => undefined);
      onError(error);
    } finally {
      setPending(null);
    }
  };
  return (
    <>
      <button autoFocus={autoFocus} onClick={() => setOpen(true)}>Resolve interruption</button>
      {!open ? null : confirmDismissal ? (
        <Modal labelledBy="dismiss-interrupted-activation-title" onClose={() => setConfirmDismissal(false)}>
          <h2 id="dismiss-interrupted-activation-title">Dismiss activation?</h2>
          <p>
            Dismiss the interrupted activation for <strong>{agentName}</strong>, activated by {reasonDescription}?
            It will never run again, but the decision and original activation remain in task history.
          </p>
          <p>
            {mayStartNext === true
              ? "The next queued activation may start immediately."
              : "Every other activation keeps its current order and eligibility."}
          </p>
          <div className="form-actions">
            <button
              type="button"
              className="secondary"
              autoFocus
              disabled={pending !== null}
              onClick={() => setConfirmDismissal(false)}
            >Cancel</button>
            <button
              type="button"
              className="destructive"
              disabled={pending !== null}
              onClick={() => void resolveInterruption("dismiss")}
            >{pending === "dismiss" ? "Dismissing…" : "Dismiss activation"}</button>
          </div>
        </Modal>
      ) : (
        <Modal labelledBy="resolve-interruption-title" onClose={() => setOpen(false)}>
          <p className="eyebrow">Task automation suspended</p>
          <h2 id="resolve-interruption-title">Resolve interruption</h2>
          <p>
            Continue <strong>{agentName}</strong> with optional guidance, or dismiss this activation
            so later queued work can proceed.
          </p>
          <label className="interruption-message">
            Continuation message (optional)
            <textarea
              autoFocus
              rows={4}
              value={message}
              onChange={(event) => setMessage(event.currentTarget.value)}
            />
          </label>
          <div className="form-actions interruption-actions">
            <button type="button" className="secondary" disabled={pending !== null} onClick={() => setOpen(false)}>
              Cancel
            </button>
            {!canDismiss ? null : (
              <button
                type="button"
                className="secondary"
                disabled={pending !== null}
                onClick={() => setConfirmDismissal(true)}
              >Dismiss activation</button>
            )}
            <button type="button" disabled={pending !== null} onClick={() => void resolveInterruption("continue")}>
              {pending === "continue" ? "Continuing…" : "Continue interrupted activation"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useState, type ReactNode } from "react";

import type {
  ActivationRecoveryAction,
  TaskAttentionView,
} from "../../application/coordination-contract.ts";
import { markUserMentionAddressed } from "./api.ts";
import { recoverFailedActivation } from "./api.ts";

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
    try {
      await markUserMentionAddressed(attentionReasonId, idempotencyKey);
      await onResolved();
    } catch (error) {
      setPending(false);
      onError(error);
    }
  };
  return (
    <button className="secondary" disabled={pending} onClick={() => void resolve()}>
      {pending ? "Marking addressed…" : "Mark addressed"}
    </button>
  );
}

export function ActivationRecoveryActions({
  attentionReasonId,
  actions,
  onResolved,
  onError,
}: {
  attentionReasonId: string;
  actions: ActivationRecoveryAction[];
  onResolved(): Promise<void>;
  onError(error: unknown): void;
}): ReactNode {
  const [idempotencyKeys] = useState(() => new Map(
    actions.map((action) => [action, crypto.randomUUID()]),
  ));
  const [pending, setPending] = useState<string | null>(null);
  const act = async (action: ActivationRecoveryAction): Promise<void> => {
    setPending(action);
    try {
      await recoverFailedActivation(attentionReasonId, action, idempotencyKeys.get(action)!);
      await onResolved();
    } catch (error) {
      setPending(null);
      onError(error);
    }
  };
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
  onResolved,
  onError,
}: {
  reason: TaskAttentionView;
  labelPrefix?: string;
  onResolved(): Promise<void>;
  onError(error: unknown): void;
}): ReactNode {
  return (
    <>
      <span>
        {labelPrefix}{reason.type === "automation-suspended"
          ? "automation suspended — Continue required"
          : reason.type.replaceAll("-", " ")}
        {reason.recovery === undefined ? "" : ` — ${reason.recovery.summary}`}
      </span>
      {reason.recovery?.explanation === undefined ? null : (
        <small className="recovery-explanation">{reason.recovery.explanation}</small>
      )}
      {reason.type === "user-mention" ? (
        <MarkUserMentionAddressed
          attentionReasonId={reason.id}
          onResolved={onResolved}
          onError={onError}
        />
      ) : reason.recovery === undefined ? null : (
        <ActivationRecoveryActions
          attentionReasonId={reason.id}
          actions={reason.recovery.actions}
          onResolved={onResolved}
          onError={onError}
        />
      )}
    </>
  );
}

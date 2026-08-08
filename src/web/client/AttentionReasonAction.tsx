import { useState, type ReactNode } from "react";

import { markUserMentionAddressed } from "./api.ts";

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

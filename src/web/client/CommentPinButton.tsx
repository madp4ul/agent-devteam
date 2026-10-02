import { useState, type ReactNode } from "react";
import { ApiError } from "./api.ts";

export function CommentPinButton({ taskId, commentId, pinned, onChanged, onError }: {
  taskId: string; commentId: string; pinned: boolean;
  onChanged(): Promise<void>; onError(error: unknown): void;
}): ReactNode {
  const [pending, setPending] = useState(false);
  return <button type="button" className="secondary quiet-action" disabled={pending}
    aria-label={`${pinned ? "Unpin" : "Pin"} comment ${commentId}`} onClick={async () => {
      setPending(true);
      try {
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/${pinned ? "unpin" : "pin"}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        });
        if (!response.ok) throw new ApiError(response.status, await response.json());
        await onChanged();
      } catch (error) { onError(error); } finally { setPending(false); }
    }}>{pinned ? "Unpin" : "Pin"}</button>;
}

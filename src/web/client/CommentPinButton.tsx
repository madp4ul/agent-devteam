import { useState, type ReactNode } from "react";
import { ApiError } from "./api.ts";
import { CommentActionIcon } from "./CommentActionIcon.tsx";

export function CommentPinButton({ taskId, commentId, pinned, onChanged, onError }: {
  taskId: string; commentId: string; pinned: boolean;
  onChanged(): Promise<void>; onError(error: unknown): void;
}): ReactNode {
  const [pending, setPending] = useState(false);
  const label = `${pinned ? "Unpin" : "Pin"} comment ${commentId}`;
  return <button type="button" className="comment-icon-button" aria-disabled={pending}
    aria-label={label} title={pinned ? "Unpin comment" : "Pin comment"} aria-pressed={pinned} onClick={async () => {
      if (pending) return;
      setPending(true);
      try {
        const response = await fetch(`/api/tasks/${encodeURIComponent(taskId)}/comments/${encodeURIComponent(commentId)}/${pinned ? "unpin" : "pin"}`, {
          method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }),
        });
        if (!response.ok) throw new ApiError(response.status, await response.json());
        await onChanged();
      } catch (error) { onError(error); } finally { setPending(false); }
    }}><CommentActionIcon action={pinned ? "unpin" : "pin"} /></button>;
}

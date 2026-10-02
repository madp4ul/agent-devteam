import { useEffect, useRef, useState, type ReactNode } from "react";
import type { TaskCommentView } from "../../application/task-contract.ts";
import { TextPreview } from "./TextPreview.tsx";
import { CommentPinButton } from "./CommentPinButton.tsx";
import { CommentActionIcon } from "./CommentActionIcon.tsx";

export function PinnedComments({ taskId, comments, readOnly, onSource, onChanged, onError }: {
  taskId: string; comments: TaskCommentView[]; readOnly: boolean;
  onSource(sourceId: string): void; onChanged(): Promise<void>; onError(error: unknown): void;
}): ReactNode {
  const [expanded, setExpanded] = useState(new Set<string>());
  const previousPins = useRef(comments.filter((comment) => comment.pinned).map(({ id }) => id));
  const [retained, setRetained] = useState<Array<{ id: string; expiresAt: number }>>([]);
  useEffect(() => {
    const pinned = comments.filter((comment) => comment.pinned);
    const currentIds = new Set(pinned.map(({ id }) => id));
    const removed = previousPins.current.filter((id) => !currentIds.has(id));
    previousPins.current = [...currentIds];
    setRetained((current) => [
      ...current.filter(({ id }) => !currentIds.has(id)),
      ...removed.map((id) => ({ id, expiresAt: Date.now() + 2000 })),
    ]);
  }, [comments]);
  useEffect(() => {
    if (retained.length === 0) return;
    const timer = window.setTimeout(() => setRetained((current) => current.filter(({ expiresAt }) => expiresAt > Date.now())),
      Math.max(0, Math.min(...retained.map(({ expiresAt }) => expiresAt)) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [retained]);
  // Bridge the incoming snapshot until the effect captures removals, preserving the row and focus.
  const retainedIds = new Set([...previousPins.current, ...retained.map(({ id }) => id)]);
  const visible = comments.filter((comment) => comment.pinned || retainedIds.has(comment.id));
  if (visible.length === 0) return null;
  return <section className="detail-panel pinned-comments" aria-label="Pinned comments">
    <h2>Pinned comments</h2>
    {visible.map((comment) => <article key={comment.id} className={comment.pinned ? undefined : "recently-unpinned"}>
      <div className="pinned-comment-content">
      {comment.originTask !== undefined && comment.originTask.id !== taskId ? <small>
        From <a href={`/tasks/${encodeURIComponent(comment.originTask.id)}`}>{comment.originTask.id} · {comment.originTask.title}</a>
      </small> : null}
      <TextPreview id={`pinned-${comment.id}`} text={comment.body} renderedLineLimit={2}
        expanded={expanded.has(comment.id)} onExpanded={(value) => setExpanded((previous) => {
          const next = new Set(previous); if (value) next.add(comment.id); else next.delete(comment.id); return next;
        })} />
      </div>
      <div className="pinned-comment-actions">
        <button type="button" className="comment-icon-button" aria-label="View in task history" title="View in task history"
          onClick={() => onSource(comment.id)}><CommentActionIcon action="source" /></button>
        {readOnly ? null : <CommentPinButton taskId={taskId} commentId={comment.id} pinned={!!comment.pinned} onChanged={onChanged} onError={onError} />}
      </div>
    </article>)}
  </section>;
}

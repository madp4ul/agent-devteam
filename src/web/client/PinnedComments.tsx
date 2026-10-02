import { useState, type ReactNode } from "react";
import type { TaskCommentView } from "../../application/task-contract.ts";
import { TextPreview } from "./TextPreview.tsx";
import { CommentPinButton } from "./CommentPinButton.tsx";

export function PinnedComments({ taskId, comments, readOnly, onSource, onChanged, onError }: {
  taskId: string; comments: TaskCommentView[]; readOnly: boolean;
  onSource(sourceId: string): void; onChanged(): Promise<void>; onError(error: unknown): void;
}): ReactNode {
  const [expanded, setExpanded] = useState(new Set<string>());
  if (comments.length === 0) return null;
  return <section className="detail-panel pinned-comments" aria-label="Pinned comments">
    <h2>Pinned comments</h2>
    {comments.map((comment) => <article key={comment.id}>
      {comment.originTask !== undefined && comment.originTask.id !== taskId ? <small>
        From <a href={`/tasks/${encodeURIComponent(comment.originTask.id)}`}>{comment.originTask.id} · {comment.originTask.title}</a>
      </small> : null}
      <TextPreview id={`pinned-${comment.id}`} text={comment.body} renderedLineLimit={2}
        expanded={expanded.has(comment.id)} onExpanded={(value) => setExpanded((previous) => {
          const next = new Set(previous); if (value) next.add(comment.id); else next.delete(comment.id); return next;
        })} />
      <div className="pinned-comment-actions">
        <button type="button" className="secondary quiet-action" onClick={() => onSource(comment.id)}>View in task history</button>
        {readOnly ? null : <CommentPinButton taskId={taskId} commentId={comment.id} pinned onChanged={onChanged} onError={onError} />}
      </div>
    </article>)}
  </section>;
}

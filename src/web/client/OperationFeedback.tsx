import { useCallback, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Feedback } from "./feedback.ts";

export interface FeedbackItem extends Feedback {
  id: string;
  occurredAt: string;
  target: string;
  content?: ReactNode | undefined;
}

export function useOperationFeedback(target: string) {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const publish = useCallback((feedback: Feedback & { target?: string; content?: ReactNode }, id: string = crypto.randomUUID()) => {
    const item: FeedbackItem = { ...feedback, id, occurredAt: new Date().toISOString(), target: feedback.target ?? target };
    setItems((current) => {
      const existing = current.findIndex((entry) => entry.id === id);
      if (existing !== -1) return current.map((entry, index) => index === existing ? item : entry);
      if (current.some((entry) => entry.role === item.role && entry.text === item.text && entry.target === item.target && entry.content === undefined && item.content === undefined)) return current;
      const successes = current.filter((entry) => entry.role === "status" && entry.content === undefined);
      const evicted = successes.length >= 5 && item.role === "status" && item.content === undefined ? successes[0]?.id : undefined;
      return [...current.filter((entry) => entry.id !== evicted), item];
    });
  }, [target]);
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const setFeedback = useCallback((feedback: Feedback | undefined) => { if (feedback) publish(feedback); }, [publish]);
  return { items, publish, dismiss, setFeedback };
}

export function OperationFeedback({ items, dismiss }: { items: FeedbackItem[]; dismiss(id: string): void }): ReactNode {
  const [collapsed, setCollapsed] = useState(false);
  if (items.length === 0) return null;
  const ordered = [...items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return createPortal(<section className="operation-feedback" aria-label="Operation feedback">
    <button type="button" className="secondary operation-feedback-toggle" aria-expanded={!collapsed}
      onClick={() => setCollapsed((current) => !current)}>{collapsed ? `Show feedback (${items.length})` : "Minimize feedback"}</button>
    <div className="operation-feedback-list" hidden={collapsed} tabIndex={0} aria-label="Recent operation results">
      {ordered.map((item) => <article key={item.id} className={`operation-feedback-item ${item.role}`}>
        <div className="operation-feedback-heading">
          <strong>{item.target}</strong>
          <time dateTime={item.occurredAt}>{new Date(item.occurredAt).toLocaleTimeString()}</time>
          <button type="button" className="secondary" aria-label={`Dismiss feedback for ${item.target}`}
            onClick={() => dismiss(item.id)}>Dismiss</button>
        </div>
        <p className={`feedback ${item.role}`} role={item.role} aria-atomic="true">{item.text}</p>
        {item.content}
      </article>)}
    </div>
    {collapsed ? <p className="operation-feedback-announcement" role="status">{ordered[0]?.text}</p> : null}
  </section>, document.body);
}

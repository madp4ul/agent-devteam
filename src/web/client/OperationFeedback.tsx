import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CloseIconButton } from "./CloseIconButton.tsx";
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
      return [...current, item];
    });
  }, [target]);
  const dismiss = useCallback((id: string) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const setFeedback = useCallback((feedback: Feedback | undefined) => { if (feedback) publish(feedback); }, [publish]);
  return { items, publish, dismiss, setFeedback };
}

export function OperationFeedback({ items, dismiss }: { items: FeedbackItem[]; dismiss(id: string): void }): ReactNode {
  if (items.length === 0) return null;
  const ordered = [...items].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  return createPortal(<section className="operation-feedback" aria-label="Operation feedback">
    <div className="operation-feedback-list" aria-label="Recent operation results">
      {ordered.map((item) => <FeedbackCard key={`${item.id}:${item.occurredAt}`} item={item} dismiss={dismiss} />)}
    </div>
  </section>, document.body);
}

function FeedbackCard({ item, dismiss }: { item: FeedbackItem; dismiss(id: string): void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const remaining = useRef(5000);
  const paused = hovered || focused;
  useEffect(() => {
    if (item.role !== "status" || paused) return;
    const started = performance.now();
    const timer = window.setTimeout(() => dismiss(item.id), remaining.current);
    return () => {
      window.clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (performance.now() - started));
    };
  }, [item.id, item.role, paused, dismiss]);
  return <article className={`operation-feedback-item ${item.role}`} data-paused={paused}
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
    }}>
    <span className="operation-feedback-edge" aria-hidden="true" />
    <div className="operation-feedback-heading">
      <p role={item.role} aria-atomic="true">{item.text}</p>
      <CloseIconButton label={`Dismiss feedback for ${item.target}`} onClick={() => dismiss(item.id)} />
    </div>
    {item.content}
  </article>;
}

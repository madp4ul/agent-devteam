import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { MarkdownContent } from "./MarkdownContent.tsx";

export function TextPreview({ id, text, expanded, onExpanded, participants, markdown = true }: {
  id: string;
  text: string;
  expanded: boolean;
  onExpanded(expanded: boolean): void;
  participants?: Map<string, string>;
  markdown?: boolean;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const [hiddenLineCount, setHiddenLineCount] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    let animationFrame: number | undefined;
    const measure = (): void => setHiddenLineCount(measureHiddenRenderedLines(element));
    const scheduleMeasure = (): void => {
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(() => {
        animationFrame = undefined;
        measure();
      });
    };
    measure();
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(element);
    document.fonts?.addEventListener("loadingdone", scheduleMeasure);
    return () => {
      observer.disconnect();
      document.fonts?.removeEventListener("loadingdone", scheduleMeasure);
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    };
  }, [text]);
  return (
    <div className="authored-text">
      <div id={id} ref={ref} className={`authored-prose${expanded ? " expanded" : ""}`}>
        {markdown ? (
          <MarkdownContent source={text} {...(participants === undefined ? {} : { participants })} />
        ) : (
          <p className="authored-plain-text">{text}</p>
        )}
      </div>
      {hiddenLineCount === 0 ? null : (
        <button className="text-disclosure" aria-controls={id} aria-expanded={expanded} onClick={() => onExpanded(!expanded)}>
          {expanded ? "Show less" : `Show ${hiddenLineCount} more ${hiddenLineCount === 1 ? "line" : "lines"}`}
        </button>
      )}
    </div>
  );
}

function measureHiddenRenderedLines(element: HTMLDivElement): number {
  const parent = element.parentElement;
  if (parent === null || element.clientWidth === 0) return 0;
  const measurement = element.cloneNode(true) as HTMLDivElement;
  measurement.removeAttribute("id");
  measurement.classList.remove("expanded");
  measurement.setAttribute("aria-hidden", "true");
  Object.assign(measurement.style, {
    position: "fixed",
    visibility: "hidden",
    pointerEvents: "none",
    width: `${element.getBoundingClientRect().width}px`,
  });
  parent.append(measurement);
  try {
    const collapsedHeight = measurement.clientHeight;
    measurement.classList.add("expanded");
    const expandedHeight = measurement.scrollHeight;
    const lineHeight = Number.parseFloat(getComputedStyle(measurement).lineHeight);
    if (expandedHeight <= collapsedHeight + 1) return 0;
    return Math.max(1, Math.ceil((expandedHeight - collapsedHeight) / (Number.isFinite(lineHeight) ? lineHeight : 24)));
  } finally {
    measurement.remove();
  }
}

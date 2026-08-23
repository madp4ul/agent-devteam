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
  const topBeforeToggle = useRef<number | undefined>(undefined);
  const [hiddenLineCount, setHiddenLineCount] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    let animationFrame: number | undefined;
    const measure = (): void => {
      alignCollapsedHeightToRenderedLine(element);
      setHiddenLineCount(measureHiddenRenderedLines(element));
    };
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
  useLayoutEffect(() => {
    const element = ref.current;
    const previousTop = topBeforeToggle.current;
    if (element === null || previousTop === undefined) return;
    topBeforeToggle.current = undefined;
    const scrollContainer = nearestVerticalScrollContainer(element);
    const restoreTop = (): void => {
      scrollContainer.scrollTop += element.getBoundingClientRect().top - previousTop;
    };
    restoreTop();
    const animationFrame = requestAnimationFrame(restoreTop);
    return () => cancelAnimationFrame(animationFrame);
  }, [expanded]);
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
        <button
          className="text-disclosure"
          aria-controls={id}
          aria-expanded={expanded}
          onClick={() => {
            topBeforeToggle.current = ref.current?.getBoundingClientRect().top;
            onExpanded(!expanded);
          }}
        >
          {expanded ? "Show less" : `Show ${hiddenLineCount} more ${hiddenLineCount === 1 ? "line" : "lines"}`}
        </button>
      )}
    </div>
  );
}

function nearestVerticalScrollContainer(element: HTMLElement): HTMLElement {
  let candidate = element.parentElement;
  while (candidate !== null) {
    const overflowY = getComputedStyle(candidate).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && candidate.scrollHeight > candidate.clientHeight) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : document.documentElement;
}

function alignCollapsedHeightToRenderedLine(element: HTMLDivElement): void {
  element.style.removeProperty("--authored-preview-height");
  const bounds = element.getBoundingClientRect();
  const targetHeight = Number.parseFloat(getComputedStyle(element).maxHeight);
  if (!Number.isFinite(targetHeight)) return;
  if (element.scrollHeight <= targetHeight + 1) return;
  const targetBottom = bounds.top + targetHeight;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const completeLineBottoms: number[] = [];
  while (walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.height > 0 && rect.bottom <= targetBottom + 0.5) completeLineBottoms.push(rect.bottom);
    }
  }
  const finalCompleteBottom = Math.max(...completeLineBottoms);
  if (Number.isFinite(finalCompleteBottom)) {
    element.style.setProperty("--authored-preview-height", `${Math.ceil(finalCompleteBottom - bounds.top)}px`);
  }
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

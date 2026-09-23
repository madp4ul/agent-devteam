import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

import { MarkdownContent } from "./MarkdownContent.tsx";

export function TextPreview({
  id,
  text,
  expanded,
  onExpanded,
  participants,
  markdown = true,
  className,
  markdownClassName,
  renderedLineLimit,
  collapsedLabel,
}: {
  id: string;
  text: string;
  expanded: boolean;
  onExpanded(expanded: boolean): void;
  participants?: Map<string, string>;
  markdown?: boolean;
  className?: string;
  markdownClassName?: string;
  renderedLineLimit?: number;
  collapsedLabel?: string;
}): ReactNode {
  const ref = useRef<HTMLDivElement>(null);
  const topBeforeToggle = useRef<number | undefined>(undefined);
  const [hiddenLineCount, setHiddenLineCount] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (element === null) return;
    let animationFrame: number | undefined;
    const measure = (): void => {
      if (renderedLineLimit === undefined) {
        alignCollapsedHeightToRenderedLine(element);
        setHiddenLineCount(measureHiddenRenderedLines(element));
        return;
      }
      setHiddenLineCount(limitToRenderedLines(element, renderedLineLimit));
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
    const inheritedStyleObserver = renderedLineLimit === undefined ? undefined : new MutationObserver((records) => {
      if (records.some((record) =>
        record.target instanceof Element && record.target !== element && record.target.contains(element))) {
        scheduleMeasure();
      }
    });
    inheritedStyleObserver?.observe(document.documentElement, {
      attributes: true,
      subtree: true,
      attributeFilter: ["class", "style", "data-theme"],
    });
    document.fonts?.addEventListener("loadingdone", scheduleMeasure);
    return () => {
      observer.disconnect();
      inheritedStyleObserver?.disconnect();
      document.fonts?.removeEventListener("loadingdone", scheduleMeasure);
      if (animationFrame !== undefined) cancelAnimationFrame(animationFrame);
    };
  }, [renderedLineLimit, text]);
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
      <div
        id={id}
        ref={ref}
        className={[
          "authored-prose",
          className,
          renderedLineLimit === undefined ? undefined : "rendered-line-preview",
          hiddenLineCount > 0 ? "overflowing" : undefined,
          expanded ? "expanded" : undefined,
        ].filter(Boolean).join(" ")}
      >
        {markdown ? (
          <MarkdownContent
            source={text}
            {...(markdownClassName === undefined ? {} : { className: markdownClassName })}
            {...(participants === undefined ? {} : { participants })}
          />
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
          {expanded
            ? "Show less"
            : collapsedLabel ?? `Show ${hiddenLineCount} more ${hiddenLineCount === 1 ? "line" : "lines"}`}
        </button>
      )}
    </div>
  );
}

function limitToRenderedLines(element: HTMLDivElement, lineLimit: number): number {
  element.style.removeProperty("--authored-preview-height");
  const bounds = element.getBoundingClientRect();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  const renderedLines: Array<{ top: number; bottom: number }> = [];
  while (walker.nextNode()) {
    const range = document.createRange();
    range.selectNodeContents(walker.currentNode);
    for (const rect of range.getClientRects()) {
      if (rect.height === 0) continue;
      const existingLine = renderedLines.find((line) => Math.abs(line.top - rect.top) <= 0.5);
      if (existingLine === undefined) renderedLines.push({ top: rect.top, bottom: rect.bottom });
      else existingLine.bottom = Math.max(existingLine.bottom, rect.bottom);
    }
  }
  renderedLines.sort((left, right) => left.top - right.top);
  if (renderedLines.length <= lineLimit) return 0;
  const finalVisibleLine = renderedLines[lineLimit - 1];
  if (finalVisibleLine === undefined) return 0;
  element.style.setProperty(
    "--authored-preview-height",
    `${Math.ceil(finalVisibleLine.bottom - bounds.top)}px`,
  );
  return renderedLines.length - lineLimit;
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

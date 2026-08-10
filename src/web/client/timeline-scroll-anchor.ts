export interface TimelineViewportAnchor {
  sourceId: string;
  viewportCenter: number;
}

let sourceHighlightTimer: number | undefined;

export function captureTimelineViewportAnchor(): TimelineViewportAnchor | null {
  const timeline = document.querySelector<HTMLElement>('[data-task-section="timeline"]');
  if (timeline === null) return null;

  const viewportCenter = window.innerHeight / 2;
  const timelineBounds = timeline.getBoundingClientRect();
  if (viewportCenter < timelineBounds.top || viewportCenter > timelineBounds.bottom) return null;

  const visibleRecords = [...timeline.querySelectorAll<HTMLElement>("[data-timeline-record]")]
    .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
    .filter(({ bounds }) => bounds.bottom > 0 && bounds.top < window.innerHeight);
  const anchor = visibleRecords.sort((left, right) =>
    Math.abs(elementCenter(left.bounds) - viewportCenter) -
    Math.abs(elementCenter(right.bounds) - viewportCenter),
  )[0];
  if (anchor === undefined) return null;
  const sourceId = anchor.element.dataset.timelineRecord;
  return sourceId === undefined ? null : { sourceId, viewportCenter: elementCenter(anchor.bounds) };
}

export function restoreTimelineViewportAnchor(anchor: TimelineViewportAnchor | null): void {
  if (anchor === null) return;
  const element = document.querySelector<HTMLElement>(
    `[data-timeline-record="${CSS.escape(anchor.sourceId)}"]`,
  );
  if (element === null) return;
  window.scrollBy({ top: elementCenter(element.getBoundingClientRect()) - anchor.viewportCenter });
}

export function timelineSourceElementId(sourceId: string): string {
  return `timeline-source-${sourceId}`;
}

export function focusTimelineSource(sourceId: string): void {
  const source = document.getElementById(timelineSourceElementId(sourceId));
  if (sourceHighlightTimer !== undefined) window.clearTimeout(sourceHighlightTimer);
  document.querySelector(".timeline-source-target")?.classList.remove("timeline-source-target");
  source?.classList.add("timeline-source-target");
  source?.focus({ preventScroll: true });
  source?.scrollIntoView({ behavior: "smooth", block: "center" });
  if (source !== null) {
    sourceHighlightTimer = window.setTimeout(() => {
      source.classList.remove("timeline-source-target");
      sourceHighlightTimer = undefined;
    }, 1_800);
  }
}

function elementCenter(bounds: DOMRect): number {
  return bounds.top + bounds.height / 2;
}

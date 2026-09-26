export type TimelineViewportAnchor = {
  sourceId: string;
  reference: "viewport-center";
  viewportCenter: number;
} | {
  sourceId: string;
  reference: "sticky-header";
  headerOffset: number;
};

let sourceHighlightTimer: number | undefined;
let sourceScrollFrame: number | undefined;
const sourceScrollDuration = 480;

export function captureTimelineViewportAnchor(
  reference: "viewport-center" | "sticky-header" = "viewport-center",
): TimelineViewportAnchor | null {
  const timeline = document.querySelector<HTMLElement>('[data-task-section="timeline"]');
  if (timeline === null) return null;

  if (reference === "viewport-center") {
    const viewportCenter = window.innerHeight / 2;
    const timelineBounds = timeline.getBoundingClientRect();
    if (viewportCenter < timelineBounds.top || viewportCenter > timelineBounds.bottom) return null;
    const anchor = [...timeline.querySelectorAll<HTMLElement>("[data-timeline-record]")]
      .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
      .filter(({ bounds }) => bounds.bottom > 0 && bounds.top < window.innerHeight)
      .sort((left, right) =>
        Math.abs(elementCenter(left.bounds) - viewportCenter) -
        Math.abs(elementCenter(right.bounds) - viewportCenter))[0];
    if (anchor === undefined) return null;
    const sourceId = anchor.element.dataset.timelineRecord;
    return sourceId === undefined ? null : {
      sourceId,
      reference,
      viewportCenter: elementCenter(anchor.bounds),
    };
  }

  const viewportTop = document.querySelector<HTMLElement>(".detail-topbar")
    ?.getBoundingClientRect().bottom ?? 0;
  const timelineBounds = timeline.getBoundingClientRect();
  if (viewportTop < timelineBounds.top || viewportTop > timelineBounds.bottom) return null;

  const visibleRecords = [...timeline.querySelectorAll<HTMLElement>("[data-timeline-record]")]
    .map((element) => ({ element, bounds: element.getBoundingClientRect() }))
    .filter(({ element, bounds }) =>
      element.dataset.timelineRecord !== undefined &&
      bounds.bottom > viewportTop &&
      bounds.top < window.innerHeight);
  const recordsBySourceId = new Map<string, (typeof visibleRecords)[number]>();
  for (const record of visibleRecords) {
    const sourceId = record.element.dataset.timelineRecord!;
    const existing = recordsBySourceId.get(sourceId);
    if (existing === undefined || compareTopEdgeRecords(record, existing, viewportTop) < 0) {
      recordsBySourceId.set(sourceId, record);
    }
  }
  const anchor = [...recordsBySourceId.values()]
    .sort((left, right) => compareTopEdgeRecords(left, right, viewportTop))[0];
  if (anchor === undefined) return null;
  const sourceId = anchor.element.dataset.timelineRecord;
  return sourceId === undefined
    ? null
    : { sourceId, reference, headerOffset: anchor.bounds.top - viewportTop };
}

export function restoreTimelineViewportAnchor(anchor: TimelineViewportAnchor | null): void {
  if (anchor === null) return;
  if (anchor.reference === "viewport-center") {
    const element = document.querySelector<HTMLElement>(
      `[data-timeline-record="${CSS.escape(anchor.sourceId)}"]`,
    );
    if (element === null) return;
    window.scrollBy({ top: elementCenter(element.getBoundingClientRect()) - anchor.viewportCenter });
    return;
  }
  const viewportTop = document.querySelector<HTMLElement>(".detail-topbar")
    ?.getBoundingClientRect().bottom ?? 0;
  const targetTop = viewportTop + anchor.headerOffset;
  const element = [...document.querySelectorAll<HTMLElement>(
    `[data-timeline-record="${CSS.escape(anchor.sourceId)}"]`,
  )].sort((left, right) =>
    Math.abs(left.getBoundingClientRect().top - targetTop) -
    Math.abs(right.getBoundingClientRect().top - targetTop))[0];
  if (element === undefined) return;
  const adjustment = element.getBoundingClientRect().top - targetTop;
  if (Math.abs(adjustment) < 1) return;
  window.scrollBy({ top: adjustment });
}

export function timelineSourceElementId(sourceId: string): string {
  return `timeline-source-${sourceId}`;
}

export function focusTimelineSource(sourceId: string): void {
  const source = document.getElementById(timelineSourceElementId(sourceId));
  if (sourceHighlightTimer !== undefined) window.clearTimeout(sourceHighlightTimer);
  if (sourceScrollFrame !== undefined) window.cancelAnimationFrame(sourceScrollFrame);
  document.querySelector(".timeline-source-target")?.classList.remove("timeline-source-target");
  source?.classList.add("timeline-source-target");
  source?.focus({ preventScroll: true });
  if (source !== null) {
    animateSourceToViewportCenter(source);
    sourceHighlightTimer = window.setTimeout(() => {
      source.classList.remove("timeline-source-target");
      sourceHighlightTimer = undefined;
    }, 1_800);
  }
}

function animateSourceToViewportCenter(source: HTMLElement): void {
  const startScrollY = window.scrollY;
  const sourceBounds = source.getBoundingClientRect();
  const documentHeight = document.documentElement.scrollHeight;
  const targetScrollY = Math.min(
    Math.max(0, startScrollY + elementCenter(sourceBounds) - window.innerHeight / 2),
    Math.max(0, documentHeight - window.innerHeight),
  );
  const distance = targetScrollY - startScrollY;
  if (Math.abs(distance) < 1) {
    sourceScrollFrame = undefined;
    return;
  }
  const startedAt = performance.now();
  const animate = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / sourceScrollDuration);
    const eased = progress < .5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    window.scrollTo({ top: startScrollY + distance * eased });
    if (progress < 1) {
      sourceScrollFrame = window.requestAnimationFrame(animate);
    } else {
      sourceScrollFrame = undefined;
    }
  };
  sourceScrollFrame = window.requestAnimationFrame(animate);
}

function elementCenter(bounds: DOMRect): number {
  return bounds.top + bounds.height / 2;
}

function compareTopEdgeRecords(
  left: { bounds: DOMRect },
  right: { bounds: DOMRect },
  viewportTop: number,
): number {
  const leftDistance = Math.abs(left.bounds.top - viewportTop);
  const rightDistance = Math.abs(right.bounds.top - viewportTop);
  return leftDistance - rightDistance || left.bounds.height - right.bounds.height;
}

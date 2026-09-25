export interface TimelineViewportAnchor {
  sourceId: string;
  viewportCenter: number;
}

let sourceHighlightTimer: number | undefined;
let sourceScrollFrame: number | undefined;
const sourceScrollDuration = 480;

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

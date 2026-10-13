import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type {
  CollaboratorView,
  ProcessColumnView,
  TaskActivityView,
} from "../../application/browser-transport-contract.ts";
import { readTaskMovementMap } from "./api.ts";
import { usePolling } from "./live-refresh.ts";
import { errorMessage } from "./feedback.ts";
import { timelineSourceElementId } from "./timeline-scroll-anchor.ts";

const movementStep = 28;
const viewportBottomGutter = 16;
const dragModel: "viewport-scrub" | "map-pan" = "viewport-scrub";

type Movement = TaskActivityView & { type: "task.moved" };
type ScalePoint = { documentY: number; mapY: number };
type DragState = {
  pointerId: number;
  startY: number;
  latestY: number;
  startScrollY: number;
  startMapY: number;
  startDocumentY: number;
  minimumScrollY: number;
  points: ScalePoint[];
  dragging: boolean;
};

export function TaskMovementMap({
  taskId,
  onSource,
  columns,
  agents,
}: {
  taskId: string;
  onSource(sourceId: string): void;
  columns: ProcessColumnView[];
  agents: Pick<CollaboratorView, "id" | "name">[];
}): ReactNode {
  const [mapMovements, setMapMovements] = useState<Movement[]>([]);
  const [mapError, setMapError] = useState<string>();
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapCursor = useRef(0);
  const mapReading = useRef(false);
  const mapMounted = useRef(true);
  useEffect(() => () => { mapMounted.current = false; }, []);
  const refreshMap = async (): Promise<void> => {
    if (mapReading.current) return;
    mapReading.current = true;
    try {
      const next = await readTaskMovementMap(taskId, mapCursor.current);
      if (!mapMounted.current) return;
      mapCursor.current = next.cursor;
      if (next.movements.length > 0) setMapMovements((current) => {
        const ids = new Set(current.map((movement) => movement.id));
        return [...next.movements.filter((movement) => !ids.has(movement.id)), ...current];
      });
      setMapLoaded(true); setMapError(undefined);
    } catch (error) { if (mapMounted.current) setMapError(errorMessage(error)); }
    finally { mapReading.current = false; }
  };
  const ordered = useMemo(() => mapMovements, [mapMovements]);
  const mapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);
  const indicatorRangeRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef<{ points: ScalePoint[]; translate: number; topInset: number } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const dragAnimationRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const lastScrubSource = useRef<string | undefined>(undefined);
  const scrubTimer = useRef<number | undefined>(undefined);
  const naturalControlsTopRef = useRef<number | null>(null);
  const [available, setAvailable] = useState(false);
  const [bottomDocked, setBottomDocked] = useState(false);
  const [dragReady, setDragReady] = useState(false);
  const dragReadyRef = useRef(false);
  const minimumDragScrollYRef = useRef(0);
  useEffect(() => {
    if (available && !mapLoaded && !mapError) void refreshMap();
  }, [available, mapLoaded, mapError]);
  usePolling(refreshMap, available && mapLoaded ? 1_000 : undefined, (error) => setMapError(errorMessage(error)));
  const stripHeight = Math.max(movementStep, ordered.length * movementStep);

  useLayoutEffect(() => () => {
    mapRef.current
      ?.closest<HTMLElement>(".detail-sticky-controls-slot")
      ?.style.removeProperty("height");
    clearDockingStyles();
    if (scrubTimer.current !== undefined) window.clearTimeout(scrubTimer.current);
  }, []);

  const updateMapPosition = useCallback(() => {
    const plot = plotRef.current;
    const strip = stripRef.current;
    const frame = frameRef.current;
    const indicator = indicatorRef.current;
    const indicatorRange = indicatorRangeRef.current;
    const timeline = document.querySelector<HTMLElement>('[data-task-section="timeline"]');
    if (
      plot === null || strip === null || frame === null || indicator === null ||
      indicatorRange === null || timeline === null || ordered.length === 0
    ) return;
    const timelineBounds = timeline.getBoundingClientRect();
    const movementPoints = ordered.flatMap((movement, index): ScalePoint[] => {
      const source = document.getElementById(timelineSourceElementId(movement.id));
      if (source === null || source.getClientRects().length === 0) return [];
      const bounds = source.getBoundingClientRect();
      return [{
        documentY: window.scrollY + bounds.top + bounds.height / 2,
        mapY: index * movementStep + movementStep / 2,
      }];
    });
    const section = timeline.querySelector<HTMLElement>(".timeline-section");
    const start = Number(section?.dataset.historyStart ?? 0);
    const total = Number(section?.dataset.historyTotal ?? ordered.length);
    const rendered = section?.querySelectorAll(".timeline > li").length ?? ordered.length;
    const listBounds = section?.querySelector(".timeline")?.getBoundingClientRect() ?? timelineBounds;
    const hasUnloadedSources = movementPoints.length < ordered.length;
    const firstMapY = movementPoints[0]?.mapY ?? stripHeight * start / Math.max(1, total);
    const lastMapY = movementPoints.at(-1)?.mapY ?? stripHeight * (start + rendered) / Math.max(1, total);
    const points = [
      { documentY: window.scrollY + listBounds.top, mapY: hasUnloadedSources ? Math.max(0, firstMapY - movementStep / 2) : 0 },
      ...movementPoints,
      { documentY: window.scrollY + listBounds.bottom, mapY: hasUnloadedSources ? Math.min(stripHeight, lastMapY + movementStep / 2) : stripHeight },
    ].sort((left, right) => left.documentY - right.documentY);
    const topbar = document.querySelector<HTMLElement>(".detail-topbar")?.getBoundingClientRect();
    const topInset = Math.max(0, topbar?.bottom ?? 0);
    const frameStart = interpolate(points, window.scrollY + topInset, "documentY", "mapY");
    const frameEnd = interpolate(points, window.scrollY + window.innerHeight, "documentY", "mapY");
    const mapHeight = plot.clientHeight;
    const frameCenter = (frameStart + frameEnd) / 2;
    const translate = stripHeight <= mapHeight
      ? 0
      : clamp(mapHeight / 2 - frameCenter, mapHeight - stripHeight, 0);
    const visibleTop = clamp(frameStart + translate, 0, mapHeight);
    const visibleBottom = clamp(frameEnd + translate, visibleTop, mapHeight);
    const frameHeight = Math.min(mapHeight, Math.max(3, visibleBottom - visibleTop));
    const frameTop = clamp(visibleTop, 0, Math.max(0, mapHeight - frameHeight));
    strip.style.transform = `translateY(${translate}px)`;
    frame.style.top = `${frameTop}px`;
    frame.style.height = `${frameHeight}px`;
    const overflow = Math.max(0, stripHeight - mapHeight);
    indicator.hidden = overflow === 0;
    if (overflow > 0) {
      const trackHeight = indicator.clientHeight;
      const thumbHeight = Math.max(18, trackHeight * Math.min(1, mapHeight / stripHeight));
      const thumbTravel = Math.max(0, trackHeight - thumbHeight);
      const scrollProgress = clamp(-translate / overflow, 0, 1);
      indicatorRange.style.height = `${thumbHeight}px`;
      indicatorRange.style.transform = `translateY(${thumbTravel * scrollProgress}px)`;
    }
    scaleRef.current = { points, translate, topInset };
  }, [ordered, stripHeight]);
  const updateMapPositionRef = useRef(updateMapPosition);
  updateMapPositionRef.current = updateMapPosition;

  useLayoutEffect(() => {
    updateMapPosition();
  }, [updateMapPosition]);

  useLayoutEffect(() => {
    const map = mapRef.current;
    const controls = map?.closest<HTMLElement>(".detail-sticky-controls");
    const slot = controls?.closest<HTMLElement>(".detail-sticky-controls-slot");
    if (map == null || controls == null || slot == null) return;
    let layoutFrame: number | null = null;
    const updateHeightAndPosition = (): void => {
      layoutFrame = null;
      const enabled = window.innerWidth > 760 && window.innerHeight > 640;
      const currentHeight = Number.parseFloat(map.style.height) || 0;
      const baseHeight = controls.scrollHeight - currentHeight;
      naturalControlsTopRef.current ??= window.scrollY + controls.getBoundingClientRect().top;
      const revealStart = Math.max(
        0,
        naturalControlsTopRef.current + baseHeight + viewportBottomGutter - window.innerHeight,
      );
      const stickyOffset = Number.parseFloat(getComputedStyle(slot).top) || 0;
      const maximumHeight = Math.max(
        0,
        window.innerHeight - stickyOffset - baseHeight - viewportBottomGutter,
      );
      const nextHeight = enabled ? clamp(window.scrollY - revealStart, 0, maximumHeight) : 0;
      const fullMapScrollY = revealStart + maximumHeight;
      const nextBottomDocked = enabled && maximumHeight > 0 && window.scrollY >= revealStart;
      if (nextBottomDocked) {
        const slotBounds = slot.getBoundingClientRect();
        slot.style.height = `${baseHeight + nextHeight}px`;
        document.body.style.setProperty("--movement-map-controls-left", `${slotBounds.left}px`);
        document.body.style.setProperty("--movement-map-controls-width", `${slotBounds.width}px`);
      } else {
        slot.style.removeProperty("height");
        clearDockingStyles();
      }
      const nextDragReady = enabled && nextHeight >= 20 && window.scrollY >= fullMapScrollY - .5;
      dragReadyRef.current = nextDragReady;
      minimumDragScrollYRef.current = fullMapScrollY;
      map.style.height = `${nextHeight}px`;
      setAvailable(nextHeight >= 20);
      setBottomDocked(nextBottomDocked);
      setDragReady(nextDragReady);
      updateMapPositionRef.current();
    };
    const scheduleUpdate = (): void => {
      if (layoutFrame !== null) return;
      layoutFrame = window.requestAnimationFrame(updateHeightAndPosition);
    };
    updateHeightAndPosition();
    const observedHeights = new Map<Element, number>();
    const layoutObserver = new ResizeObserver((entries) => {
      let layoutChanged = false;
      for (const entry of entries) {
        const height = entry.target.getBoundingClientRect().height;
        const previousHeight = observedHeights.get(entry.target);
        observedHeights.set(entry.target, height);
        if (previousHeight !== undefined && Math.abs(previousHeight - height) > .5) layoutChanged = true;
      }
      if (!layoutChanged) return;
      naturalControlsTopRef.current = documentLayoutTop(slot);
      scheduleUpdate();
    });
    for (const sibling of slot.parentElement?.children ?? []) {
      if (sibling === slot) break;
      if (!(sibling instanceof HTMLElement)) continue;
      observedHeights.set(sibling, sibling.getBoundingClientRect().height);
      layoutObserver.observe(sibling);
    }
    window.addEventListener("scroll", updateHeightAndPosition, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.removeEventListener("scroll", updateHeightAndPosition);
      window.removeEventListener("resize", scheduleUpdate);
      layoutObserver.disconnect();
      if (layoutFrame !== null) window.cancelAnimationFrame(layoutFrame);
      if (dragAnimationRef.current !== null) window.cancelAnimationFrame(dragAnimationRef.current);
      document.body.classList.remove("movement-map-dragging");
    };
  }, []);

  const applyDragTarget = (): void => {
    dragAnimationRef.current = null;
    const drag = dragRef.current;
    if (drag === null || !drag.dragging) return;
    const pointerDelta = drag.latestY - drag.startY;
    const section = document.querySelector<HTMLElement>(".timeline-section");
    const loadedSources = ordered.reduce((count, movement) => count + (document.getElementById(timelineSourceElementId(movement.id)) === null ? 0 : 1), 0);
    const paged = Number(section?.dataset.historyTotal ?? 0) > (section?.querySelectorAll(".timeline > li").length ?? 0) || loadedSources < ordered.length;
    const mapDelta = (dragModel === "viewport-scrub" ? pointerDelta : -pointerDelta) * (paged ? stripHeight / Math.max(1, plotRef.current?.clientHeight ?? 1) : 1);
    const targetMapY = clamp(drag.startMapY + mapDelta, 0, stripHeight);
    if (paged) {
      const movement = ordered[Math.min(ordered.length - 1, Math.floor(targetMapY / movementStep))];
      if (movement && movement.id !== lastScrubSource.current) {
        lastScrubSource.current = movement.id;
        if (scrubTimer.current !== undefined) window.clearTimeout(scrubTimer.current);
        scrubTimer.current = window.setTimeout(() => { scrubTimer.current = undefined; onSource(movement.id); }, 60);
      }
      return;
    }
    const targetDocumentY = interpolate(drag.points, targetMapY, "mapY", "documentY");
    const maximumScrollY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({
      top: clamp(
        drag.startScrollY + targetDocumentY - drag.startDocumentY,
        Math.min(drag.minimumScrollY, maximumScrollY),
        maximumScrollY,
      ),
    });
    updateMapPosition();
  };

  const navigateToSource = (sourceId: string): void => {
    if (scrubTimer.current !== undefined) window.clearTimeout(scrubTimer.current);
    scrubTimer.current = undefined; lastScrubSource.current = undefined;
    onSource(sourceId);
  };

  const scheduleDragTarget = (): void => {
    if (dragAnimationRef.current !== null) return;
    dragAnimationRef.current = window.requestAnimationFrame(applyDragTarget);
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (drag.dragging && dragAnimationRef.current !== null) {
      window.cancelAnimationFrame(dragAnimationRef.current);
      applyDragTarget();
    }
    suppressClickRef.current = drag.dragging;
    dragRef.current = null;
    document.body.classList.remove("movement-map-dragging");
    window.getSelection()?.removeAllRanges();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => { suppressClickRef.current = false; }, 0);
  };

  return (
    <div
      ref={mapRef}
      className={`movement-map${available ? " available" : ""}`}
      data-bottom-docked={bottomDocked ? "true" : undefined}
      data-testid="movement-map"
      data-drag-ready={dragReady ? "true" : "false"}
      aria-hidden={available ? undefined : true}
    >
      {mapError ? <p role="alert" className="movement-map-status">Unable to load movement map. <button className="secondary" onClick={() => void refreshMap()}>Retry map</button></p> : available && !mapLoaded ? <p role="status" className="movement-map-status">Loading movement map…</p> : null}
      <div className="movement-map-legend" style={{ gridTemplateColumns: laneColumns(columns.length) }}>
        {columns.map((column) => <MovementMapLegendItem key={column.id} column={column} />)}
      </div>
      <div
        ref={plotRef}
        className="movement-map-plot"
        onPointerDown={(event) => {
          if (event.button !== 0 || !dragReadyRef.current) return;
          if (scrubTimer.current !== undefined) window.clearTimeout(scrubTimer.current);
          scrubTimer.current = undefined; lastScrubSource.current = undefined;
          const scale = scaleRef.current;
          const frame = frameRef.current;
          if (scale === null || frame === null) return;
          const startMapY = frame.offsetTop + frame.offsetHeight / 2 - scale.translate;
          dragRef.current = {
            pointerId: event.pointerId,
            startY: event.clientY,
            latestY: event.clientY,
            startScrollY: window.scrollY,
            startMapY,
            startDocumentY: interpolate(scale.points, startMapY, "mapY", "documentY"),
            minimumScrollY: minimumDragScrollYRef.current,
            points: scale.points.map((point) => ({ ...point })),
            dragging: false,
          };
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          if (drag === null || drag.pointerId !== event.pointerId) return;
          if (!drag.dragging && Math.abs(event.clientY - drag.startY) < 4) return;
          if (!drag.dragging) event.currentTarget.setPointerCapture(event.pointerId);
          drag.dragging = true;
          drag.latestY = event.clientY;
          event.preventDefault();
          document.body.classList.add("movement-map-dragging");
          window.getSelection()?.removeAllRanges();
          scheduleDragTarget();
        }}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
      >
        <div
          className="movement-map-lanes"
          style={{ gridTemplateColumns: laneColumns(columns.length) }}
        >
          {columns.map((column) => (
            <div
              key={column.id}
              className="movement-map-lane"
              title={`${column.name} · ${column.watchingAgentId === null ? "User" : agentName(column.watchingAgentId, agents)}`}
            />
          ))}
        </div>
        <svg className="movement-map-column-rails" aria-hidden="true">
          {columns.map((column, index) => (
            <line
              key={column.id}
              className={`movement-map-column-rail${column.watchingAgentId === null && !column.frameworkOwned ? " user-owned" : ""}`}
              data-column-id={column.id}
              x1={laneX(index, columns.length)}
              x2={laneX(index, columns.length)}
              y1="0"
              y2="100%"
            />
          ))}
        </svg>
        <div ref={stripRef} className="movement-map-strip" style={{ height: stripHeight }}>
          <svg className="movement-map-drawing" aria-hidden="true">
            {ordered.map((movement, index) => {
              const y = index * movementStep + movementStep / 2;
              const fromIndex = columnIndex(movement.details.fromColumnId, columns);
              const toIndex = columnIndex(movement.details.toColumnId, columns);
              return (
                <g key={movement.id}>
                  {index + 1 >= ordered.length ? null : (
                    <line
                      className="movement-map-task-path movement-map-residency"
                      data-column-id={movement.details.fromColumnId}
                      x1={laneX(fromIndex, columns.length)}
                      x2={laneX(fromIndex, columns.length)}
                      y1={y}
                      y2={(index + 1) * movementStep + movementStep / 2}
                    />
                  )}
                  <line
                    className={`movement-map-task-path movement-map-transition ${movement.actor.kind}`}
                    x1={laneX(fromIndex, columns.length)}
                    x2={laneX(toIndex, columns.length)}
                    y1={y}
                    y2={y}
                  />
                  {movement.actor.kind === "agent" ? (
                    <circle
                      className="movement-map-actor agent"
                      cx={laneX(agentColumnIndex(movement, columns), columns.length)}
                      cy={y}
                      r="6"
                    />
                  ) : null}
                </g>
              );
            })}
          </svg>
          {ordered.map((movement, index) => {
            const fromIndex = columnIndex(movement.details.fromColumnId, columns);
            const toIndex = columnIndex(movement.details.toColumnId, columns);
            if (fromIndex === toIndex) return null;
            return (
              <span
                key={`${movement.id}-arrowhead`}
                className={`movement-map-arrowhead ${movement.actor.kind} ${toIndex > fromIndex ? "right" : "left"}`}
                style={{ left: laneX(toIndex, columns.length), top: index * movementStep + movementStep / 2 }}
              />
            );
          })}
          {ordered.map((movement, index) => (
            <button
              key={movement.id}
              type="button"
              className="movement-map-landmark"
              style={{ top: index * movementStep, height: movementStep }}
              tabIndex={available ? 0 : -1}
              data-source-id={movement.id}
              aria-label={movementLabel(movement, columns, agents)}
              title={movementLabel(movement, columns, agents)}
              onKeyDown={(event) => {
                const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? ordered.length - 1 : event.key === "ArrowDown" ? Math.min(ordered.length - 1, index + 1) : event.key === "ArrowUp" ? Math.max(0, index - 1) : undefined;
                if (nextIndex === undefined) return;
                event.preventDefault();
                const target = ordered[nextIndex];
                if (target) {
                  const button = stripRef.current?.querySelector<HTMLButtonElement>(`[data-source-id="${CSS.escape(target.id)}"]`);
                  button?.focus({ preventScroll: true });
                  navigateToSource(target.id);
                }
              }}
              onClick={() => {
                if (!suppressClickRef.current) navigateToSource(movement.id);
              }}
            />
          ))}
        </div>
        <div ref={frameRef} className="movement-map-viewport" aria-hidden="true" />
        <div ref={indicatorRef} className="movement-map-overview-indicator" aria-hidden="true">
          <div ref={indicatorRangeRef} className="movement-map-overview-range" />
        </div>
      </div>
    </div>
  );
}

function MovementMapLegendItem({ column }: { column: ProcessColumnView }): ReactNode {
  const tooltipId = useId();
  const itemRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const disclosed = hovered || focused;
  useLayoutEffect(() => {
    if (!disclosed) return;
    const placeTooltip = (): void => {
      const item = itemRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      if (item === undefined || tooltip === null) return;
      const tooltipBounds = tooltip.getBoundingClientRect();
      const gutter = 8;
      const left = Math.min(
        Math.max(item.left + item.width / 2 - tooltipBounds.width / 2, gutter),
        window.innerWidth - tooltipBounds.width - gutter,
      );
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${Math.max(gutter, item.top - tooltipBounds.height - gutter)}px`;
    };
    placeTooltip();
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);
    return () => {
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, [disclosed]);
  const userOwned = column.watchingAgentId === null && !column.frameworkOwned;
  return (
    <>
      <span
        className="movement-map-legend-disclosure"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <span
          ref={itemRef}
          className={`movement-map-legend-item${userOwned ? " user-owned" : ""}`}
          tabIndex={0}
          aria-describedby={tooltipId}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        >
          <svg viewBox="0 0 18 18" aria-hidden="true" focusable="false">
            <text x="9" y="9" textAnchor="middle" dominantBaseline="central">
              {columnInitial(column.name)}
            </text>
          </svg>
        </span>
      </span>
      {createPortal(
        <span
          ref={tooltipRef}
          className={`agent-inspectable-tooltip movement-map-legend-tooltip${disclosed ? " disclosed" : ""}`}
          id={tooltipId}
          role="tooltip"
        >{column.name}</span>,
        document.body,
      )}
    </>
  );
}

function movementLabel(
  movement: Movement,
  columns: ProcessColumnView[],
  agents: Pick<CollaboratorView, "id" | "name">[],
): string {
  const from = movement.details.fromColumnName ?? columns.find((column) => column.id === movement.details.fromColumnId)?.name ?? movement.details.fromColumnId;
  const to = movement.details.toColumnName ?? columns.find((column) => column.id === movement.details.toColumnId)?.name ?? movement.details.toColumnId;
  const actor = movement.actor.kind === "user" ? "You" : movement.details.actorName ?? agentName(movement.actor.id, agents);
  return `Moved from ${from} to ${to} by ${actor}`;
}

function agentColumnIndex(movement: Movement, columns: ProcessColumnView[]): number {
  const watched = columns.findIndex((column) => column.watchingAgentId === movement.actor.id);
  if (watched >= 0) return watched;
  return columnIndex(movement.details.toColumnId, columns);
}

function columnIndex(columnId: string | undefined, columns: ProcessColumnView[]): number {
  const index = columns.findIndex((column) => column.id === columnId);
  return index >= 0 ? index : 0;
}

function laneX(index: number, count: number): string {
  return `${((index + .5) / Math.max(1, count)) * 100}%`;
}

function laneColumns(count: number): string {
  return `repeat(${Math.max(1, count)}, minmax(0, 1fr))`;
}

function columnInitial(name: string): string {
  return Array.from(name.trim())[0]?.toLocaleUpperCase() ?? "?";
}

function agentName(agentId: string, agents: Pick<CollaboratorView, "id" | "name">[]): string {
  return agents.find((agent) => agent.id === agentId)?.name ?? agentId;
}

function interpolate<TInput extends keyof ScalePoint, TOutput extends keyof ScalePoint>(
  points: ScalePoint[],
  value: number,
  input: TInput,
  output: TOutput,
): number {
  const ordered = [...points].sort((left, right) => left[input] - right[input]);
  const first = ordered[0];
  const last = ordered.at(-1);
  if (first === undefined || last === undefined) return 0;
  if (value <= first[input]) return first[output];
  if (value >= last[input]) return last[output];
  const upperIndex = ordered.findIndex((point) => point[input] >= value);
  const lower = ordered[Math.max(0, upperIndex - 1)]!;
  const upper = ordered[upperIndex]!;
  const span = upper[input] - lower[input];
  if (span === 0) return upper[output];
  const progress = (value - lower[input]) / span;
  return lower[output] + (upper[output] - lower[output]) * progress;
}

function clearDockingStyles(): void {
  document.body.style.removeProperty("--movement-map-controls-left");
  document.body.style.removeProperty("--movement-map-controls-width");
}

function documentLayoutTop(element: HTMLElement): number {
  let top = 0;
  let current: HTMLElement | null = element;
  while (current !== null) {
    top += current.offsetTop;
    current = current.offsetParent instanceof HTMLElement ? current.offsetParent : null;
  }
  return top;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

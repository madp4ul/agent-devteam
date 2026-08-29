import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";

const EXPLANATION = "Agents can inspect this information through their coordination tools.";

export function AgentInspectableMarker(): ReactNode {
  const tooltipId = useId();
  const markerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const disclosed = hovered || focused;
  useLayoutEffect(() => {
    if (!disclosed) return;
    const placeTooltip = (): void => {
      const marker = markerRef.current?.getBoundingClientRect();
      const tooltip = tooltipRef.current;
      if (marker === undefined || tooltip === null) return;
      const tooltipBounds = tooltip.getBoundingClientRect();
      const gutter = 8;
      const left = Math.min(
        Math.max(marker.left + marker.width / 2 - tooltipBounds.width / 2, gutter),
        window.innerWidth - tooltipBounds.width - gutter,
      );
      const above = marker.top - tooltipBounds.height - gutter;
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${above >= gutter ? above : marker.bottom + gutter}px`;
    };
    placeTooltip();
    window.addEventListener("resize", placeTooltip);
    window.addEventListener("scroll", placeTooltip, true);
    return () => {
      window.removeEventListener("resize", placeTooltip);
      window.removeEventListener("scroll", placeTooltip, true);
    };
  }, [disclosed]);
  return (
    <span
      className="agent-inspectable-disclosure"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        ref={markerRef}
        type="button"
        className="icon-button agent-inspectable-marker"
        aria-label="Agent-inspectable information"
        aria-describedby={tooltipId}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M7 8.5h10a3 3 0 013 3v4a3 3 0 01-3 3h-1.5l-2.2 2v-2H7a3 3 0 01-3-3v-4a3 3 0 013-3Z" />
          <path d="M9 8.5v-2a3 3 0 016 0v2M9 13.5h.01M12 13.5h.01M15 13.5h.01" />
        </svg>
      </button>
      <span ref={tooltipRef} className="agent-inspectable-tooltip" id={tooltipId} role="tooltip">{EXPLANATION}</span>
    </span>
  );
}

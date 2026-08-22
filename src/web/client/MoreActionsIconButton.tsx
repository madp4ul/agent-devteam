import type { ReactNode, Ref } from "react";

export function MoreActionsIconButton({
  buttonRef,
  expanded,
  label,
  onClick,
}: {
  buttonRef?: Ref<HTMLButtonElement>;
  expanded: boolean;
  label: string;
  onClick(): void;
}): ReactNode {
  return (
    <button
      ref={buttonRef}
      type="button"
      className="icon-button more-actions-icon-button"
      aria-label={label}
      aria-haspopup="menu"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <circle cx="6" cy="12" r="1.75" />
        <circle cx="12" cy="12" r="1.75" />
        <circle cx="18" cy="12" r="1.75" />
      </svg>
    </button>
  );
}

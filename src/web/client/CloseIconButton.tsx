import type { ReactNode } from "react";

export function CloseIconButton({ label, onClick }: {
  label: string;
  onClick(): void;
}): ReactNode {
  return (
    <button type="button" className="icon-button" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

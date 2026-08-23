import type { ReactNode } from "react";

export function AttachmentIconButton({ action, label, disabled = false, onClick }: {
  action: "attach" | "remove" | "retry";
  label: string;
  disabled?: boolean;
  onClick(): void;
}): ReactNode {
  return (
    <button type="button" className={`icon-button attachment-icon-button ${action}`} aria-label={label} disabled={disabled} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        {action === "attach" ? <path d="M8.5 12.5l6.9-6.9a3.2 3.2 0 014.5 4.5l-9.2 9.2a5 5 0 01-7.1-7.1l9-9" /> : null}
        {action === "remove" ? <path d="M6 6l12 12M18 6L6 18" /> : null}
        {action === "retry" ? <><path d="M19 8V3l-2 2a8 8 0 10.8 10" /><path d="M19 3h-5" /></> : null}
      </svg>
    </button>
  );
}

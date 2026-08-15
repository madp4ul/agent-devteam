import type { ReactNode, Ref } from "react";

export function CloseIconButton({ label, buttonRef, onClick }: {
  label: string;
  buttonRef?: Ref<HTMLButtonElement>;
  onClick(): void;
}): ReactNode {
  return (
    <button ref={buttonRef} type="button" className="icon-button" aria-label={label} onClick={onClick}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

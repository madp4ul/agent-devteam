import {
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";

const focusableSelector = [
  "a[href]",
  "button:not(:disabled)",
  "input:not(:disabled):not([type=hidden])",
  "select:not(:disabled)",
  "textarea:not(:disabled)",
  "details > summary:first-of-type",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

const openModals: Array<{ id: symbol; dialog: HTMLElement }> = [];
let overflowBeforeFirstModal = "";

export function Modal({
  labelledBy,
  className,
  backdropClassName,
  initialFocusRef,
  onClose,
  children,
}: {
  labelledBy: string;
  className?: string;
  backdropClassName?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  onClose(): void;
  children: ReactNode;
}): ReactNode {
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef(
    document.activeElement instanceof HTMLElement ? document.activeElement : null,
  );
  const onCloseRef = useRef(onClose);
  const modalIdRef = useRef(Symbol("modal"));
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const modalId = modalIdRef.current;
    const dialog = dialogRef.current;
    if (dialog === null) return;
    if (openModals.length === 0) {
      overflowBeforeFirstModal = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    openModals.push({ id: modalId, dialog });

    const requestedInitialFocus = initialFocusRef?.current;
    if (requestedInitialFocus !== undefined && requestedInitialFocus !== null) {
      requestedInitialFocus.focus();
    } else if (dialog !== null && !dialog.contains(document.activeElement)) {
      (focusableElements(dialog)[0] ?? dialog).focus();
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (openModals.at(-1)?.id !== modalId) return;
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || dialogRef.current === null) return;
      const focusable = focusableElements(dialogRef.current);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialogRef.current.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      const index = openModals.findIndex(({ id }) => id === modalId);
      if (index >= 0) openModals.splice(index, 1);
      if (openModals.length === 0) document.body.style.overflow = overflowBeforeFirstModal;
      window.requestAnimationFrame(() => {
        const returnFocus = returnFocusRef.current;
        const topDialog = openModals.at(-1)?.dialog;
        const activeElement = document.activeElement;
        const focusNeedsRestoration =
          activeElement === null ||
          activeElement === document.body ||
          activeElement === document.documentElement ||
          !activeElement.isConnected;
        if (
          focusNeedsRestoration &&
          returnFocus?.isConnected === true &&
          (topDialog === undefined || topDialog.contains(returnFocus))
        ) returnFocus.focus();
      });
    };
  }, [initialFocusRef]);

  return createPortal(
    <div
      className={["modal-backdrop", backdropClassName].filter(Boolean).join(" ")}
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && openModals.at(-1)?.id === modalIdRef.current) onClose();
      }}
    >
      <section
        ref={dialogRef}
        className={["modal", className].filter(Boolean).join(" ")}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
      >
        {children}
      </section>
    </div>,
    document.body,
  );
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>(focusableSelector)]
    .filter((element) =>
      !element.hidden &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.getClientRects().length > 0 &&
      window.getComputedStyle(element).visibility !== "hidden"
    );
}

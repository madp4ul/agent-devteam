import type { ReactNode } from "react";

/** Shared decorative, centered artwork for compact comment controls. */
export function CommentActionIcon({ action }: { action: "pin" | "unpin" | "source" }): ReactNode {
  return <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {action === "source" ? <><path d="M10 6H5v13h14v-5M12 12l7-7M13 5h6v6" /></> : <>
      <path d="M9 3h6l-1 7 4 4v2H6v-2l4-4-1-7M12 16v5" />
      {action === "unpin" ? <path d="M3 3l18 18" /> : null}
    </>}
  </svg>;
}

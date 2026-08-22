import type { ReactNode } from "react";

export function CommandStatusMark({ status }: { status: string }): ReactNode {
  const presentation = commandStatusPresentation(status);
  return (
    <span className={`command-status ${presentation.kind}`} role="img" aria-label={presentation.label}>
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {presentation.kind === "succeeded" ? (
          <path d="m5.5 10.2 2.8 2.8 6.2-6.2" />
        ) : presentation.kind === "running" ? (
          <path d="M10 3.5a6.5 6.5 0 1 1-6.5 6.5" />
        ) : (
          <><path d="m6.5 6.5 7 7" /><path d="m13.5 6.5-7 7" /></>
        )}
      </svg>
    </span>
  );
}

function commandStatusPresentation(status: string): {
  kind: "succeeded" | "running" | "failed";
  label: string;
} {
  if (status === "completed" || status === "succeeded" || status === "success") {
    return { kind: "succeeded", label: "Command succeeded" };
  }
  if (status === "running" || status === "in_progress") {
    return { kind: "running", label: "Command running" };
  }
  return { kind: "failed", label: "Command failed" };
}

import type { ReactNode } from "react";

export function ActivityStatusMark({
  status,
  subject,
  className,
}: {
  status: string;
  subject: string;
  className?: string;
}): ReactNode {
  const presentation = statusPresentation(status);
  return (
    <span
      className={`tool-status ${className ?? ""} ${presentation.kind}`.trim()}
      role="img"
      aria-label={`${subject} ${presentation.label}`}
    >
      <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        {presentation.kind === "succeeded" ? (
          <path d="m5.5 10.2 2.8 2.8 6.2-6.2" />
        ) : presentation.kind === "running" ? (
          <path d="M10 3.5a6.5 6.5 0 1 1-6.5 6.5" />
        ) : presentation.kind === "rejected" ? (
          <path d="M6.5 10h7" />
        ) : (
          <><path d="m6.5 6.5 7 7" /><path d="m13.5 6.5-7 7" /></>
        )}
      </svg>
    </span>
  );
}

export function isExceptionalActivityStatus(status: string): boolean {
  const kind = statusPresentation(status).kind;
  return kind === "failed" || kind === "rejected";
}

function statusPresentation(status: string): {
  kind: "succeeded" | "running" | "rejected" | "failed";
  label: string;
} {
  if (status === "completed" || status === "succeeded" || status === "success") {
    return { kind: "succeeded", label: "succeeded" };
  }
  if (status === "running" || status === "in_progress") return { kind: "running", label: "running" };
  if (status === "rejected") return { kind: "rejected", label: "rejected" };
  return { kind: "failed", label: "failed" };
}

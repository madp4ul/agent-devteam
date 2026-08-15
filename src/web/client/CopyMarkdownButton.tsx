import { useEffect, useState, type ReactNode } from "react";

export function CopyMarkdownButton({ source, label }: { source: string; label: string }): ReactNode {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1_500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <button
      type="button"
      className={`markdown-copy-button${copied ? " copied" : ""}`}
      aria-label={label}
      title={copied ? "Copied" : label}
      onClick={() => void navigator.clipboard.writeText(source).then(() => setCopied(true))}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="8" y="8" width="11" height="11" rx="2" />
        <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
      </svg>
    </button>
  );
}

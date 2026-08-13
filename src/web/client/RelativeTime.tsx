import { useEffect, useState, type ReactNode } from "react";

import { formatRelativeTime, nextRelativeTimeUpdate } from "./relative-time.ts";

export function RelativeTime({ value }: { value: string }): ReactNode {
  const instant = new Date(value);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = nextRelativeTimeUpdate(instant.getTime(), now);
    const timer = window.setTimeout(() => setNow(Date.now()), delay);
    return () => window.clearTimeout(timer);
  }, [instant.getTime(), now]);

  return (
    <time dateTime={value} title={formatExactTime(instant)}>
      {formatRelativeTime(instant, now)}
    </time>
  );
}

function formatExactTime(instant: Date): string {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "medium" }).format(instant);
}

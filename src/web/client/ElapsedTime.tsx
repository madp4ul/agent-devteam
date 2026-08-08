import { useEffect, useState, type ReactNode } from "react";

export function ElapsedTime({
  startedAt,
  completedAt,
}: {
  startedAt: string;
  completedAt?: string | null;
}): ReactNode {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (completedAt !== null && completedAt !== undefined) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [completedAt]);
  const end = completedAt === null || completedAt === undefined ? now : Date.parse(completedAt);
  const seconds = Math.max(0, Math.floor((end - Date.parse(startedAt)) / 1_000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return <>{minutes}m {remainder.toString().padStart(2, "0")}s</>;
}

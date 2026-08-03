import type { ReactNode } from "react";

export function Loading(): ReactNode {
  return (
    <main className="loading">
      <span className="spinner" aria-hidden="true" />
      <p>Loading coordination state…</p>
    </main>
  );
}

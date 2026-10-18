import { writeSync } from "node:fs";
import { Worker } from "node:worker_threads";
import type { StartupProgressUpdate } from "./application/startup-contract.ts";

export type StartupResult = "ready" | "configuration-error" | "failed";

export interface StartupProgress {
  phase(update: StartupProgressUpdate): void;
  finish(result: StartupResult): Promise<void>;
}

const unavailableProgress: StartupProgress = { phase() {}, async finish() {} };

function writeProgress(message: string): boolean {
  try { writeSync(2, message); return true; } catch { return false; }
}

/** Presentation only: the application keeps ownership of every startup check. */
export async function startStartupProgress(
  options: { intervalMs?: number } = {},
): Promise<StartupProgress> {
  const startedAt = performance.now();
  if (!writeProgress("[startup] Starting project verification…\n")) return unavailableProgress;
  let worker: Worker;
  try {
    worker = new Worker(new URL("./startup-progress-worker.ts", import.meta.url), {
      workerData: { startedAt, intervalMs: options.intervalMs ?? (process.stderr.isTTY ? 1000 : 10_000) },
    });
  } catch {
    writeProgress("[startup] Live progress unavailable; verification continues.\n");
    return unavailableProgress;
  }
  // A reporting failure must not change database verification or application readiness.
  let unavailable = false;
  let finished = false;
  const exited = new Promise<void>((resolve) => {
    worker.once("exit", () => { unavailable = true; resolve(); });
  });
  worker.on("error", () => { unavailable = true; });
  await new Promise<void>((resolve) => {
    worker.once("message", () => resolve());
    worker.once("error", () => resolve());
    worker.once("exit", () => resolve());
  });
  return {
    phase(update) {
      if (finished) return;
      if (unavailable) writeProgress(`[startup] ${update.phase}\n`);
      else {
        try { worker.postMessage(update); } catch { unavailable = true; void worker.terminate(); }
      }
    },
    async finish(result) {
      if (finished) return;
      finished = true;
      if (!unavailable) {
        try { worker.postMessage({ result }); } catch { await worker.terminate(); }
      }
      await exited;
    },
  };
}

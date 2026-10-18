import { writeSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import type { StartupResult } from "./startup-progress.ts";
import type { StartupProgressUpdate } from "./application/startup-contract.ts";

const { startedAt, intervalMs } = workerData as { startedAt: number; intervalMs: number };
let phase = "Preparing project state";
let remainingSteps: number | undefined;
let detail: string | undefined;
const elapsed = (): string => `${Math.floor((performance.now() - startedAt) / 1000)}s elapsed`;
const status = (): string => `${elapsed()}; ${remainingSteps === undefined
  ? "remaining steps not yet known"
  : `${remainingSteps} planned ${remainingSteps === 1 ? "step remains" : "steps remain"}`}${detail === undefined ? "" : `; ${detail}`}`;
const write = (message: string): void => { writeSync(2, `[startup] ${message}\n`); };
// Direct descriptor writes bypass the parent's event loop, which may be inside SQLite.
const timer = setInterval(() => write(`Still working: ${phase} (${status()})`), intervalMs);
parentPort!.on("message", (message: Partial<StartupProgressUpdate> & { result?: StartupResult }) => {
  if (message.phase !== undefined) {
    phase = message.phase;
    remainingSteps = message.remainingSteps;
    detail = message.detail;
    write(`${phase} (${status()})`);
  } else if (message.result !== undefined) {
    clearInterval(timer);
    const result = message.result === "ready"
      ? "Startup ready — automation paused"
      : message.result === "configuration-error"
        ? "Startup blocked — configuration error"
        : "Startup failed";
    write(`${result} (${elapsed()})`);
    parentPort!.close();
  }
});
parentPort!.postMessage("ready");

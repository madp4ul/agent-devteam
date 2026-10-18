import { startStartupProgress } from "../../src/startup-progress.ts";

const progress = await startStartupProgress({ intervalMs: 20 });
progress.phase({ phase: "Checking database integrity", remainingSteps: 2 });
Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250);
await progress.finish(process.argv[2] === "failed" ? "failed"
  : process.argv[2] === "configuration-error" ? "configuration-error" : "ready");
console.log("FINISHED");
await new Promise(resolve => setTimeout(resolve, 100));

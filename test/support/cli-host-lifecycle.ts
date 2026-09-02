import type { ChildProcess } from "node:child_process";

export async function stopHost(child: ChildProcess, gracePeriodMs = 1_000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolvePromise, reject) => {
    const finish = (error?: Error): void => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      child.off("error", onError);
      if (error === undefined) resolvePromise();
      else reject(error);
    };
    const onExit = (): void => finish();
    const onError = (error: Error): void => finish(error);
    const kill = (signal: NodeJS.Signals): void => {
      try {
        child.kill(signal);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    };
    let timeout = setTimeout(() => {
      timeout = setTimeout(() => {
        finish(new Error(`Test host ${child.pid ?? "without a PID"} did not exit after SIGKILL`));
      }, 5_000);
      kill("SIGKILL");
    }, gracePeriodMs);
    child.once("exit", onExit);
    child.once("error", onError);
    kill("SIGTERM");
  });
}

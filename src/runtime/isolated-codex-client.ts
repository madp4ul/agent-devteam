import { execFile, fork, type ChildProcess } from "node:child_process";
import type { CodexOptions, Input, ThreadEvent } from "@openai/codex-sdk";
import type { CodexClientLike, CodexThreadLike, CodexThreadOptionsLike } from "./codex-agent-runtime.ts";
import type { CodexWorkerRequest } from "./codex-worker.ts";
import { captureWindowsProcessTree, windowsProcessTreeHasExited } from "./windows-process-tree.ts";
import type { AgentRunLifecycle } from "../application/runtime-contract.ts";

type WorkerMessage = { kind: "event"; event: ThreadEvent }
  | { kind: "end" }
  | { kind: "error"; message: string; code?: string };

/** Keep native process ownership independent of SDK stream/iterator progress. */
export function createIsolatedCodexClient(client: CodexOptions): CodexClientLike {
  const thread = (options: CodexThreadOptionsLike, threadId?: string): CodexThreadLike => ({
    async runStreamed(input: Input, runOptions) {
      return { events: runWorker({ client, thread: options, input,
        ...(threadId === undefined ? {} : { threadId }) }, runOptions?.signal, runOptions?.terminationChanged) };
    },
  });
  return { startThread: (options) => thread(options), resumeThread: (id, options) => thread(options, id) };
}

async function* runWorker(request: CodexWorkerRequest, signal?: AbortSignal, terminationChanged?: AgentRunLifecycle["terminationChanged"]): AsyncGenerator<ThreadEvent> {
  signal?.throwIfAborted();
  const child = fork(new URL("./codex-worker.ts", import.meta.url), [], {
    execArgv: ["--experimental-strip-types"],
    cwd: request.thread.workingDirectory,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    detached: process.platform !== "win32",
  });
  const queue: WorkerMessage[] = [];
  let wake = Promise.withResolvers<void>();
  let exited = false;
  let failure: Error | undefined;
  let termination: Promise<void> | undefined;
  let nativeFinished = false;
  const notify = () => { wake.resolve(); };
  const exit = new Promise<void>((resolve) => {
    child.once("exit", () => { exited = true; notify(); resolve(); });
    child.once("error", (error) => { failure = error; notify(); if (child.pid === undefined) { exited = true; resolve(); } });
  });
  child.on("message", (message: WorkerMessage) => { queue.push(message); notify(); });
  const stop = (): Promise<void> => termination ??= nativeFinished ? exit : stopOwnedProcessTree(child, exit, () => exited, terminationChanged);
  const abort = () => { void stop(); notify(); };
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
  else child.send(request, (error) => { if (error) { failure = error; notify(); } });
  let finished = false;
  try {
    while (true) {
      if (signal?.aborted) { await stop(); signal.throwIfAborted(); }
      if (failure !== undefined) throw failure;
      const message = queue.shift();
      if (message?.kind === "event") {
        yield message.event;
        if (!signal?.aborted) child.send({ kind: "next" }, (error) => { if (error) { failure = error; notify(); } });
        continue;
      }
      if (message?.kind === "error") {
        // SDK parsing/iterator exceptions may precede native process exit.
        // Only normal stream completion is eligible for the release handshake.
        await stop();
        finished = true;
        throw Object.assign(new Error(message.message), message.code === undefined ? {} : { code: message.code });
      }
      if (message?.kind === "end") {
        nativeFinished = true;
        child.send({ kind: "release" }, (error) => { if (error) { failure = error; notify(); } });
        await exit;
        if (termination !== undefined) await termination;
        finished = true;
        signal?.throwIfAborted();
        return;
      }
      if (exited) throw new Error("Codex worker exited before completing its event stream");
      await wake.promise;
      wake = Promise.withResolvers<void>();
    }
  } finally {
    signal?.removeEventListener("abort", abort);
    if (!finished) await stop();
  }
}

async function stopOwnedProcessTree(
  child: ChildProcess, exit: Promise<void>, exited: () => boolean,
  changed?: AgentRunLifecycle["terminationChanged"],
): Promise<void> {
  if (child.pid === undefined) { await exit; return; }
  let owned: Awaited<ReturnType<typeof captureWindowsProcessTree>> | undefined;
  let commandAttempted = false;
  let retryRequested = false;
  let wake = () => {};
  const retry = () => { retryRequested = true; wake(); };
  const wait = async (automatic: boolean): Promise<void> => {
    if (retryRequested) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await new Promise<void>((resolve) => {
        wake = resolve;
        if (automatic) timer = setTimeout(resolve, 1000);
      });
    } finally { clearTimeout(timer); wake = () => {}; }
  };
  changed?.({ state: "checking" }, retry);
  while (true) {
    if (retryRequested) {
      retryRequested = false;
      commandAttempted = false;
      changed?.({ state: "checking" }, retry);
    }
    try {
      if (process.platform === "win32") {
        if (owned === undefined && !exited()) {
          // A successful taskkill is sufficient even if inspection is unavailable.
          owned = await captureWindowsProcessTree(child.pid).catch(() => undefined);
        }
        if (!commandAttempted && !exited()) {
          commandAttempted = true;
          try {
            await new Promise<void>((resolve, reject) => {
              execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"],
                { windowsHide: true, timeout: 5000 }, (error) => error ? reject(error) : resolve());
            });
            await exit;
            return;
          } catch (error) { if (owned === undefined) throw error; }
        }
        if (owned === undefined) throw new Error("The worker exited without retained process identities. Termination cannot be verified automatically; use the documented safe host recovery procedure.");
        if (!await windowsProcessTreeHasExited(owned)) {
          const diagnostic = "Owned processes are still present. Execution remains reserved until their exit is verified.";
          changed?.({ state: "blocked", diagnostic, retryAvailable: true }, retry);
          console.error("Codex termination command failed; waiting for owned processes to exit.");
          await wait(true);
          continue;
        }
      } else {
        try { process.kill(-child.pid, "SIGKILL"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
      }
      await exit;
      return;
    } catch (error) {
      const diagnostic = error instanceof Error ? error.message : String(error);
      changed?.({ state: "blocked", diagnostic, retryAvailable: process.platform !== "win32" || owned !== undefined || !exited() }, retry);
      console.error("Could not confirm termination of Codex attempt process tree; task remains occupied.", error);
      // Retain ownership and the same promise; an explicit retry reuses evidence.
      await wait(false);
    }
  }
}

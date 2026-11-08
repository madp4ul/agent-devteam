import { execFile, fork, type ChildProcess } from "node:child_process";
import type { CodexOptions, Input, ThreadEvent } from "@openai/codex-sdk";
import type { CodexClientLike, CodexThreadLike, CodexThreadOptionsLike } from "./codex-agent-runtime.ts";
import type { CodexWorkerRequest } from "./codex-worker.ts";

type WorkerMessage = { kind: "event"; event: ThreadEvent }
  | { kind: "end" }
  | { kind: "error"; message: string; code?: string };

/** Keep native process ownership independent of SDK stream/iterator progress. */
export function createIsolatedCodexClient(client: CodexOptions): CodexClientLike {
  const thread = (options: CodexThreadOptionsLike, threadId?: string): CodexThreadLike => ({
    async runStreamed(input: Input, runOptions) {
      return { events: runWorker({ client, thread: options, input,
        ...(threadId === undefined ? {} : { threadId }) }, runOptions?.signal) };
    },
  });
  return { startThread: (options) => thread(options), resumeThread: (id, options) => thread(options, id) };
}

async function* runWorker(request: CodexWorkerRequest, signal?: AbortSignal): AsyncGenerator<ThreadEvent> {
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
  const stop = (): Promise<void> => termination ??= nativeFinished ? exit : stopOwnedProcessTree(child, exit, () => exited);
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

async function stopOwnedProcessTree(child: ChildProcess, exit: Promise<void>, exited: () => boolean): Promise<void> {
  if (child.pid === undefined) { await exit; return; }
  try {
    if (process.platform === "win32") {
      if (exited()) throw new Error("Codex worker exited unexpectedly; descendant termination is unconfirmed");
      // Keep the supervisor alive until taskkill captures the whole owned tree,
      // including detached descendants. Never kill by executable name.
      await new Promise<void>((resolve, reject) => {
        execFile("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, timeout: 5000 }, (error) => error ? reject(error) : resolve());
      });
    } else {
      // A group may outlive its leader. ESRCH confirms that no group remains.
      try { process.kill(-child.pid, "SIGKILL"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
    }
    await exit;
  } catch (error) {
    // A timeout/error is not proof of termination. Keep execution ownership and
    // surface the failure on the host instead of allowing overlapping attempts.
    console.error("Could not confirm termination of Codex attempt process tree; task remains occupied.", error);
    await new Promise<void>(() => {});
  }
}

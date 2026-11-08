import { Codex, type CodexOptions, type Input, type ThreadOptions } from "@openai/codex-sdk";
import { execFile } from "node:child_process";

export interface CodexWorkerRequest {
  client: CodexOptions;
  thread: ThreadOptions;
  threadId?: string;
  input: Input;
}

// This process owns one SDK invocation. Cancellation belongs to its supervisor:
// aborting only the SDK child can leave inherited output pipes open indefinitely.
process.once("message", async (request: CodexWorkerRequest) => {
  const release = Promise.withResolvers<void>();
  let released = false;
  let next = Promise.withResolvers<void>();
  process.on("message", (message: { kind?: string }) => {
    if (message.kind === "release") { released = true; release.resolve(); }
    if (message.kind === "next") next.resolve();
  });
  process.once("disconnect", () => {
    if (released) return;
    // Host loss must not leave an unsupervised agent writing into the workspace.
    if (process.platform === "win32") {
      execFile("taskkill.exe", ["/PID", String(process.pid), "/T", "/F"], { windowsHide: true });
    } else {
      process.kill(-process.pid, "SIGKILL");
    }
  });
  try {
    const client = new Codex(request.client);
    const thread = request.threadId === undefined
      ? client.startThread(request.thread)
      : client.resumeThread(request.threadId, request.thread);
    const streamed = await thread.runStreamed(request.input);
    for await (const event of streamed.events) {
      await send({ kind: "event", event });
      await next.promise;
      next = Promise.withResolvers<void>();
    }
    await send({ kind: "end" });
  } catch (error) {
    await send({ kind: "error", message: error instanceof Error ? error.message : String(error),
      ...(error instanceof Error && "code" in error ? { code: error.code } : {}) }).catch(() => {});
  } finally {
    // Remain addressable until the host acknowledges native settlement. This
    // prevents completion racing taskkill and losing the process-tree root.
    await release.promise;
    // SDK completion already confirms the native process exited. Its detached
    // children can still hold stderr handles; do not drain those before exiting.
    process.exit(0);
  }
});

function send(message: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    process.send!(message as object, (error) => error ? reject(error) : resolve());
  });
}

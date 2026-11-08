import assert from "node:assert/strict";
import { spawn, execFile, fork } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createIsolatedCodexClient } from "../../src/runtime/isolated-codex-client.ts";
import { createRuntime, request } from "../support/codex-runtime-fixture.ts";

test("interrupt stops a detached program holding SDK output open and preserves unrelated processes and evidence", { timeout: 10000 }, async (t) => {
  const directory = await fixture(t, `
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
  detached: process.platform === 'win32', stdio: ['ignore', 'inherit', 'inherit']
});
emit({ type: 'thread.started', thread_id: JSON.stringify([child.pid, process.ppid]) });
emit({ type: 'item.started', item: { id: 'wait', type: 'command_execution', command: 'review program', aggregated_output: '', status: 'in_progress' } });
setInterval(() => {}, 1000);
`);
  const unrelated = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(() => { unrelated.kill(); });
  const controller = new AbortController();
  let programPid: number | undefined;
  let workerPid: number | undefined;
  t.after(async () => {
    controller.abort();
    if (workerPid !== undefined) await cleanup(workerPid);
    if (programPid !== undefined) { try { process.kill(programPid); } catch {} }
  });
  const runtime = createRuntime({
    mcpServer: { command: "unused", args: () => [] },
    createClient: () => createIsolatedCodexClient({ codexPathOverride: process.execPath }),
  });
  const ready = Promise.withResolvers<void>();
  const runRequest = request("cancel-program", "T-0001");
  runRequest.workspace.path = directory;
  const running = runtime.run(runRequest, {
    started(id) { [programPid, workerPid] = JSON.parse(id!); },
    transcriptItemUpdated() { ready.resolve(); },
  }, controller.signal);
  await ready.promise;
  controller.abort();
  assert.equal(await bounded(running.then(() => "settled", () => "settled")), "settled",
    "interrupt must not wait for manual program closure");
  assert.throws(() => process.kill(programPid!, 0), "the owned program must have stopped");
  assert.throws(() => process.kill(workerPid!, 0), "the SDK supervisor must have stopped");
  assert.doesNotThrow(() => process.kill(unrelated.pid!, 0));
  assert.ok((await runtime.read(runRequest.attemptId))?.some((item) => item.kind === "command"));
});

test("pre-aborted execution does not launch a worker", async () => {
  const client = createIsolatedCodexClient({ codexPathOverride: "must-not-execute" });
  const controller = new AbortController();
  controller.abort();
  const { events } = await client.startThread({ workingDirectory: "does-not-exist" }).runStreamed("input", { signal: controller.signal });
  await assert.rejects(async () => { for await (const _ of events) {} }, { name: "AbortError" });
});

test("cancellation before the first native event stops startup", { timeout: 10000 }, async (t) => {
  const directory = await fixture(t, "setInterval(() => {}, 1000);");
  const client = createIsolatedCodexClient({ codexPathOverride: process.execPath });
  const controller = new AbortController();
  const { events } = await client.startThread({ workingDirectory: directory }).runStreamed("input", { signal: controller.signal });
  const consuming = (async () => { for await (const _ of events) {} })();
  controller.abort();
  assert.equal(await bounded(consuming.then(() => "completed", (error) => error.name)), "AbortError");
});

test("normal and resumed streams preserve options, input, environment and terminal events", async (t) => {
  const directory = await fixture(t, `
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  emit({ type: 'thread.started', thread_id: 'fixture-thread' });
  emit({ type: 'item.completed', item: { id: 'result', type: 'agent_message', text: JSON.stringify({ input, args: process.argv, env: process.env.CODEX_TEST_VALUE }) } });
  emit({ type: 'turn.completed', usage: { input_tokens: 2, cached_input_tokens: 0, output_tokens: 1 } });
});
`);
  const client = createIsolatedCodexClient({ codexPathOverride: process.execPath,
    config: { approval_policy: "on-request" }, env: { ...process.env as Record<string, string>, CODEX_TEST_VALUE: "retained" } });
  for (const resumed of [false, true]) {
    const options = { workingDirectory: directory, model: "fixture-model" };
    const thread = resumed ? client.resumeThread!("existing-thread", options) : client.startThread(options);
    const { events } = await thread.runStreamed("exact input\nsecond line");
    const collected = [];
    for await (const event of events) collected.push(event);
    const item = collected[1];
    assert.ok(item?.type === "item.completed" && item.item.type === "agent_message");
    const value = JSON.parse(item.item.text);
    assert.equal(value.input, "exact input\nsecond line");
    assert.equal(value.env, "retained");
    assert.ok(value.args.includes("fixture-model"));
    assert.ok(value.args.includes('approval_policy="on-request"'));
    assert.equal(value.args.includes("existing-thread"), resumed);
    assert.equal(collected.at(-1)?.type, "turn.completed");
  }
});

test("native startup errors settle and early iterator closure stops a running worker", async (t) => {
  const directory = await fixture(t, `emit({ type: 'thread.started', thread_id: String(process.ppid) }); setInterval(() => {}, 1000);`);
  const invalid = createIsolatedCodexClient({ codexPathOverride: join(directory, "missing-executable") });
  const failed = await invalid.startThread({ workingDirectory: directory }).runStreamed("input");
  await assert.rejects(async () => { for await (const _ of failed.events) {} }, /ENOENT/);
  const client = createIsolatedCodexClient({ codexPathOverride: process.execPath });
  const streamed = await client.startThread({ workingDirectory: directory }).runStreamed("input");
  let workerPid: number | undefined;
  for await (const event of streamed.events) {
    if (event.type === "thread.started") workerPid = Number(event.thread_id);
    break;
  }
  assert.ok(workerPid);
  assert.throws(() => process.kill(workerPid, 0));
});

test("terminal release closes inherited stderr handles without waiting for detached review software", async (t) => {
  const directory = await fixture(t, `
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: ['ignore', 'ignore', 'inherit'] });
emit({ type: 'thread.started', thread_id: String(child.pid) });
emit({ type: 'turn.completed', usage: { input_tokens: 1, cached_input_tokens: 0, output_tokens: 1 } });
process.exit(0);
`);
  for (const cancelAtCompletion of [false, true]) {
    const controller = new AbortController();
    let programPid: number | undefined;
    const client = createIsolatedCodexClient({ codexPathOverride: process.execPath });
    const { events } = await client.startThread({ workingDirectory: directory }).runStreamed("input", { signal: controller.signal });
    try {
      const consuming = (async () => {
        for await (const event of events) {
          if (event.type === "thread.started") programPid = Number(event.thread_id);
          if (event.type === "turn.completed" && cancelAtCompletion) controller.abort();
        }
        return "completed";
      })().catch((error) => error.name);
      assert.equal(await bounded(consuming), cancelAtCompletion ? "AbortError" : "completed");
      if (!cancelAtCompletion) assert.doesNotThrow(() => process.kill(programPid!, 0));
    } finally {
      controller.abort();
      if (programPid !== undefined) { try { process.kill(programPid); } catch {} }
    }
  }
});

test("malformed native output terminates execution before propagating the SDK error", async (t) => {
  const directory = await fixture(t, `
const { spawn } = require('node:child_process');
process.on('SIGTERM', () => {});
const child = spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"], { stdio: 'ignore' });
emit({ type: 'thread.started', thread_id: JSON.stringify([process.pid, child.pid]) });
console.log('malformed event');
setInterval(() => {}, 1000);
`);
  let nativePid: number | undefined;
  let programPid: number | undefined;
  t.after(() => {
    for (const pid of [nativePid, programPid]) if (pid !== undefined) { try { process.kill(pid, "SIGKILL"); } catch {} }
  });
  const client = createIsolatedCodexClient({ codexPathOverride: process.execPath });
  const { events } = await client.startThread({ workingDirectory: directory }).runStreamed("input");
  await assert.rejects(async () => {
    for await (const event of events) if (event.type === "thread.started") [nativePid, programPid] = JSON.parse(event.thread_id);
  }, /Failed to parse item/);
  assert.throws(() => process.kill(nativePid!, 0));
  assert.throws(() => process.kill(programPid!, 0));
});

test("unexpected host disconnection stops the worker and native execution", { timeout: 10000 }, async (t) => {
  const directory = await fixture(t, `emit({ type: 'thread.started', thread_id: String(process.pid) }); setInterval(() => {}, 1000);`);
  const worker = fork(new URL("../../src/runtime/codex-worker.ts", import.meta.url), [], {
    execArgv: ["--experimental-strip-types"], cwd: directory,
    stdio: ["ignore", "ignore", "ignore", "ipc"], detached: process.platform !== "win32",
  });
  t.after(() => cleanup(worker.pid!));
  const ready = Promise.withResolvers<number>();
  worker.on("message", (message: any) => {
    if (message.kind === "event" && message.event.type === "thread.started") ready.resolve(Number(message.event.thread_id));
  });
  const exit = new Promise<void>((resolve) => worker.once("exit", () => resolve()));
  worker.send({ client: { codexPathOverride: process.execPath }, thread: { workingDirectory: directory }, input: "input" });
  const nativePid = await ready.promise;
  t.after(() => { try { process.kill(nativePid); } catch {} });
  worker.disconnect();
  assert.equal(await bounded(exit.then(() => "stopped")), "stopped");
  assert.throws(() => process.kill(nativePid, 0));
});

test("unexpected Windows worker death never falsely confirms native termination", { skip: process.platform !== "win32" }, async (t) => {
  const directory = await fixture(t, `
emit({ type: 'thread.started', thread_id: String(process.pid) });
setTimeout(() => process.kill(process.ppid), 100);
setInterval(() => {}, 1000);
`);
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  let nativePid: number | undefined;
  t.after(() => { if (nativePid !== undefined) { try { process.kill(nativePid); } catch {} } });
  const client = createIsolatedCodexClient({ codexPathOverride: process.execPath });
  const { events } = await client.startThread({ workingDirectory: directory }).runStreamed("input");
  const consuming = (async () => {
    for await (const event of events) if (event.type === "thread.started") nativePid = Number(event.thread_id);
  })();
  assert.equal(await bounded(consuming.then(() => "settled", () => "settled")), "still blocked");
  assert.match(String(diagnostics[0]?.[0]), /task remains occupied/);
});

async function fixture(t: TestContext, body: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "codex-cancel-"));
  t.after(() => rm(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  // Node stands in for the native binary; the real SDK invokes its `exec` script.
  await writeFile(join(directory, "exec"), `const emit = value => console.log(JSON.stringify(value));\n${body}`);
  return directory;
}

async function bounded<T>(promise: Promise<T>): Promise<T | "still blocked"> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<"still blocked">((resolve) => {
      deadline = setTimeout(() => resolve("still blocked"), 3000);
    })]);
  } finally { clearTimeout(deadline); }
}

async function cleanup(pid: number): Promise<void> {
  try { process.kill(pid, 0); } catch { return; }
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => execFile("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { timeout: 5000, windowsHide: true }, () => resolve()));
  } else { try { process.kill(-pid, "SIGKILL"); } catch {} }
}

import assert from "node:assert/strict";
import { spawn, execFile, fork } from "node:child_process";
import childProcess from "node:child_process";
import { syncBuiltinESMExports } from "node:module";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createIsolatedCodexClient } from "../../src/runtime/isolated-codex-client.ts";
import { createRuntime, request } from "../support/codex-runtime-fixture.ts";
import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import { createHandoffFixture } from "../support/handoff-fixture.ts";
import { startWebServer } from "../../src/web/web-server.ts";

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

for (const scenario of ["budget rejection", "interruption", "PID reuse", "inspection failure"] as const) test(`${scenario}: verify owned process exit after taskkill error`, { skip: process.platform !== "win32" }, async (t) => {
  const directory = await fixture(t, `
emit({ type: 'thread.started', thread_id: 'budget-thread' });
emit({ type: 'error', message: 'You have hit your usage limit' });
setInterval(() => {}, 1000);
`);
  const original = childProcess.execFile;
  let injected = false;
  let initialSnapshot: string | undefined;
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  t.mock.method(childProcess, "execFile", (...args: any[]) => {
    if (args[0] === "taskkill.exe") {
      const callback = args.pop();
      args.push((error: Error | null, stdout: string, stderr: string) => {
        injected = true;
        callback(error ?? Object.assign(new Error("A descendant has no running instance"), { code: 255 }), stdout, stderr);
      });
    }
    if (args[0] === "powershell.exe") {
      const callback = args.pop();
      args.push((error: Error | null, stdout: string, stderr: string) => {
        if (injected && scenario === "inspection failure") return callback(new Error("Process inspection unavailable"), "", "");
        if (injected && scenario === "PID reuse") {
          stdout = JSON.stringify(JSON.parse(initialSnapshot!).map((row: Record<string, unknown>) => ({ ...row, created: "2099-01-01T00:00:00.0000000Z" })));
        }
        initialSnapshot ??= stdout;
        callback(error, stdout, stderr);
      });
    }
    return Reflect.apply(original, childProcess, args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const runtime = createRuntime({
    mcpServer: { command: "unused", args: () => [] },
    createClient: () => createIsolatedCodexClient({ codexPathOverride: process.execPath }),
  });
  const runRequest = request("budget-termination", "T-0001");
  runRequest.workspace.path = directory;
  const controller = new AbortController();
  const outcome = await bounded(runtime.run(runRequest, {
    started() { if (scenario === "interruption") controller.abort(); },
  }, controller.signal).catch(() => ({ status: "interrupted" })));
  assert.ok(injected);
  if (scenario === "inspection failure") {
    assert.equal(outcome, "still blocked");
    assert.match(String(diagnostics[0]?.[0]), /task remains occupied/);
    return;
  }
  assert.notEqual(outcome, "still blocked", "budget rejection must settle after the owned processes are gone");
  if (scenario !== "interruption") assert.equal(typeof outcome === "string" ? outcome : outcome.status, "failed");
});

test("successful tree termination does not require process inspection availability", { skip: process.platform !== "win32" }, async (t) => {
  const directory = await fixture(t, `emit({ type: 'thread.started', thread_id: String(process.ppid) }); setInterval(() => {}, 1000);`);
  const original = childProcess.execFile;
  t.mock.method(childProcess, "execFile", (...args: any[]) => {
    if (args[0] === "powershell.exe") return args.at(-1)(new Error("Process inspection unavailable"), "", "");
    return Reflect.apply(original, childProcess, args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const controller = new AbortController();
  let workerPid: number | undefined;
  const runtime = createRuntime({ mcpServer: { command: "unused", args: () => [] },
    createClient: () => createIsolatedCodexClient({ codexPathOverride: process.execPath }) });
  const runRequest = request("no-inspection", "T-0001"); runRequest.workspace.path = directory;
  try {
    const settled = await bounded(runtime.run(runRequest, { started(id) { workerPid = Number(id); controller.abort(); } }, controller.signal).then(() => "settled", () => "settled"));
    assert.equal(settled, "settled");
  } finally {
    if (workerPid !== undefined) await new Promise<void>((resolve) => original("taskkill.exe", ["/PID", String(workerPid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, () => resolve()));
  }
});

test("failed tree termination cannot release ownership while a captured descendant survives", { skip: process.platform !== "win32" }, async (t) => {
  const directory = await fixture(t, `
const { spawn } = require('node:child_process');
const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
emit({ type: 'thread.started', thread_id: JSON.stringify([process.pid, child.pid]) });
emit({ type: 'error', message: 'You have hit your usage limit' });
setInterval(() => {}, 1000);
`);
  const original = childProcess.execFile;
  t.mock.method(childProcess, "execFile", (...args: any[]) => {
    if (args[0] !== "taskkill.exe") return Reflect.apply(original, childProcess, args);
    process.kill(Number(args[1][1])); // Reproduce partial success: supervisor gone, native child survives.
    args.at(-1)(Object.assign(new Error("Native child could not be terminated"), { code: 255 }), "", "");
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const diagnostics: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => diagnostics.push(args));
  let nativePid: number | undefined;
  let programPid: number | undefined;
  const runtime = createRuntime({
    mcpServer: { command: "unused", args: () => [] },
    createClient: () => createIsolatedCodexClient({ codexPathOverride: process.execPath }),
  });
  const runRequest = request("surviving-native", "T-0001");
  runRequest.workspace.path = directory;
  const running = runtime.run(runRequest, { started(id) { [nativePid, programPid] = JSON.parse(id!); } });
  try {
    const outcome = await bounded(running);
    assert.equal(outcome, "still blocked");
    assert.doesNotThrow(() => process.kill(programPid!, 0));
    assert.match(String(diagnostics[0]?.[0]), /waiting for owned processes/);
  } finally {
    for (const pid of [nativePid, programPid]) if (pid !== undefined) {
      await new Promise<void>((resolve) => original("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, () => resolve()));
    }
  }
  assert.notEqual(await bounded(running), "still blocked", "later confirmed exit must release the pending termination");
});

for (const reusedParent of [false, true]) test(`termination verification follows a descendant spawned after the initial snapshot${reusedParent ? " with a reused parent PID" : ""}`, { skip: process.platform !== "win32" }, async (t) => {
  const directory = await fixture(t, `
const fs = require('node:fs');
const { spawn } = require('node:child_process');
emit({ type: 'thread.started', thread_id: String(process.pid) });
emit({ type: 'error', message: 'You have hit your usage limit' });
const timer = setInterval(() => {
  if (!fs.existsSync('spawn-child')) return;
  clearInterval(timer);
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  fs.writeFileSync('child-pid', String(child.pid));
  setInterval(() => {}, 1000);
}, 10);
`);
  const original = childProcess.execFile;
  let nativePid: number | undefined;
  let programPid: number | undefined;
  let captured = false;
  t.mock.method(childProcess, "execFile", (...args: any[]) => {
    if (args[0] === "taskkill.exe") {
      process.kill(nativePid!);
      process.kill(Number(args[1][1]));
      return args.at(-1)(new Error("Partial termination"), "", "");
    }
    if (args[0] === "powershell.exe" && captured && reusedParent) {
      const callback = args.pop();
      args.push((error: Error | null, stdout: string, stderr: string) => {
        const rows = JSON.parse(stdout);
        rows.push({ pid: nativePid, parent: 0, created: "2099-01-01T00:00:00.0000000Z" });
        callback(error, JSON.stringify(rows), stderr);
      });
    }
    if (args[0] === "powershell.exe" && !captured) {
      captured = true;
      const callback = args.pop();
      args.push((error: Error | null, stdout: string, stderr: string) => {
        void (async () => {
          await writeFile(join(directory, "spawn-child"), "go");
          for (let i = 0; i < 100; i++) {
            const value = await readFile(join(directory, "child-pid"), "utf8").catch(() => "");
            if (value) { programPid = Number(value); break; }
            await new Promise<void>((resolve) => setTimeout(resolve, 10));
          }
          callback(error, stdout, stderr);
        })();
      });
    }
    return Reflect.apply(original, childProcess, args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  t.mock.method(console, "error", () => {});
  const runtime = createRuntime({ mcpServer: { command: "unused", args: () => [] },
    createClient: () => createIsolatedCodexClient({ codexPathOverride: process.execPath }) });
  const runRequest = request("late-child", "T-0001"); runRequest.workspace.path = directory;
  const running = runtime.run(runRequest, { started(id) { nativePid = Number(id); } });
  try {
    assert.equal(await bounded(running), "still blocked");
    assert.ok(programPid);
    assert.doesNotThrow(() => process.kill(programPid!, 0));
  } finally {
    for (const pid of [nativePid, programPid]) if (pid !== undefined) {
      await new Promise<void>((resolve) => original("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, timeout: 5000 }, () => resolve()));
    }
  }
  assert.notEqual(await bounded(running), "still blocked");
});

test("termination inspection failure is visible and retryable without restarting the run", { skip: process.platform !== "win32" }, async (t) => {
  const directory = await fixture(t, `emit({ type: 'thread.started', thread_id: 'retained-thread' }); emit({ type: 'error', message: 'Usage limit reached' }); setInterval(() => {}, 1000);`);
  const original = childProcess.execFile;
  let killed = false;
  let failInspection = true;
  t.mock.method(childProcess, "execFile", (...args: any[]) => {
    if (args[0] === "powershell.exe" && killed && failInspection) return args.at(-1)(new Error("Inspection temporarily unavailable"), "", "");
    if (args[0] === "taskkill.exe") {
      const callback = args.pop();
      args.push((error: Error | null, stdout: string, stderr: string) => { killed = true; callback(error ?? new Error("Already exited child"), stdout, stderr); });
    }
    return Reflect.apply(original, childProcess, args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const runtime = createRuntime({ mcpServer: { command: "unused", args: () => [] },
    createClient: () => createIsolatedCodexClient({ codexPathOverride: process.execPath }) });
  const runRequest = request("retry-verification", "T-0001"); runRequest.workspace.path = directory;
  const blocked = Promise.withResolvers<() => void>();
  const running = runtime.run(runRequest, { started() {}, terminationChanged(state, retry) {
    if (state.state === "blocked") { assert.match(state.diagnostic, /Inspection temporarily unavailable/); blocked.resolve(retry); }
  } });
  const retry = await bounded(blocked.promise);
  assert.notEqual(retry, "still blocked");
  if (typeof retry !== "function") return;
  failInspection = false;
  retry(); retry(); // Repeated requests join the same termination operation.
  const outcome = await bounded(running);
  assert.notEqual(outcome, "still blocked");
  if (typeof outcome !== "string") { assert.equal(outcome.status, "failed"); assert.equal(outcome.threadId, "retained-thread"); }
});

test("HTTP stop orders and Pause recover multiple real budget-failed workers without losing conversations", { skip: process.platform !== "win32", timeout: 20000 }, async (t) => {
  const directory = await fixture(t, `emit({ type: 'thread.started', thread_id: 'thread-' + process.pid }); emit({ type: 'item.completed', item: { id: 'saved', type: 'agent_message', text: 'Retained work before budget failure' } }); emit({ type: 'error', message: 'Usage limit reached' }); setInterval(() => {}, 1000);`);
  const original = childProcess.execFile;
  const killed = new Set<number>();
  const killCallbacks: Array<() => void> = [];
  let failInspection = true;
  t.mock.method(childProcess, "execFile", (...args: any[]) => {
    if (args[0] === "powershell.exe" && killed.size >= 2 && failInspection) return args.at(-1)(new Error("Inspection temporarily unavailable"), "", "");
    if (args[0] === "taskkill.exe") {
      const pid = Number(args[1][1]);
      const callback = args.pop();
      args.push((error: Error | null, stdout: string, stderr: string) => {
        killed.add(pid);
        killCallbacks.push(() => callback(error ?? new Error("Already exited child"), stdout, stderr));
        if (killed.size === 2) for (const complete of killCallbacks) complete();
      });
    }
    return Reflect.apply(original, childProcess, args);
  });
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
  const setup = await createHandoffFixture();
  // Both native processes reach cleanup before inspection is allowed to finish.
  const blocked = new Set<string>();
  const ready = Promise.withResolvers<void>();
  const native = createRuntime({ mcpServer: { command: "unused", args: () => [] }, createClient: () => {
    const client = createIsolatedCodexClient({ codexPathOverride: process.execPath });
    return { startThread: (options) => client.startThread({ ...options, workingDirectory: directory }) };
  } });
  const app = await CoordinationApplication.start({ processDefinitionPath: setup.definitionPath, databasePath: setup.databasePath,
    runtimeDispatch: { projectRepositoryPath: setup.repositoryPath, taskWorkspaceRoot: setup.workspaceRoot, agentRuntime: {
      run: (request, lifecycle, signal) => native.run(request, { ...lifecycle, terminationChanged: (state, retry) => {
        lifecycle.terminationChanged?.(state, retry);
        if (state.state === "blocked") { blocked.add(request.task.id); if (blocked.size === 2) ready.resolve(); }
      } }, signal),
    } }, transcriptAccess: native });
  t.after(() => app.close());
  const server = await startWebServer(app, { host: "127.0.0.1", port: 0, assetDirectory: directory });
  t.after(() => server.close());
  const tasks = [0, 1].map((index) => {
    const result = app.createTask({ boardId: "delivery", columnId: "implementation", title: `Budget ${index}`, description: "Preserve history", actor: { kind: "user", id: "paul" }, idempotencyKey: `create-${index}` });
    assert.ok(result.accepted); return result.task.id;
  });
  await app.resumeAutomation();
  // Force verification failures for both roots, while allowing their initial captures.
  await ready.promise;
  assert.equal((await app.prepareShutdown()).ready, false);
  const post = (task: string, command: string, body: object) => fetch(`${server.baseUrl}/api/tasks/${task}/${command}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  for (const [index, task] of tasks.entries()) {
    const run = app.queryActiveRuns().find((run) => run.taskId === task)!;
    const body = { activationId: run.activationId, idempotencyKey: `stop-${task}` };
    assert.equal((await post(task, "retry-termination", { attemptId: "wrong" })).status, 409);
    if (index === 0) assert.equal((await post(task, "interrupt", { ...body, idempotencyKey: `interrupt-${task}` })).status, 202);
    assert.equal((await post(task, "stop-activation", body)).status, 202);
    assert.equal((await post(task, "interrupt", { ...body, idempotencyKey: `again-${task}` })).status, 202);
    assert.equal((await post(task, "stop-activation", body)).status, 202);
    const detail = await (await fetch(`${server.baseUrl}/api/tasks/${task}`)).json();
    assert.equal(detail.activeRun.stopRequested, true);
    assert.equal(detail.activeRun.status, "termination-blocked");
  }
  failInspection = false;
  for (const run of app.queryActiveRuns()) assert.equal((await post(run.taskId, "retry-termination", { attemptId: run.attemptId })).status, 202);
  await app.waitForAutomationIdle();
  assert.deepEqual(await app.prepareShutdown(), { ready: true });
  assert.equal(app.queryAutomation().state, "paused");
  for (const taskId of tasks) {
    const result = app.queryTask(taskId); assert.ok(result.available);
    const activation = result.task.activations[0]!;
    assert.equal(activation.status, "dismissed");
    assert.match(activation.attempts[0]!.threadId!, /^thread-/);
    const conversation = await app.queryAgentConversation(taskId, activation.conversationId!);
    assert.ok(conversation.available);
    assert.match(JSON.stringify(conversation), /Retained work before budget failure/);
    assert.equal((await post(taskId, "stop-activation", { activationId: activation.id, idempotencyKey: "replay" })).status, 200);
  }
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

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import { stopHost } from "../support/cli-host-lifecycle.ts";

test("stopping a host with no grace period confirms child termination", async (t) => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, "exit", { signal: AbortSignal.timeout(5_000) });
    child.kill("SIGKILL");
    await exited;
  });
  await once(child, "spawn");
  // Exhaust the grace period at the real process boundary; requesting a kill
  // is not evidence that the child has exited.
  await stopHost(child, 0);
  assert.ok(child.exitCode !== null || child.signalCode !== null, "stopHost returned before its child exited");
});

test("stopping an already-signalled host completes without another shutdown wait", async (t) => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
  t.after(async () => stopHost(child, 0));
  await once(child, "spawn");
  const exited = once(child, "exit");
  child.kill("SIGKILL");
  await exited;
  assert.notEqual(child.signalCode, null);
  assert.equal(await Promise.race([
    stopHost(child).then(() => "stopped"),
    setImmediate().then(() => "still waiting"),
  ]), "stopped");
});

test("stopping an already-exited host succeeds repeatedly", async () => {
  const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
  await once(child, "exit");
  assert.equal(child.exitCode, 0);
  await stopHost(child);
  await stopHost(child);
});

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";

test("startup console stays live while verification blocks, then stops after readiness", async () => {
  const child = spawn(process.execPath, ["--experimental-strip-types",
    resolve("test/support/startup-progress-host.ts")], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  let beforeReady = "";
  child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  child.stdout.on("data", () => { beforeReady = output; });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, output);
  assert.match(beforeReady, /Checking database integrity/);
  assert.match(beforeReady, /2 planned steps remain/);
  assert.ok((beforeReady.match(/Still working/g) ?? []).length >= 2, beforeReady);
  assert.match(output, /Startup ready .*automation paused/);
  assert.doesNotMatch(output, /%|ETA/);
  assert.equal(output.slice(output.indexOf("Startup ready")).trim().split("\n").length, 1);
});

for (const [result, message] of [
  ["failed", "Startup failed"], ["configuration-error", "Startup blocked — configuration error"],
] as const) {
  test(`startup console stops with an honest ${result} outcome`, async () => {
    const child = spawn(process.execPath, ["--experimental-strip-types",
      resolve("test/support/startup-progress-host.ts"), result], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stderr.on("data", (chunk: Buffer) => { output += chunk.toString(); });
    const [code] = await once(child, "exit");
    assert.equal(code, 0, output);
    assert.ok(output.includes(message), output);
    assert.doesNotMatch(output, /Startup ready/);
    assert.equal(output.slice(output.indexOf(message)).trim().split("\n").length, 1);
  });
}

test("unavailable worker permissions cannot prevent startup", async () => {
  const child = spawn(process.execPath, ["--permission", "--allow-fs-read=*", "--experimental-strip-types",
    resolve("test/support/startup-progress-host.ts")], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => { output += chunk.toString(); });
  const [code] = await once(child, "exit");
  assert.equal(code, 0);
  assert.match(output, /FINISHED/);
});

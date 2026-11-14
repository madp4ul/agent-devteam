import assert from "node:assert/strict";
import { execFile, fork, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, lstat, mkdtemp, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const exec = promisify(execFile);
const processDefinition = `schemaVersion: 1
name: Installed fixture
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve incident evidence.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Inspect work.
    columns:
      - id: backlog
        name: Backlog
`;

test("a captured installation runs host, browser, MCP and worker without its source checkout", { timeout: 120_000 }, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-release-"));
  // All processes stop in their later hooks before the explicitly owned fixture is removed.
  const children: Parameters<typeof stopHost>[0][] = [];
  t.after(async () => { for (const child of children.reverse()) await stopHost(child); await rm(directory, { recursive: true, force: true }); });
  const source = join(directory, "source");
  for (const name of ["src", "web", "schemas", "package.json", "pnpm-lock.yaml", "vite.config.ts"]) {
    await cp(resolve(name), join(source, name), { recursive: true });
  }
  // Dependencies are build inputs only; the installed graph must contain plain copies.
  const root = join(directory, "installations");
  const result = await exec(process.execPath, [resolve("scripts/create-local-release.mjs"), "--source", source, "--root", root, "--id", "fixture-a"], { timeout: 100_000 });
  const installation = JSON.parse(result.stdout.trim().split("\n").at(-1)!) as { id: string; directory: string };
  assert.equal(installation.id, "fixture-a");
  await rename(source, `${source}-unavailable`);
  const metadata = JSON.parse(await readFile(join(installation.directory, "release.json"), "utf8"));
  assert.equal(metadata.id, "fixture-a");
  assert.match(metadata.sourceDigest, /^[a-f0-9]{64}$/);
  async function verifyCopies(path: string): Promise<void> {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      assert.equal((await lstat(child)).isSymbolicLink(), false, child);
      if (entry.isDirectory()) await verifyCopies(child);
    }
  }
  await verifyCopies(join(installation.directory, "node_modules"));
  const sdkRequire = createRequire(join(installation.directory, "node_modules/@openai/codex-sdk/package.json"));
  const nativePackage = sdkRequire.resolve("@openai/codex/package.json");
  const nativeVersion = await exec(process.execPath, [join(dirname(nativePackage), "bin/codex.js"), "--version"]);
  assert.match(nativeVersion.stdout, /codex-cli 0\.160\.0/);
  const project = join(directory, "project");
  await exec("git", ["init", "--initial-branch=main", project]);
  const definition = join(directory, "process.yaml");
  await writeFile(definition, processDefinition);
  const child = spawn(process.execPath, [join(installation.directory, "launch.mjs"), "start", "--project", project, "--process", definition, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"] });
  children.push(child);
  let output = "";
  const ready = new Promise<string>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(output)), 20_000);
    const observe = (data: Buffer): void => {
      output += data.toString();
      const match = output.match(/Coordination application listening at (http:\/\/[^\s]+)/);
      if (match && output.includes("Startup mode:")) { clearTimeout(timeout); accept(match[1]!); }
    };
    child.stdout.on("data", observe); child.stderr.on("data", observe);
    child.on("exit", () => { clearTimeout(timeout); reject(new Error(output)); });
  });
  const baseUrl = await ready;
  assert.match(output, /Framework release: fixture-a/);
  assert.match(output, /Startup mode: paused/);
  const browser = await fetch(baseUrl);
  assert.equal(browser.status, 200);
  assert.match(await browser.text(), /Agent Coordination/);
  let authorization: string | undefined;
  const agentEndpoint = createServer((request, response) => {
    authorization = request.headers.authorization;
    response.writeHead(authorization === "Bearer installed-fixture-token" ? 200 : 401, { "content-type": "application/json" });
    response.end(JSON.stringify({ resources: [{ id: "release-fixture-resource" }] }));
  });
  await new Promise<void>(accept => agentEndpoint.listen(0, "127.0.0.1", accept));
  t.after(async () => new Promise<void>((accept, reject) => agentEndpoint.close(error => error ? reject(error) : accept())));
  const endpointUrl = `http://127.0.0.1:${(agentEndpoint.address() as AddressInfo).port}`;
  const mcp = spawn(process.execPath, ["--experimental-strip-types", join(installation.directory, "src/mcp/stdio-server.ts"), "--base-url", endpointUrl, "--token", "installed-fixture-token"], { stdio: ["pipe", "pipe", "pipe"] });
  children.push(mcp);
  const reply = new Promise<string>((accept) => mcp.stdout.once("data", data => accept(data.toString())));
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "installed-test", version: "1" } } }) + "\n");
  assert.match(await reply, /agent-coordination-project/);
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
  const toolReply = new Promise<string>((accept) => mcp.stdout.once("data", data => accept(data.toString())));
  mcp.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "resource.list", arguments: {} } }) + "\n");
  assert.match(await toolReply, /release-fixture-resource/);
  assert.equal(authorization, "Bearer installed-fixture-token");
  const worker = fork(join(installation.directory, "src/runtime/codex-worker.ts"), [], { execArgv: ["--experimental-strip-types"], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  children.push(worker);
  const message = once(worker, "message", { signal: AbortSignal.timeout(10_000) });
  worker.send({ client: { codexPathOverride: join(directory, "no-model-fixture") }, thread: { workingDirectory: project }, input: "Never execute a model" });
  const [failure] = await message;
  assert.equal(failure.kind, "error");
  assert.match(failure.message, /ENOENT|spawn|not found/i);
  worker.send({ kind: "release" });
  await once(worker, "exit");
  assert.match(await readFile(join(installation.directory, "src/application/internal/migrations/current-schema.sql"), "utf8"), /CREATE TABLE/);
  await assert.rejects(exec(process.execPath, [resolve("scripts/create-local-release.mjs"), "--root", root, "--id", "fixture-a"]), /already exists/);
});

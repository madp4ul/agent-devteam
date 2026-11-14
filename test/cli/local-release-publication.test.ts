import assert from "node:assert/strict";
import { execFile, fork, spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const exec = promisify(execFile);
const publisher = resolve("scripts/publish-local-release.mjs");

function replaceOnce(source: string, target: string, replacement: string): string {
  assert.notEqual(source.indexOf(target), -1, `Fixture target missing: ${target}`);
  assert.equal(source.indexOf(target), source.lastIndexOf(target), `Fixture target must occur once: ${target}`);
  return source.replace(target, replacement);
}

test("publishing B leaves host A and later children on A until its next start", { timeout: 240_000 }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "coordination-publish-"));
  const children: Parameters<typeof stopHost>[0][] = [];
  t.after(async () => { for (const child of children.reverse()) await stopHost(child); await rm(fixture, { recursive: true, force: true }); });
  const source = join(fixture, "source");
  const root = join(fixture, "installed");
  const launcherEnvironment = { ...process.env, COORDINATION_RELEASE_ROOT: root, COORDINATION_TEST_NO_MODEL_BINARY: join(fixture, "no-model-execution") };
  for (const name of ["src", "web", "schemas", "package.json", "pnpm-lock.yaml", "vite.config.ts"]) await cp(resolve(name), join(source, name), { recursive: true });
  const index = join(source, "web/index.html");
  const original = await readFile(index, "utf8");
  await writeFile(index, replaceOnce(original, "</head>", '<meta name="release-fixture" content="A"></head>'));
  const workerPath = join(source, "src/runtime/codex-worker.ts");
  const workerSource = await readFile(workerPath, "utf8");
  await writeFile(workerPath, replaceOnce(workerSource, 'error.message : String(error)', '"worker-A:" + error.message : String(error)'));
  // Fixture-only external runtime substitution: dispatch through the real host,
  // but give the SDK an absent executable so no model can ever run.
  const cli = join(source, "src/cli.ts");
  await writeFile(cli, 'import { createIsolatedCodexClient } from "./runtime/isolated-codex-client.ts";\n' + replaceOnce(await readFile(cli, "utf8"), "const agentRuntime = new CodexAgentRuntime({", "const agentRuntime = new CodexAgentRuntime({\n        createClient: options => createIsolatedCodexClient({ ...options, codexPathOverride: process.env.COORDINATION_TEST_NO_MODEL_BINARY }),"));
  await exec(process.execPath, [publisher, "--source", source, "--root", root, "--id", "release-a"], { timeout: 120_000 });
  const launcher = join(root, "launch-latest.mjs");
  const project = join(fixture, "project");
  await exec("git", ["init", "--initial-branch=main", project]);
  await writeFile(join(project, "fixture.txt"), "Disposable publication proof\n");
  await exec("git", ["-C", project, "add", "fixture.txt"]);
  await exec("git", ["-C", project, "-c", "user.name=Release fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Fixture baseline"]);
  const definition = join(fixture, "process.yaml");
  await writeFile(definition, `schemaVersion: 1
name: Publication proof
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep the running release fixed.
agents:
  - id: worker
    name: Worker
    role: Verify installation
    summary: Controlled runtime fixture
    instructions: ./worker.md
boards:
  - id: delivery
    name: Delivery
    guidance: Preserve work.
    columns:
      - id: backlog
        name: Backlog
        watchingAgent: worker
`);
  await writeFile(join(fixture, "worker.md"), "Use the controlled fixture runtime only.\n");
  async function start() {
    const host = spawn(process.execPath, [launcher, "start", "--project", project, "--process", definition, "--port", "0"], { stdio: ["ignore", "pipe", "pipe"], env: launcherEnvironment });
    children.push(host);
    let output = "";
    const baseUrl = await new Promise<string>((accept, reject) => {
      const timeout = setTimeout(() => reject(new Error(output)), 20_000);
      const observe = (chunk: Buffer): void => {
        output += chunk.toString();
        const match = output.match(/Coordination application listening at (http:\/\/[^\s]+)/);
        if (match && output.includes("Startup mode: paused")) { clearTimeout(timeout); accept(match[1]!); }
      };
      host.stdout.on("data", observe); host.stderr.on("data", observe);
      host.once("exit", () => { clearTimeout(timeout); reject(new Error(output)); });
    });
    return { host, baseUrl, output };
  }
  const a = await start();
  assert.match(a.output, /Framework release: release-a/);
  await writeFile(index, replaceOnce(original, "</head>", '<meta name="release-fixture" content="B"></head>'));
  await writeFile(workerPath, replaceOnce(workerSource, 'error.message : String(error)', '"worker-B:" + error.message : String(error)'));
  let publicationsFinished = false;
  const publications = Promise.allSettled(["release-b", "release-c"].map(id =>
    exec(process.execPath, [publisher, "--source", source, "--root", root, "--id", id], { timeout: 140_000 }),
  )).finally(() => { publicationsFinished = true; });
  while (!publicationsFinished) {
    const selected = JSON.parse(await readFile(join(root, "latest.json"), "utf8")) as { id: string };
    assert.ok(["release-a", "release-b", "release-c"].includes(selected.id));
    await delay(50);
  }
  for (const publication of await publications) assert.equal(publication.status, "fulfilled", publication.status === "rejected" ? String(publication.reason) : undefined);
  assert.match(await (await fetch(a.baseUrl)).text(), /content="A"/);
  const created = await fetch(`${a.baseUrl}/api/tasks`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ boardId: "delivery", columnId: "backlog", title: "Worker after publication", description: "Verify A still owns new worker execution", idempotencyKey: "publication-worker" }) });
  assert.equal(created.status, 201);
  const task = await created.json() as { task: { id: string } };
  assert.ok(task.task.id);
  assert.equal((await fetch(`${a.baseUrl}/api/automation/resume`, { method: "POST" })).status, 200);
  let taskEvidence = "";
  for (let attempt = 0; attempt < 150; attempt++) {
    taskEvidence = await (await fetch(`${a.baseUrl}/api/tasks/${task.task.id}`)).text();
    if (taskEvidence.includes("worker-A:")) break;
    await delay(100);
  }
  assert.match(taskEvidence, /worker-A:/, "host A must dispatch its real runtime worker after B is published");
  assert.doesNotMatch(taskEvidence, /worker-B:/);
  await fetch(`${a.baseUrl}/api/automation/pause`, { method: "POST" });
  const installationA = join(root, "releases/release-a");
  const worker = fork(join(installationA, "src/runtime/codex-worker.ts"), [], { execArgv: ["--experimental-strip-types"], stdio: ["ignore", "ignore", "ignore", "ipc"] });
  children.push(worker);
  const reply = once(worker, "message", { signal: AbortSignal.timeout(10_000) });
  worker.send({ client: { codexPathOverride: join(fixture, "no-model-execution") }, thread: { workingDirectory: project }, input: "Do not execute a model" });
  const [failure] = await reply;
  assert.match(failure.message, /^worker-A:/);
  worker.send({ kind: "release" });
  await once(worker, "exit");
  await stopHost(a.host);
  const selected = JSON.parse(await readFile(join(root, "latest.json"), "utf8")) as { id: string };
  assert.ok(["release-b", "release-c"].includes(selected.id));
  const b = await start();
  assert.ok(b.output.includes(`Framework release: ${selected.id}`));
  assert.match(await (await fetch(b.baseUrl)).text(), /content="B"/);
  const latest = await readFile(join(root, "latest.json"), "utf8");
  await assert.rejects(exec(process.execPath, [publisher, "--source", source, "--root", root, "--id", selected.id]), /already exists/);
  assert.equal(await readFile(join(root, "latest.json"), "utf8"), latest);
  await assert.rejects(exec(process.execPath, [publisher, "--source", join(fixture, "absent"), "--root", root, "--id", "incomplete"]));
  assert.equal(await readFile(join(root, "latest.json"), "utf8"), latest);
  // An interrupted publisher's unselected candidate/pointer temporary file is harmless.
  await writeFile(join(root, ".latest-interrupted.json"), '{"id":"incomplete"');
  assert.ok((await exec(process.execPath, [launcher, "validate", definition], { env: launcherEnvironment })).stdout.includes(`Framework release: ${selected.id}`));
  await stopHost(b.host);
  const metadataPath = join(root, "releases", selected.id, "release.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, nodeMajor: 999 }));
  await assert.rejects(exec(process.execPath, [launcher, "validate", definition], { env: launcherEnvironment }), /Node.js 999 or later/);
  await writeFile(join(root, "latest.json"), '{"formatVersion":1,"id":"../source"}');
  await assert.rejects(exec(process.execPath, [launcher, "validate", definition], { env: launcherEnvironment }), /Invalid latest release/);
});

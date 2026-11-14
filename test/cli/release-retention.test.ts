import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { access, cp, mkdir, mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const exec = promisify(execFile);

test("legacy installations stay protected when a live baseline owner's snapshot identity is missing", async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "framework-legacy-proof-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const cache = await import(pathToFileURL(resolve("scripts/release-cache.mjs")).href);
  const required = ["launch.mjs", "src/cli.ts", "src/startup-progress-worker.ts", "src/runtime/codex-worker.ts", "src/mcp/stdio-server.ts", "src/application/internal/migrations/current-schema.sql", "dist/web/index.html", "node_modules/@openai/codex-sdk/package.json"];
  async function installation(id: string): Promise<{ id: string; directory: string }> {
    const directory = join(fixture, "releases", id);
    for (const name of required) { await mkdir(dirname(join(directory, name)), { recursive: true }); await writeFile(join(directory, name), "fixture"); }
    await writeFile(join(directory, "release.json"), JSON.stringify({ formatVersion: 1, id, ready: true, sourceDigest: "a".repeat(64), platform: process.platform, architecture: process.arch, nodeMajor: 24 }));
    return { id, directory };
  }
  const old = await installation("legacy-version");
  const baseline = { pid: process.pid, created: "2026-01-01T00:00:00.000Z", name: "node.exe", command: "legacy host", executable: "node.exe" };
  await cache.initializeReleaseRetention(fixture, () => {}, async () => [baseline]);
  const selected = await installation("selected-version");
  for (const snapshot of [[], [{ ...baseline, created: "" }]]) {
    await cache.withReleaseCache(fixture, (database: unknown) => cache.selectAndPinRelease(database, fixture, selected, () => {}, async () => snapshot));
    await access(join(old.directory, "launch.mjs"));
  }
});

test("startup prunes unused managed releases while preserving running hosts and legacy installations", { timeout: 90_000, skip: process.platform !== "win32" || process.arch !== "x64" }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "framework-retention-"));
  let worker: ReturnType<typeof spawn> | undefined;
  t.after(async () => {
    if (worker) await stopHost(worker);
    await rm(fixture, { recursive: true, force: true });
  });
  const root = join(fixture, "cache");
  const required = ["src/cli.ts", "src/startup-progress-worker.ts", "src/runtime/codex-worker.ts", "src/mcp/stdio-server.ts", "src/application/internal/migrations/current-schema.sql", "dist/web/index.html", "node_modules/@openai/codex-sdk/package.json"];
  const archives = new Map<string, { bytes: Buffer; digest: string }>();
  for (const id of ["v0.2.0", "v0.3.0"]) {
    const application = join(fixture, id);
    await mkdir(application);
    for (const name of required) { await mkdir(dirname(join(application, name)), { recursive: true }); await writeFile(join(application, name), "fixture"); }
    await writeFile(join(application, "launch.mjs"), `console.log('INSTALLED:${id}');
if (process.argv.includes('stay')) process.stdin.on('data', async () => console.log('LATE:' + (await import(new URL('./later.mjs', import.meta.url))).id));
`);
    await writeFile(join(application, "later.mjs"), `export const id = '${id}';\n`);
    await writeFile(join(application, "worker.mjs"), `import { writeFileSync } from 'node:fs';
writeFileSync(process.env.RETENTION_WORKER_STARTED, 'started');
setInterval(() => {}, 1000);
`);
    await writeFile(join(application, "release.json"), JSON.stringify({ formatVersion: 1, id, ready: true, sourceDigest: "a".repeat(64), sourceRevision: "b".repeat(40), sourceTag: id, sourceKind: "committed-release", platform: process.platform, architecture: process.arch, nodeMajor: 24 }));
    const zip = join(fixture, `${id}.zip`);
    await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/release-archive.ps1"), "-Mode", "Pack", "-Source", application, "-Destination", zip]);
    const bytes = await readFile(zip);
    archives.set(id, { bytes, digest: "sha256:" + createHash("sha256").update(bytes).digest("hex") });
  }
  // A pre-tracking installation and unknown directory must not become deletion targets.
  const legacy = join(root, "releases", "legacy-copy");
  await cp(join(fixture, "v0.2.0"), legacy, { recursive: true });
  const legacyMetadata = JSON.parse(await readFile(join(legacy, "release.json"), "utf8"));
  await writeFile(join(legacy, "release.json"), JSON.stringify({ ...legacyMetadata, id: "legacy-copy" }));
  await writeFile(join(legacy, "evidence.txt"), "Keep uncertain legacy work");
  let latest = "v0.2.0";
  const server = createServer((request, response) => {
    const asset = archives.get(latest)!;
    if (request.url === "/repos/fixture/framework/releases/latest") response.end(JSON.stringify({ id: latest === "v0.2.0" ? 2 : 3, tag_name: latest, draft: false, prerelease: false, assets: [{ id: latest === "v0.2.0" ? 12 : 13, name: `agent-coordination-framework-${latest}-win32-x64.zip`, state: "uploaded", size: asset.bytes.length, digest: asset.digest }] }));
    else if (request.url === `/repos/fixture/framework/commits/${latest}`) response.end(JSON.stringify({ sha: "b".repeat(40) }));
    else if (request.url === "/repos/fixture/framework/releases/assets/12") response.end(archives.get("v0.2.0")!.bytes);
    else if (request.url === "/repos/fixture/framework/releases/assets/13") response.end(archives.get("v0.3.0")!.bytes);
    else response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const env = { ...process.env, COORDINATION_RELEASE_ROOT: root, GITHUB_TOKEN: "", GH_TOKEN: "", RETENTION_WORKER_STARTED: join(fixture, "worker-started") };
  await exec(process.execPath, [resolve("scripts/install-release-launcher.mjs"), "--root", root, "--repository", "fixture/framework", "--api-base", `http://127.0.0.1:${address.port}`], { env });
  const launcher = join(root, "launch-latest.mjs");
  const a = spawn(process.execPath, [launcher, "stay"], { env, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => stopHost(a));
  let output = "";
  a.stdout.on("data", data => { output += data; });
  await new Promise<void>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(output)), 15_000);
    const observe = (): void => { if (output.includes("INSTALLED:v0.2.0")) { clearTimeout(timeout); a.stdout.off("data", observe); accept(); } };
    a.stdout.on("data", observe); observe();
  });
  // An independently owned worker can survive the host whose lease will end.
  worker = spawn(process.execPath, [join(root, "releases/v0.2.0/worker.mjs")], { env, stdio: "ignore" });
  for (let attempt = 0; ; attempt++) {
    if (await access(env.RETENTION_WORKER_STARTED).then(() => true, () => false)) break;
    assert.ok(attempt < 100, "controlled worker must start"); await delay(25);
  }
  latest = "v0.3.0";
  const starters = await Promise.all([1, 2].map(() => exec(process.execPath, [launcher, "validate", "fixture"], { env })));
  for (const started of starters) assert.match(started.stdout, /INSTALLED:v0.3.0/);
  await access(join(root, "releases/v0.2.0/later.mjs"));
  const late = new Promise<string>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(output)), 5_000);
    const observe = (data: Buffer): void => { if (data.toString().includes("LATE:")) { clearTimeout(timeout); a.stdout.off("data", observe); accept(data.toString()); } };
    a.stdout.on("data", observe);
  });
  a.stdin.write("later child\n");
  assert.match(await late, /LATE:v0.2.0/);
  await stopHost(a);
  await exec(process.execPath, [launcher, "validate", "fixture"], { env });
  await access(join(root, "releases/v0.2.0/worker.mjs"));
  await stopHost(worker);
  const outside = join(fixture, "outside-cache");
  await mkdir(outside);
  const sentinel = join(outside, "keep.txt");
  await writeFile(sentinel, "Unrelated data must survive");
  const junction = join(root, "releases/v0.2.0/external");
  await symlink(outside, junction, "junction");
  await exec(process.execPath, [launcher, "validate", "fixture"], { env });
  await access(join(root, "releases/v0.2.0/launch.mjs"));
  assert.equal(await readFile(sentinel, "utf8"), "Unrelated data must survive");
  await unlink(junction);
  // Concurrent test processes can briefly be present in Win32_Process without
  // readable startup details. The product must defer rather than guess; retry
  // only that explicit uncertainty, never a silent failed retention decision.
  for (let attempt = 0; ; attempt++) {
    const cleanup = await exec(process.execPath, [launcher, "validate", "fixture"], { env });
    const remains = await access(join(root, "releases/v0.2.0")).then(() => true, error => { if (error.code === "ENOENT") return false; throw error; });
    if (!remains) break;
    assert.match(cleanup.stderr, /cleanup deferred/, "an unused version must be removed once process evidence is certain");
    assert.ok(attempt < 10, cleanup.stderr);
    await delay(100);
  }
  await access(join(root, "releases/v0.3.0/launch.mjs"));
  assert.equal(await readFile(sentinel, "utf8"), "Unrelated data must survive");
  assert.equal(await readFile(join(legacy, "evidence.txt"), "utf8"), "Keep uncertain legacy work");
});

import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const exec = promisify(execFile);
const commit = "1234567890abcdef1234567890abcdef12345678";

test("startup installs a verified committed download and preserves the accepted installation on bad updates", { timeout: 60_000, skip: process.platform !== "win32" || process.arch !== "x64" }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "framework-download-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const root = join(fixture, "cache");
  const application = join(fixture, "application");
  const required = ["src/cli.ts", "src/startup-progress-worker.ts", "src/runtime/codex-worker.ts", "src/mcp/stdio-server.ts", "src/application/internal/migrations/current-schema.sql", "dist/web/index.html", "node_modules/@openai/codex-sdk/package.json"];
  await mkdir(application);
  for (const name of required) { await mkdir(dirname(join(application, name)), { recursive: true }); await writeFile(join(application, name), "fixture"); }
  const applicationSource = (id: string): string => `console.log('INSTALLED-APP:${id}');
if (process.argv.includes('stay')) process.stdin.on('data', async () => console.log('LATE:' + (await import(new URL('./later.mjs', import.meta.url))).id));
`;
  await writeFile(join(application, "launch.mjs"), applicationSource("v0.2.0"));
  await writeFile(join(application, "later.mjs"), "export const id = 'v0.2.0';\n");
  await writeFile(join(application, "release.json"), JSON.stringify({ formatVersion: 1, id: "v0.2.0", ready: true, sourceDigest: "a".repeat(64), sourceRevision: commit, sourceTag: "v0.2.0", sourceKind: "committed-release", platform: process.platform, architecture: process.arch, nodeMajor: 24 }));
  const archive = join(fixture, "application.zip");
  // The actual archive helper is a public packaging/extraction boundary.
  await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/release-archive.ps1"), "-Mode", "Pack", "-Source", application, "-Destination", archive]);
  let bytes = await readFile(archive);
  const digest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  let tag = "v0.2.0";
  let expectedDigest = digest;
  let unavailable = false;
  let malformed = false;
  let missing: "none" | "release" | "tag" | "asset" = "none";
  let expectedCommit = commit;
  let downloads = 0;
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, undefined, "test and public downloads never receive inherited credentials");
    if (unavailable) { response.writeHead(503).end(); return; }
    if (request.url === "/repos/fixture/framework/releases/latest") {
      if (missing === "release") response.writeHead(404).end();
      else response.end(JSON.stringify({ id: tag === "v0.2.0" ? 1 : 2, tag_name: tag, draft: malformed, prerelease: false, assets: [{ id: 11, name: `agent-coordination-framework-${tag}-${process.platform}-${process.arch}.zip`, state: "uploaded", size: bytes.length, digest: expectedDigest }] }));
    }
    else if (request.url === `/repos/fixture/framework/commits/${tag}`) {
      if (missing === "tag") response.writeHead(404).end();
      else response.end(JSON.stringify({ sha: expectedCommit }));
    }
    else if (request.url === "/repos/fixture/framework/releases/assets/11") {
      if (missing === "asset") response.writeHead(404).end();
      else { downloads++; response.end(bytes); }
    }
    else response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(() => new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const environment = { ...process.env, COORDINATION_RELEASE_ROOT: root, GITHUB_TOKEN: "", GH_TOKEN: "" };
  await exec(process.execPath, [resolve("scripts/install-release-launcher.mjs"), "--root", root, "--repository", "fixture/framework", "--api-base", `http://127.0.0.1:${address.port}`], { env: environment });
  const launcher = join(root, "launch-latest.mjs");
  unavailable = true;
  await assert.rejects(exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment }), /No verified cached installation/);
  await assert.rejects(readFile(join(root, "latest.json")), /ENOENT/);
  unavailable = false;
  const first = await exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment });
  assert.match(first.stdout, /INSTALLED-APP:v0.2.0/);
  assert.equal(downloads, 1);
  const selection = await readFile(join(root, "latest.json"), "utf8");
  const source = await readFile(join(root, "releases/v0.2.0/launch.mjs"), "utf8");
  await exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment });
  assert.equal(downloads, 1, "same accepted asset is reused");
  missing = "release";
  const unpublished = await exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment });
  assert.match(unpublished.stdout, /INSTALLED-APP:v0.2.0/);
  assert.match(unpublished.stderr, /cached|installed/i);
  tag = "v0.3.0";
  for (const absent of ["tag", "asset"] as const) {
    missing = absent;
    await assert.rejects(exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment }), /HTTP 404/);
    assert.equal(await readFile(join(root, "latest.json"), "utf8"), selection, `a declared missing ${absent} cannot select or run cached fallback`);
  }
  missing = "none"; tag = "v0.2.0";
  const running = spawn(process.execPath, [launcher, "stay"], { env: environment, stdio: ["pipe", "pipe", "pipe"] });
  t.after(() => stopHost(running));
  let runningOutput = "";
  running.stdout.on("data", chunk => { runningOutput += chunk; });
  await new Promise<void>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(runningOutput)), 5_000);
    const observe = (): void => { if (runningOutput.includes("INSTALLED-APP:v0.2.0")) { clearTimeout(timeout); running.stdout.off("data", observe); accept(); } };
    running.stdout.on("data", observe); observe();
  });
  tag = "v0.3.0"; expectedDigest = "sha256:" + "0".repeat(64);
  await assert.rejects(exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment }), /SHA-256|digest|checksum/i);
  assert.equal(await readFile(join(root, "latest.json"), "utf8"), selection);
  assert.equal(await readFile(join(root, "releases/v0.2.0/launch.mjs"), "utf8"), source);
  await writeFile(join(application, "launch.mjs"), applicationSource(tag));
  await writeFile(join(application, "later.mjs"), `export const id = '${tag}';\n`);
  const metadataPath = join(application, "release.json");
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  await writeFile(metadataPath, JSON.stringify({ ...metadata, id: tag, sourceTag: tag }));
  const nextArchive = join(fixture, "application-b.zip");
  await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", resolve("scripts/release-archive.ps1"), "-Mode", "Pack", "-Source", application, "-Destination", nextArchive]);
  bytes = await readFile(nextArchive);
  expectedDigest = "sha256:" + createHash("sha256").update(bytes).digest("hex");
  expectedCommit = "b".repeat(40);
  await assert.rejects(exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment }), /committed artifact|revision|conflict/i);
  assert.equal(await readFile(join(root, "latest.json"), "utf8"), selection);
  expectedCommit = commit;
  const starters = await Promise.all([1, 2].map(() => exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment })));
  for (const started of starters) assert.match(started.stdout, /INSTALLED-APP:v0.3.0/);
  const late = new Promise<string>((accept, reject) => {
    const timeout = setTimeout(() => reject(new Error(runningOutput)), 5_000);
    const observe = (chunk: Buffer): void => { if (chunk.toString().includes("LATE:")) { clearTimeout(timeout); running.stdout.off("data", observe); accept(chunk.toString()); } };
    running.stdout.on("data", observe);
  });
  running.stdin.write("inspect later child\n");
  assert.match(await late, /LATE:v0.2.0/);
  assert.equal(await readFile(join(root, "releases/v0.2.0/launch.mjs"), "utf8"), source);
  unavailable = true;
  const cached = await exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment });
  assert.match(cached.stdout, /INSTALLED-APP:v0.3.0/);
  assert.match(cached.stderr, /cached|installed/i);
  unavailable = false; malformed = true;
  await assert.rejects(exec(process.execPath, [launcher, "validate", "unused-fixture"], { env: environment }), /invalid|stable version/);
  const managedSelection = await readFile(join(root, "latest.json"), "utf8");
  await assert.rejects(exec(process.execPath, [resolve("scripts/publish-local-release.mjs"), "--root", root, "--id", "development-snapshot"], { env: environment }), /managed by shared GitHub releases/);
  assert.equal(await readFile(join(root, "latest.json"), "utf8"), managedSelection);
});

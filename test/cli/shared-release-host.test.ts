import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createReadStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { stopHost } from "../support/cli-host-lifecycle.ts";

const exec = promisify(execFile);

test("a hosted tagged artifact starts the real application without the source checkout", { timeout: 360_000, skip: process.platform !== "win32" || process.arch !== "x64" }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "framework-hosted-host-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const source = join(fixture, "source");
  for (const name of ["src", "web", "schemas", "package.json", "pnpm-lock.yaml", "vite.config.ts"]) {
    await cp(resolve(name), join(source, name), { recursive: true });
  }
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  await writeFile(join(source, "package.json"), JSON.stringify({ ...manifest, version: "0.1.0" }));
  await mkdir(join(source, "scripts"));
  for (const name of ["build-release-artifact.mjs", "create-local-release.mjs", "release-archive.ps1"]) {
    await cp(resolve("scripts", name), join(source, "scripts", name));
  }
  await exec("git", ["init", "--initial-branch=main", source]);
  await exec("git", ["-C", source, "add", "."]);
  await exec("git", ["-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Committed application fixture"]);
  await exec("git", ["-C", source, "tag", "v0.1.0"]);
  const build = await exec(process.execPath, [resolve("scripts/build-release-artifact.mjs"), "--source", source, "--tag", "v0.1.0", "--out", join(fixture, "assets")], { timeout: 280_000, maxBuffer: 4 * 1024 * 1024 });
  const artifact = JSON.parse(build.stdout.trim().split("\n").at(-1)!) as { archive: string; commit: string; sha256: string };
  const size = (await stat(artifact.archive)).size;
  let discoveries = 0;
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, undefined);
    if (request.url === "/repos/fixture/framework/releases/latest") {
      discoveries++;
      response.end(JSON.stringify({ id: 21, tag_name: "v0.1.0", draft: false, prerelease: false,
        assets: [{ id: 22, name: "agent-coordination-framework-v0.1.0-win32-x64.zip", state: "uploaded", size, digest: `sha256:${artifact.sha256}` }] }));
    } else if (request.url === "/repos/fixture/framework/commits/v0.1.0") {
      response.end(JSON.stringify({ sha: artifact.commit }));
    } else if (request.url === "/repos/fixture/framework/releases/assets/22") {
      createReadStream(artifact.archive).pipe(response);
    } else response.writeHead(404).end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept())));
  const address = server.address(); assert.ok(address && typeof address !== "string");
  const root = join(fixture, "cache");
  const environment = { ...process.env, COORDINATION_RELEASE_ROOT: root, GITHUB_TOKEN: "", GH_TOKEN: "" };
  await exec(process.execPath, [resolve("scripts/install-release-launcher.mjs"), "--root", root, "--repository", "fixture/framework", "--api-base", `http://127.0.0.1:${address.port}`], { env: environment });
  // No runtime path can resolve back into the development fixture.
  await rm(source, { recursive: true, force: true });
  const project = join(fixture, "project");
  await exec("git", ["init", "--initial-branch=main", project]);
  const definition = join(fixture, "process.yaml");
  await writeFile(definition, `schemaVersion: 1
name: Hosted artifact proof
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Inspect fixed committed application.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Retain evidence.
    columns:
      - id: backlog
        name: Backlog
`);
  const host = spawn(process.execPath, [join(root, "launch-latest.mjs"), "start", "--project", project, "--process", definition, "--port", "0"], { env: environment, stdio: ["ignore", "pipe", "pipe"] });
  try {
    let output = "";
    await new Promise<void>((accept, reject) => {
      const timeout = setTimeout(() => finish(new Error(`Hosted startup timed out: ${output}`)), 100_000);
      const observe = (data: Buffer): void => { output += data.toString(); if (output.includes("Startup mode: paused")) finish(); };
      const exited = (): void => finish(new Error(`Hosted startup exited early: ${output}`));
      const finish = (error?: Error): void => {
        clearTimeout(timeout); host.stdout.off("data", observe); host.stderr.off("data", observe); host.off("exit", exited);
        if (error) reject(error); else accept();
      };
      host.stdout.on("data", observe); host.stderr.on("data", observe); host.once("exit", exited);
    });
    assert.match(output, /Framework release: v0.1.0/);
    const baseUrl = output.match(/Coordination application listening at (http:\/\/[^\s]+)/)?.[1];
    assert.ok(baseUrl);
    const browser = await fetch(baseUrl);
    assert.equal(browser.status, 200);
    assert.match(await browser.text(), /Agent Coordination/);
    assert.equal(discoveries, 1, "host startup resolves latest once");
    const metadata = JSON.parse(await readFile(join(root, "releases/v0.1.0/release.json"), "utf8"));
    assert.equal(metadata.sourceRevision, artifact.commit);
    assert.equal(metadata.sourceKind, "committed-release");
    assert.equal((await exec("git", ["-C", project, "config", "--get", "coordination.projectStateRoot"])).stdout.trim(), `${project}-agent-coordination-state`);
  } finally { await stopHost(host); }
});

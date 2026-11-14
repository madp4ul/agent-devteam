import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const builder = resolve("scripts/build-release-artifact.mjs");
const archiveTool = resolve("scripts/release-archive.ps1");

test("a shared release contains the tagged commit and ignores dirty working-tree edits", { timeout: 180_000, skip: process.platform !== "win32" || process.arch !== "x64" }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "committed-release-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const source = join(fixture, "source");
  await mkdir(source);
  for (const name of ["src", "web", "schemas", "package.json", "pnpm-lock.yaml", "vite.config.ts"]) await cp(resolve(name), join(source, name), { recursive: true });
  const tooling = ["build-release-artifact.mjs", "create-local-release.mjs", "release-archive.ps1"];
  await mkdir(join(source, "scripts"));
  for (const name of tooling) await cp(resolve("scripts", name), join(source, "scripts", name));
  const manifest = JSON.parse(await readFile(join(source, "package.json"), "utf8"));
  await writeFile(join(source, "package.json"), JSON.stringify({ ...manifest, version: "1.2.3" }));
  await exec("git", ["init", "--initial-branch=main", source]);
  await exec("git", ["-C", source, "config", "core.autocrlf", "true"]);
  await exec("git", ["-C", source, "add", "."]);
  await exec("git", ["-C", source, "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "Committed fixture"]);
  const commit = (await exec("git", ["-C", source, "rev-parse", "HEAD"])).stdout.trim();
  await exec("git", ["-C", source, "tag", "v1.2.3"]);
  const committedCli = (await exec("git", ["-C", source, "show", "v1.2.3:src/cli.ts"])).stdout;
  await writeFile(join(source, "src/cli.ts"), "throw new Error('Dirty source must never ship');\n");
  const out = join(fixture, "artifacts");
  const built = await exec(process.execPath, [builder, "--source", source, "--tag", "v1.2.3", "--out", out], { timeout: 150_000, maxBuffer: 4 * 1024 * 1024 });
  const artifact = JSON.parse(built.stdout.trim().split("\n").at(-1)!) as { tag: string; commit: string; archive: string; sha256: string };
  assert.equal(artifact.tag, "v1.2.3");
  assert.equal(artifact.commit, commit);
  assert.match(artifact.archive, /agent-coordination-framework-v1\.2\.3-win32-x64\.zip$/);
  assert.match(artifact.sha256, /^[a-f0-9]{64}$/);
  const extracted = join(fixture, "extracted");
  await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", archiveTool, "-Mode", "Unpack", "-Source", artifact.archive, "-Destination", extracted], { timeout: 30_000 });
  const metadata = JSON.parse(await readFile(join(extracted, "release.json"), "utf8"));
  assert.equal(metadata.id, "v1.2.3");
  assert.equal(metadata.sourceRevision, commit);
  assert.equal(metadata.sourceTag, "v1.2.3");
  assert.equal(metadata.sourceKind, "committed-release");
  assert.equal(await readFile(join(extracted, "src/cli.ts"), "utf8"), committedCli);
  for (const changed of tooling) {
    const runner = join(fixture, `runner-${changed}`);
    await mkdir(join(runner, "scripts"), { recursive: true });
    for (const name of tooling) await cp(resolve("scripts", name), join(runner, "scripts", name));
    const path = join(runner, "scripts", changed);
    await writeFile(path, await readFile(path, "utf8") + (changed.endsWith(".ps1") ? "\n# Dirty tooling edit\n" : "\n// Dirty tooling edit\n"));
    const rejectedOutput = join(runner, "artifacts");
    await assert.rejects(exec(process.execPath, [join(runner, "scripts/build-release-artifact.mjs"), "--source", source, "--tag", "v1.2.3", "--out", rejectedOutput]), /release tooling.*differs from the selected tag/i);
    await assert.rejects(access(rejectedOutput));
  }
  await assert.rejects(exec(process.execPath, [builder, "--source", source, "--tag", "v1.2.3", "--out", out]), /already exists/);
  await assert.rejects(exec(process.execPath, [builder, "--source", source, "--tag", "main", "--out", out]), /version tag/i);
  await assert.rejects(exec(process.execPath, [builder, "--source", source, "--tag", "v9.9.9", "--out", out]), /tag.*not|not.*tag|unknown revision|ambiguous argument/i);
  await exec("git", ["-C", source, "tag", "v1.2.4"]);
  await assert.rejects(exec(process.execPath, [builder, "--source", source, "--tag", "v1.2.4", "--out", out]), /must match the committed package version/);
});

test("the Windows archive boundary preserves hidden and long paths and rejects unsafe entries before extraction", { timeout: 30_000, skip: process.platform !== "win32" }, async (t) => {
  const fixture = await mkdtemp(join(tmpdir(), "release-archive-proof-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));
  const source = join(fixture, "source");
  const deepName = Array.from({ length: 8 }, (_, index) => `segment-${index}-${"x".repeat(26)}`).join("/");
  await mkdir(join(source, deepName), { recursive: true });
  await writeFile(join(source, ".package-evidence"), "Hidden package metadata");
  await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "[System.IO.File]::SetAttributes($env:FIXTURE_HIDDEN_FILE, [System.IO.FileAttributes]::Hidden)"], { env: { ...process.env, FIXTURE_HIDDEN_FILE: join(source, ".package-evidence") } });
  await writeFile(join(source, deepName, "evidence.txt"), "Long path package evidence");
  const zip = join(fixture, "package.zip");
  const run = (mode: string, input: string, destination: string) => exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", archiveTool, "-Mode", mode, "-Source", input, "-Destination", destination]);
  await run("Pack", source, zip);
  const extracted = join(fixture, "extracted");
  await run("Unpack", zip, extracted);
  assert.equal(await readFile(join(extracted, ".package-evidence"), "utf8"), "Hidden package metadata");
  assert.equal(await readFile(join(extracted, deepName, "evidence.txt"), "utf8"), "Long path package evidence");

  const malicious = join(fixture, "malicious.zip");
  await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Add-Type -AssemblyName System.IO.Compression; Add-Type -AssemblyName System.IO.Compression.FileSystem; $zip = [System.IO.Compression.ZipFile]::Open($env:FIXTURE_ARCHIVE, [System.IO.Compression.ZipArchiveMode]::Create); try { [void]$zip.CreateEntry('../escape.txt') } finally { $zip.Dispose() }"], { env: { ...process.env, FIXTURE_ARCHIVE: malicious } });
  const rejected = join(fixture, "rejected");
  await assert.rejects(run("Unpack", malicious, rejected), /Unsafe release ZIP/);
  await assert.rejects(access(rejected));
  await assert.rejects(access(join(fixture, "escape.txt")));
});

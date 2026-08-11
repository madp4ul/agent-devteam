import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { Readable } from "node:stream";
import test from "node:test";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const cliPath = resolve("src/cli.ts");

test("start binds one state root and presents binding failures in configuration-error mode", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-project-state-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Project state fixture\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C", repositoryPath, "-c", "user.name=Project State Test",
    "-c", "user.email=coordination@example.invalid", "commit", "-m", "Initial fixture",
  ]);
  const definitionPath = join(directory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: Project state test
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Recover durable work.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Keep state coherent.
    columns:
      - id: backlog
        name: Backlog
`);

  const expectedRoot = join(dirname(repositoryPath), `${basename(repositoryPath)}-agent-coordination-state`);
  const child = spawnHost(["--process", definitionPath, "--project", repositoryPath, "--port", "0"]);
  t.after(async () => stopHost(child));
  const output = await waitForOutput(child, /Project state root: (.+)/);
  assert.match(output, new RegExp(escapeRegExp(expectedRoot)));
  await access(join(expectedRoot, "coordination.sqlite3"));
  await access(join(expectedRoot, "task-worktrees"));
  const binding = await execFileAsync("git", [
    "-C", repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot",
  ]);
  assert.equal(binding.stdout.trim(), expectedRoot);
  const identity = JSON.parse(await readFile(join(expectedRoot, "project-state.json"), "utf8")) as {
    repositoryPath: string;
  };
  assert.equal(identity.repositoryPath, repositoryPath);
  await stopHost(child);

  await expectConfigurationError(
    ["--process", definitionPath, "--project", repositoryPath, "--state-root", join(directory, "different-state"), "--port", "0"],
    [/already bound/i, /different-state/],
  );

  const databasePath = join(expectedRoot, "coordination.sqlite3");
  const missingDatabasePath = `${databasePath}.missing`;
  await rename(databasePath, missingDatabasePath);
  await expectConfigurationError(
    ["--process", definitionPath, "--project", repositoryPath, "--port", "0"],
    [/bound coordination database .* does not exist/i],
  );
  await rename(missingDatabasePath, databasePath);

  await rename(expectedRoot, `${expectedRoot}-missing`);
  await expectConfigurationError(
    ["--process", definitionPath, "--project", repositoryPath, "--port", "0"],
    [/bound project state root .* does not exist/i],
  );
});

async function expectConfigurationError(arguments_: string[], patterns: RegExp[]): Promise<void> {
  const child = spawnHost(arguments_);
  try {
    const finalPattern = patterns.at(-1);
    assert.ok(finalPattern);
    const output = await waitForOutput(child, finalPattern);
    assert.match(output, /Startup mode: configuration-error/);
    for (const pattern of patterns) assert.match(output, pattern);
  } finally {
    await stopHost(child);
  }
}

function spawnHost(
  arguments_: string[],
  environment: NodeJS.ProcessEnv = {},
): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, ["--experimental-strip-types", cliPath, "start", ...arguments_], {
    env: { ...process.env, ...environment },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stopHost(child: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    once(child, "exit"),
    new Promise<void>((resolvePromise) => {
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
        resolvePromise();
      }, 1_000);
    }),
  ]);
}

function waitForOutput(
  child: ChildProcessByStdio<null, Readable, Readable>,
  pattern: RegExp,
): Promise<string> {
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const timeout = setTimeout(() => finish(new Error(`Timed out waiting for ${pattern}: ${output}`)), 10_000);
    const onData = (chunk: string): void => {
      output += chunk;
      if (pattern.test(output)) finish();
    };
    const onExit = (): void => finish(new Error(`CLI exited before ${pattern}: ${output}`));
    const finish = (error?: Error): void => {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.stderr.off("data", onData);
      child.off("exit", onExit);
      if (error === undefined) resolvePromise(output);
      else reject(error);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", onExit);
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

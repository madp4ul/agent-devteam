import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import type { TaskWorkspaceView } from "../../src/application/coordination-contract.ts";
import { GitTaskWorkspaceManager } from "../../src/application/internal/git-task-workspace.ts";

const run = promisify(execFile);

test("an unregistered task workspace is rejected before ownership trust", async () => {
  const fixture = await createFixture("unregistered");
  const workspace = { path: join(fixture.workspaceRoot, "unregistered"), startingRef: "main", commit: fixture.commit };
  await mkdir(workspace.path, { recursive: true });
  const simulation = differentlyOwnedManager(fixture);

  assert.deepEqual(await simulation.manager.removeForArchival("unregistered", workspace), {
    removed: false, reason: "workspace-registration-invalid",
  });
  assert.equal(simulation.calls.length, 0);
  assert.equal((await stat(workspace.path)).isDirectory(), true);
});

test("a dirty differently owned worktree is retained until discard is confirmed", async () => {
  const fixture = await createFixture("dirty");
  const workspace = await provisionDurableWorkspace(fixture, "dirty");
  await writeFile(join(workspace.path, "untracked.txt"), "keep until confirmed\n");
  const simulation = differentlyOwnedManager(fixture);

  assert.deepEqual(await simulation.manager.removeForArchival("dirty", workspace), {
    removed: false, reason: "workspace-dirty",
  });
  assert.equal((await stat(workspace.path)).isDirectory(), true);
  assert.deepEqual(await simulation.manager.removeForArchival("dirty", workspace, true), { removed: true });
  await assert.rejects(stat(workspace.path));
});

test("a clean differently owned worktree archives normally", async () => {
  const fixture = await createFixture("clean");
  const workspace = await provisionDurableWorkspace(fixture, "clean");
  const simulation = differentlyOwnedManager(fixture);

  assert.deepEqual(await simulation.manager.removeForArchival("clean", workspace), { removed: true });
  await assert.rejects(stat(workspace.path));
});

test("a differently owned worktree with a non-durable HEAD is retained", async () => {
  const fixture = await createFixture("non-durable");
  const workspace = await provisionWorkspace(fixture, "non-durable");
  await writeFile(join(workspace.path, "result.txt"), "committed but unreferenced\n");
  await git(workspace.path, "add", "result.txt");
  await git(workspace.path, "commit", "-m", "Unreferenced result");
  const simulation = differentlyOwnedManager(fixture);

  assert.deepEqual(await simulation.manager.removeForArchival("non-durable", workspace), {
    removed: false, reason: "workspace-commit-not-durable",
  });
  assert.equal((await stat(workspace.path)).isDirectory(), true);
});

test("archival preserves unrelated process-local Git configuration and changes no persistent trust", async (t) => {
  const fixture = await createFixture("bounded-trust");
  const workspace = await provisionDurableWorkspace(fixture, "bounded-trust");
  const globalTrustBefore = await readSafeDirectories(undefined);
  const localTrustBefore = await readSafeDirectories(fixture.repository);
  const original = captureGitConfigEnvironment();
  t.after(() => restoreGitConfigEnvironment(original));
  process.env.GIT_CONFIG_COUNT = "2";
  process.env.GIT_CONFIG_KEY_0 = "core.autocrlf";
  process.env.GIT_CONFIG_VALUE_0 = "false";
  process.env.GIT_CONFIG_KEY_1 = "safe.directory";
  process.env.GIT_CONFIG_VALUE_1 = "*";
  const simulation = differentlyOwnedManager(fixture);

  await simulation.manager.verify("bounded-trust", workspace);

  assert.ok(simulation.calls.length > 0);
  for (const call of simulation.calls) {
    assert.deepEqual(call.safeDirectories, [workspace.path.replaceAll("\\", "/")]);
    assert.equal(call.configuration.get("core.autocrlf"), "false");
  }
  assert.deepEqual(await readSafeDirectories(undefined), globalTrustBefore);
  assert.deepEqual(await readSafeDirectories(fixture.repository), localTrustBefore);
});

test("a remaining dubious-ownership rejection is distinct from removal failure", async () => {
  const fixture = await createFixture("trust-failure");
  const workspace = await provisionDurableWorkspace(fixture, "trust-failure");
  const manager = new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot, async (arguments_, environment) => {
    if (workspaceArgument(arguments_, fixture.workspaceRoot) !== undefined) {
      throw new Error("fatal: detected dubious ownership in repository");
    }
    return (await run("git", arguments_, { env: environment })).stdout;
  });

  assert.deepEqual(await manager.removeForArchival("trust-failure", workspace), {
    removed: false, reason: "workspace-ownership-untrusted",
  });
  assert.equal((await stat(workspace.path)).isDirectory(), true);
});

test("an unexpected verification command failure is not mislabeled as invalid registration", async () => {
  const fixture = await createFixture("inspection-failure");
  const workspace = await provisionDurableWorkspace(fixture, "inspection-failure");
  const simulation = differentlyOwnedManager(fixture, (arguments_) => {
    if (arguments_.includes("--is-inside-work-tree")) throw new Error("simulated Git inspection failure");
  });

  assert.deepEqual(await simulation.manager.removeForArchival("inspection-failure", workspace), {
    removed: false, reason: "workspace-cleanup-failed",
  });
  assert.equal((await stat(workspace.path)).isDirectory(), true);
});

test("an actual removal failure is distinct and leaves an intact registered worktree", async () => {
  const fixture = await createFixture("removal-failure");
  const workspace = await provisionDurableWorkspace(fixture, "removal-failure");
  const simulation = differentlyOwnedManager(fixture, (arguments_) => {
    if (arguments_.includes("remove")) throw new Error("simulated filesystem removal failure");
  });

  assert.deepEqual(await simulation.manager.removeForArchival("removal-failure", workspace), {
    removed: false, reason: "workspace-removal-failed",
  });
  assert.equal((await stat(workspace.path)).isDirectory(), true);
  const registrations = (await git(fixture.repository, "worktree", "list", "--porcelain"))
    .matchAll(/^worktree (.+)$/gmu);
  assert.ok([...registrations].some((match) => samePath(match[1] ?? "", workspace.path)));
});

interface Fixture { repository: string; workspaceRoot: string; commit: string }

async function createFixture(name: string): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), `coordination-owned-worktree-${name}-`));
  const repository = join(directory, "repository");
  await run("git", ["init", "--initial-branch=main", repository]);
  await git(repository, "config", "user.email", "workspace@example.test");
  await git(repository, "config", "user.name", "Workspace Test");
  await writeFile(join(repository, "README.md"), "archive fixture\n");
  await git(repository, "add", "README.md");
  await git(repository, "commit", "-m", "Initial");
  return {
    repository,
    workspaceRoot: join(directory, "workspaces"),
    commit: (await git(repository, "rev-parse", "HEAD")).trim(),
  };
}

async function provisionWorkspace(fixture: Fixture, taskId: string): Promise<TaskWorkspaceView> {
  return new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot).provision(taskId, "main", undefined);
}

async function provisionDurableWorkspace(fixture: Fixture, taskId: string): Promise<TaskWorkspaceView> {
  const workspace = await provisionWorkspace(fixture, taskId);
  await git(workspace.path, "switch", "-c", `durable/${taskId}`);
  return workspace;
}

function differentlyOwnedManager(fixture: Fixture, fail?: (arguments_: string[]) => void): {
  manager: GitTaskWorkspaceManager;
  calls: Array<{ safeDirectories: string[]; configuration: Map<string, string> }>;
} {
  const calls: Array<{ safeDirectories: string[]; configuration: Map<string, string> }> = [];
  const execute = async (arguments_: string[], environment?: NodeJS.ProcessEnv): Promise<string> => {
    const workspacePath = workspaceArgument(arguments_, fixture.workspaceRoot);
    if (workspacePath !== undefined) {
      const configuration = readProcessLocalConfiguration(environment);
      const safeDirectory = configuration.get("safe.directory");
      const safeDirectories = safeDirectory === undefined ? [] : [safeDirectory];
      calls.push({ safeDirectories, configuration });
      if (!safeDirectories.some((path) => samePath(path, workspacePath))) {
        throw new Error(`fatal: detected dubious ownership in repository at '${workspacePath}'`);
      }
    }
    fail?.(arguments_);
    return (await run("git", arguments_, { env: environment })).stdout;
  };
  return { manager: new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot, execute), calls };
}

function workspaceArgument(arguments_: string[], workspaceRoot: string): string | undefined {
  const index = arguments_.indexOf("-C");
  const candidate = index === -1 ? undefined : arguments_[index + 1];
  if (candidate === undefined) return undefined;
  const relativePath = resolve(candidate).slice(resolve(workspaceRoot).length);
  return relativePath.startsWith("\\") || relativePath.startsWith("/") ? candidate : undefined;
}

function readProcessLocalConfiguration(environment: NodeJS.ProcessEnv | undefined): Map<string, string> {
  const count = Number.parseInt(environment?.GIT_CONFIG_COUNT ?? "0", 10);
  const configuration = new Map<string, string>();
  for (let index = 0; index < count; index += 1) {
    const key = environment?.[`GIT_CONFIG_KEY_${index}`];
    const value = environment?.[`GIT_CONFIG_VALUE_${index}`];
    if (key !== undefined && value !== undefined) configuration.set(key, value);
  }
  return configuration;
}

async function readSafeDirectories(repository: string | undefined): Promise<string[]> {
  const arguments_ = repository === undefined
    ? ["config", "--global", "--get-all", "safe.directory"]
    : ["-C", repository, "config", "--local", "--get-all", "safe.directory"];
  try {
    const result = await run("git", arguments_);
    return result.stdout.split(/\r?\n/u).filter((line) => line.length > 0);
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

function captureGitConfigEnvironment(): Map<string, string | undefined> {
  return new Map(Object.keys(process.env)
    .filter((key) => /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(key))
    .map((key) => [key, process.env[key]]));
}

function restoreGitConfigEnvironment(original: Map<string, string | undefined>): void {
  for (const key of Object.keys(process.env)) {
    if (/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(key)) delete process.env[key];
  }
  for (const [key, value] of original) if (value !== undefined) process.env[key] = value;
}

async function git(repositoryPath: string, ...arguments_: string[]): Promise<string> {
  return (await run("git", ["-C", repositoryPath, ...arguments_])).stdout;
}

function samePath(left: string, right: string): boolean {
  return resolve(left).toLocaleLowerCase() === resolve(right).toLocaleLowerCase();
}

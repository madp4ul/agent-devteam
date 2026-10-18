import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import type { TaskWorkspaceView } from "../../src/application/task-contract.ts";
import { GitTaskWorkspaceManager, validateTaskWorkspaceConsistency } from "../../src/application/internal/git-task-workspace.ts";

const run = promisify(execFile);

test("archival refuses nested evidence worktrees even when ignored and discard is confirmed", async () => {
  const fixture = await createFixture("archive-nested-evidence");
  await writeFile(join(fixture.repository, ".gitignore"), "artifacts/\n");
  await git(fixture.repository, "add", ".gitignore");
  await git(fixture.repository, "commit", "-m", "Ignore evidence output");
  const workspace = await provisionWorkspace(fixture, "T-0108");
  const nested = join(workspace.path, "artifacts", "composed");
  await git(fixture.repository, "worktree", "add", "--detach", nested, fixture.commit);
  await writeFile(join(nested, "retained-evidence.txt"), "uncommitted evidence\n");
  const manager = new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot);

  assert.deepEqual(await manager.removeForArchival("T-0108", workspace, true), {
    removed: false, reason: "workspace-nested-worktrees",
  });
  assert.equal(await readFile(join(nested, "retained-evidence.txt"), "utf8"), "uncommitted evidence\n");
  assert.deepEqual(await validateTaskWorkspaceConsistency(fixture.repository, fixture.workspaceRoot, [
    { taskId: "T-0108", workspace },
  ]), []);
  // An older host may already have removed the parent and stranded its child.
  await git(fixture.repository, "worktree", "remove", "--force", workspace.path);
  assert.equal(await manager.inspectInterruptedArchival("T-0108", workspace), "inconsistent");
});

test("partial Git removal preserves remaining files outside active workspaces before completing archival", async () => {
  const fixture = await createFixture("partial-removal");
  const workspace = await provisionDurableWorkspace(fixture, "T-0008");
  const manager = new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot, async (arguments_, environment) => {
    const result = await run("git", arguments_, { env: environment });
    if (arguments_.includes("remove")) {
      // Git on Windows can unregister the worktree before failing to delete
      // files held open by a built application. Reproduce that boundary.
      await mkdir(workspace.path);
      await writeFile(join(workspace.path, "retained-evidence.txt"), "remaining file\n");
      throw new Error("simulated partial Git removal");
    }
    return result.stdout;
  });

  assert.deepEqual(await manager.removeForArchival("T-0008", workspace), { removed: true });
  await assert.rejects(stat(workspace.path));
  const recoveryRoot = join(dirname(fixture.workspaceRoot), "archival-remainders");
  const preserved = (await readdir(recoveryRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory());
  assert.equal(preserved.length, 1);
  assert.equal(await readFile(join(recoveryRoot, preserved[0]!.name, "retained-evidence.txt"), "utf8"), "remaining file\n");
  assert.deepEqual(await validateTaskWorkspaceConsistency(fixture.repository, fixture.workspaceRoot, []), []);
});

test("partial removal that cannot preserve remaining files keeps its archival claim pending", async () => {
  const fixture = await createFixture("partial-removal-blocked");
  const workspace = await provisionDurableWorkspace(fixture, "T-0008");
  await writeFile(join(dirname(fixture.workspaceRoot), "archival-remainders"), "blocked recovery destination\n");
  const manager = new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot, async (arguments_, environment) => {
    const result = await run("git", arguments_, { env: environment });
    if (arguments_.includes("remove")) {
      await mkdir(workspace.path);
      await writeFile(join(workspace.path, "retained-evidence.txt"), "remaining file\n");
      throw new Error("simulated partial Git removal");
    }
    return result.stdout;
  });

  assert.deepEqual(await manager.removeForArchival("T-0008", workspace), {
    removed: false, reason: "workspace-removal-failed", recoveryPending: true,
  });
  assert.equal(await readFile(join(workspace.path, "retained-evidence.txt"), "utf8"), "remaining file\n");
});

test("archival recovery rejects redirected paths and remnants with a Git pointer", async () => {
  const fixture = await createFixture("partial-removal-identity");
  const workspace = await provisionDurableWorkspace(fixture, "T-0008");
  const manager = new GitTaskWorkspaceManager(fixture.repository, fixture.workspaceRoot);
  assert.equal(await manager.inspectInterruptedArchival("another-task", workspace), "inconsistent");
  await git(fixture.repository, "worktree", "remove", workspace.path);
  await mkdir(workspace.path);
  await writeFile(join(workspace.path, ".git"), "unexpected Git identity\n");
  assert.equal(await manager.inspectInterruptedArchival("T-0008", workspace), "inconsistent");
  assert.equal(await readFile(join(workspace.path, ".git"), "utf8"), "unexpected Git identity\n");
});

test("startup preserves agent-created evidence worktrees nested inside a recorded task workspace", async () => {
  const fixture = await createFixture("nested-evidence");
  const workspace = await provisionWorkspace(fixture, "T-0108");
  const evidencePath = join(workspace.path, "artifacts", "T-0108", "composed");
  await git(fixture.repository, "worktree", "add", "--detach", evidencePath, fixture.commit);
  await writeFile(join(evidencePath, "uncommitted-evidence.txt"), "retain this evidence\n");

  assert.deepEqual(await validateTaskWorkspaceConsistency(fixture.repository, fixture.workspaceRoot, [
    { taskId: "T-0108", workspace },
  ]), []);
  assert.equal((await stat(join(evidencePath, "uncommitted-evidence.txt"))).isFile(), true);

  // Relocation must remain blocked until it can repair nested registrations too.
  assert.ok((await validateTaskWorkspaceConsistency(fixture.repository, fixture.workspaceRoot, [
    { taskId: "T-0108", workspace },
  ], { allowNestedEvidenceWorktrees: false })).some((entry) =>
    entry.rule === "Every framework-owned Git worktree registration must have a database workspace record"));

  // Nested evidence must not conceal a missing registration for another task.
  const recordsWithMissingTask = [{ taskId: "T-0108", workspace }, {
    taskId: "T-0109",
    workspace: { ...workspace, path: join(fixture.workspaceRoot, "T-0109") },
  }];
  const diagnostics = await validateTaskWorkspaceConsistency(fixture.repository, fixture.workspaceRoot, recordsWithMissingTask);
  assert.ok(diagnostics.some((entry) => entry.rule === "Every database workspace record must have a Git worktree registration"));
});

test("startup still rejects unrecorded direct and nested worktree registrations", async () => {
  const fixture = await createFixture("unowned-registration");
  const workspace = await provisionWorkspace(fixture, "T-0108");
  const unowned = join(fixture.workspaceRoot, "T-0109");
  const nested = join(unowned, "artifacts", "composed");
  await git(fixture.repository, "worktree", "add", "--detach", unowned, fixture.commit);
  await git(fixture.repository, "worktree", "add", "--detach", nested, fixture.commit);

  const diagnostics = await validateTaskWorkspaceConsistency(fixture.repository, fixture.workspaceRoot, [
    { taskId: "T-0108", workspace },
  ]);
  for (const path of [unowned, nested]) {
    assert.ok(diagnostics.some((entry) => entry.rule === "Every framework-owned Git worktree registration must have a database workspace record"
      && (entry.invalidValue as { path: string }).path === path));
  }
});

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

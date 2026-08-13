import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { access, cp, mkdtemp, open, readFile, rm, statfs, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { promisify } from "node:util";

import {
  type AgentRunLifecycle,
  type AgentRunOutcome,
  type AgentRunRequest,
  type AgentRuntime,
  CoordinationApplication,
} from "../../src/application/coordination-application.ts";

const execFileAsync = promisify(execFile);
const cliPath = resolve("src/cli.ts");

test("relocate-state moves the bound project state to one requested destination", async (t) => {
  const fixture = await createInitializedOfflineFixture();

  const destination = join(fixture.directory, "relocated-state");
  const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

  assert.match(result.stdout, /Project state relocated successfully/);
  assert.match(result.stdout, new RegExp(escapeRegExp(destination)));
  const binding = await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot");
  assert.equal(binding.trim(), destination);
  await assert.rejects(access(fixture.originalStateRoot));
  await access(join(destination, "coordination.sqlite3"));
  const identity = JSON.parse(await readFile(join(destination, "project-state.json"), "utf8")) as {
    repositoryPath: string;
  };
  assert.equal(identity.repositoryPath, fixture.repositoryPath);

  t.after(async () => {
    const restarted = spawnCli(["start", "--process", fixture.definitionPath, "--project", fixture.repositoryPath, "--port", "0"]);
    try {
      const output = await waitForOutput(restarted, /Project state root:/);
      assert.match(output, /Startup mode: paused/);
      assert.match(output, new RegExp(escapeRegExp(destination)));
    } finally {
      await stop(restarted);
    }
  });
});

test("relocate-state preserves and repairs a provisioned task workspace", async () => {
  const fixture = await createInitializedOfflineFixture();

  const runtime = new WorkspaceWritingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(fixture.originalStateRoot, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(fixture.originalStateRoot, "task-worktrees"),
      agentRuntime: runtime,
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve task workspace",
    description: "Relocate every kind of Git state.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-relocation-workspace",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected task creation to succeed");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const before = application.queryTaskInspectionForUser(created.task.id);
  assert.equal(before.available, true);
  if (!before.available || before.task.workspace === null) throw new Error("Expected a provisioned workspace");
  const workspace = before.task.workspace;
  const oldWorkspacePath = workspace.path;
  application.close();

  const destination = join(fixture.directory, "relocated-with-workspace");
  await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);
  const newWorkspacePath = join(destination, "task-worktrees", created.task.id);

  await assert.rejects(access(oldWorkspacePath));
  await access(newWorkspacePath);
  assert.equal((await git(newWorkspacePath, "branch", "--show-current")).trim(), "relocation-work");
  assert.match(await git(newWorkspacePath, "status", "--porcelain"), /dirty\.txt/);
  const registrations = await git(fixture.repositoryPath, "worktree", "list", "--porcelain");
  assert.match(registrations, new RegExp(escapeRegExp(newWorkspacePath.replaceAll("\\", "/")), "i"));
  assert.doesNotMatch(registrations, new RegExp(escapeRegExp(oldWorkspacePath.replaceAll("\\", "/")), "i"));

  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(destination, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(destination, "task-worktrees"),
      agentRuntime: new WorkspaceWritingRuntime(),
    },
  });
  try {
    assert.equal(restarted.queryStartup().mode, "paused");
    const after = restarted.queryTaskInspectionForUser(created.task.id);
    assert.equal(after.available, true);
    if (!after.available) return;
    assert.equal(after.task.workspace?.path, newWorkspacePath);
    const task = restarted.queryTask(created.task.id);
    assert.equal(task.available, true);
    if (task.available) {
      assert.equal(task.task.activations[0]?.attempts[0]?.workspacePath, newWorkspacePath);
    }
  } finally {
    restarted.close();
  }
});

test("relocate-state refuses to run while the coordination application owns the project", async () => {
  const fixture = await createFixture();
  const host = spawnCli(["start", "--process", fixture.definitionPath, "--project", fixture.repositoryPath, "--port", "0"]);
  await waitForOutput(host, /Project state root:/);
  const destination = join(fixture.directory, "must-not-relocate");

  try {
    await assert.rejects(
      runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
      (error: { stderr?: string }) => {
        assert.match(error.stderr ?? "", /project state .*in use|already running/i);
        return true;
      },
    );
    assert.equal(await pathExists(fixture.originalStateRoot), true);
    assert.equal(await pathExists(destination), false);
    assert.equal(
      (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
      fixture.originalStateRoot,
    );
  } finally {
    await stop(host);
  }
});

test("relocate-state stages a cross-volume destination before cutover", async (t) => {
  const fixture = await createInitializedOfflineFixture();
  const destinationParent = await mkdtemp(join(process.cwd(), ".tmp-relocation-cross-volume-"));
  const destination = join(destinationParent, "relocated-state");
  t.after(() => rm(destinationParent, { recursive: true, force: true }));

  const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

  assert.match(result.stdout, /Project state relocated successfully/);
  assert.equal(
    (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
    destination,
  );
  await access(join(destination, "coordination.sqlite3"));
  await assert.rejects(access(fixture.originalStateRoot));
});

test("relocate-state rejects a destination inside the project repository without mutation", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.repositoryPath, "relocated-state");

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      const diagnostic = error.stderr ?? "";
      assert.match(diagnostic, /destination .*project repository/i);
      assert.match(diagnostic, /failed during preflight/i);
      assert.match(diagnostic, new RegExp(`Authoritative root: ${escapeRegExp(fixture.originalStateRoot)}`, "i"));
      assert.match(diagnostic, /Recovery: coordination relocate-state/i);
      return true;
    },
  );
  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), false);
  assert.equal(
    (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
    fixture.originalStateRoot,
  );
});

test("relocate-state resolves junctions before enforcing destination containment", async (t) => {
  for (const forbidden of ["source", "repository"] as const) {
    await t.test(forbidden, async () => {
      const fixture = await createInitializedOfflineFixture();
      const alias = join(fixture.directory, `${forbidden}-alias`);
      await symlink(
        forbidden === "source" ? fixture.originalStateRoot : fixture.repositoryPath,
        alias,
        process.platform === "win32" ? "junction" : "dir",
      );
      const destination = join(alias, "disguised-destination");

      await assert.rejects(
        runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
        (error: { stderr?: string }) => {
          assert.match(error.stderr ?? "", /must not be inside/i);
          return true;
        },
      );
      assert.equal(await pathExists(destination), false);
      assert.equal(
        (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
        fixture.originalStateRoot,
      );
    });
  }
});

test("relocate-state rejects a destination without enough available capacity", async (t) => {
  const fixture = await createInitializedOfflineFixture();
  t.after(() => rm(fixture.directory, { recursive: true, force: true }));
  const destination = join(fixture.directory, "insufficient-capacity-state");
  const oversizedPath = join(fixture.originalStateRoot, "capacity-probe.sparse");
  const capacity = await statfs(fixture.directory, { bigint: true });
  const oversizedBytes = capacity.bavail * capacity.bsize + 16n * 1024n * 1024n;
  assert.ok(oversizedBytes <= BigInt(Number.MAX_SAFE_INTEGER));

  const oversized = await open(oversizedPath, "w");
  try {
    if (process.platform === "win32") {
      await execFileAsync("fsutil", ["sparse", "setflag", oversizedPath]);
    }
    await oversized.truncate(Number(oversizedBytes));
  } finally {
    await oversized.close();
  }

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /insufficient space/i);
      return true;
    },
  );
  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), false);
});

test("relocate-state recovers an interrupted staged copy when the same command is rerun", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.directory, "recovered-relocation");
  const stagingRoot = join(fixture.directory, ".recovered-relocation.coordination-relocation-interrupted");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await writeFile(stagingRoot, "partial staged copy");
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "copying",
    authoritativeRoot: fixture.originalStateRoot,
  }, null, 2)}\n`);

  const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

  assert.match(result.stdout, /Project state relocated successfully/);
  await access(join(destination, "coordination.sqlite3"));
  assert.equal(await pathExists(stagingRoot), false);
  assert.equal(await pathExists(journalPath), false);
});

test("relocate-state fails closed when the bound source is inconsistent", async () => {
  const fixture = await createInitializedOfflineFixture();
  await rm(join(fixture.originalStateRoot, "task-worktrees"), { recursive: true });
  const destination = join(fixture.directory, "must-not-adopt-inconsistent-state");

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /task-worktree directory .*does not exist|inconsistent/i);
      return true;
    },
  );
  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), false);
  assert.equal(
    (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
    fixture.originalStateRoot,
  );
});

test("relocate-state finishes cleanup after an interrupted binding cutover", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.directory, "cut-over-state");
  const stagingRoot = join(fixture.directory, ".cut-over-state.coordination-relocation-completed");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await cp(fixture.originalStateRoot, destination, { recursive: true });
  await git(fixture.repositoryPath, "config", "--local", "coordination.projectStateRoot", destination);
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "binding-switched",
    authoritativeRoot: destination,
  }, null, 2)}\n`);

  const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

  assert.match(result.stdout, /Project state relocated successfully/);
  assert.equal(await pathExists(fixture.originalStateRoot), false);
  assert.equal(await pathExists(destination), true);
  assert.equal(await pathExists(journalPath), false);
  assert.equal(
    (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
    destination,
  );
});

test("relocate-state recognizes a completed destination rename after an interrupted copy phase", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.directory, "renamed-before-journal-update");
  const stagingRoot = join(fixture.directory, ".renamed-before-journal-update.coordination-relocation-missing");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await cp(fixture.originalStateRoot, destination, { recursive: true });
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "copying",
    authoritativeRoot: fixture.originalStateRoot,
  }, null, 2)}\n`);

  const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

  assert.match(result.stdout, /Project state relocated successfully/);
  assert.equal(await pathExists(fixture.originalStateRoot), false);
  assert.equal(await pathExists(destination), true);
  assert.equal(await pathExists(journalPath), false);
});

test("an incomplete operation guard fails closed instead of weakening exclusivity", async () => {
  const fixture = await createInitializedOfflineFixture();
  const guardPath = join(fixture.repositoryPath, ".git", "coordination-project-state.lock");
  const destination = join(fixture.directory, "must-not-pass-incomplete-guard");
  await writeFile(guardPath, "");
  try {
    await assert.rejects(
      runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
      (error: { stderr?: string }) => {
        assert.match(error.stderr ?? "", /lock .*incomplete or invalid|stale ownership cannot be proven/i);
        return true;
      },
    );
    assert.equal(await pathExists(fixture.originalStateRoot), true);
    assert.equal(await pathExists(destination), false);
  } finally {
    await rm(guardPath, { force: true });
  }
});

test("a stale application guard with a durable running attempt blocks relocation until startup recovery", async () => {
  const fixture = await createInitializedOfflineFixture();
  const runtime = new WorkspaceWritingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(fixture.originalStateRoot, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(fixture.originalStateRoot, "task-worktrees"),
      agentRuntime: runtime,
    },
  });
  application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Simulate a crash-owned attempt",
    description: "Leave durable evidence that a child agent may have survived.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "stale-agent-attempt",
  });
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.close();

  const database = new DatabaseSync(join(fixture.originalStateRoot, "coordination.sqlite3"));
  try {
    database.exec("UPDATE activations SET status = 'running' WHERE id = (SELECT activation_id FROM attempts LIMIT 1)");
    database.exec("UPDATE attempts SET status = 'running', completed_at = NULL WHERE id = (SELECT id FROM attempts LIMIT 1)");
  } finally {
    database.close();
  }
  const guardPath = join(fixture.repositoryPath, ".git", "coordination-project-state.lock");
  await writeFile(guardPath, `${JSON.stringify({
    token: "crashed-application",
    pid: 2_147_483_647,
    operation: "application start",
    acquiredAt: new Date().toISOString(),
  })}\n`);
  const destination = join(fixture.directory, "after-crash-recovery");

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /agent attempt left running/i);
      return true;
    },
  );
  const host = spawnCli(["start", "--process", fixture.definitionPath, "--project", fixture.repositoryPath, "--port", "0"]);
  await waitForOutput(host, /Project state root:/);
  await stop(host);

  await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);
  await access(join(destination, "coordination.sqlite3"));
});

test("relocate-state rewrites historical attempt paths after workspace archival", async () => {
  const fixture = await createInitializedOfflineFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(fixture.originalStateRoot, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(fixture.originalStateRoot, "task-worktrees"),
      agentRuntime: new WorkspaceWritingRuntime(),
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Retain archived attempt history",
    description: "The workspace can disappear while its historical path remains meaningful.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-archived-relocation-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected task creation to succeed");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  const archived = await application.archiveTask({
    taskId: created.task.id,
    discardWorkspaceChanges: true,
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "archive-before-relocation",
  });
  assert.equal(archived.accepted, true);
  application.close();

  const destination = join(fixture.directory, "relocated-archived-history");
  await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);
  const restarted = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(destination, "coordination.sqlite3"),
  });
  try {
    const task = restarted.queryTask(created.task.id);
    assert.equal(task.available, true);
    if (task.available) {
      assert.equal(
        task.task.activations[0]?.attempts[0]?.workspacePath,
        join(destination, "task-worktrees", created.task.id),
      );
    }
  } finally {
    restarted.close();
  }
});

test("relocate-state preserves a detached task workspace and uncommitted state", async () => {
  const fixture = await createInitializedOfflineFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(fixture.originalStateRoot, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(fixture.originalStateRoot, "task-worktrees"),
      agentRuntime: new WorkspaceWritingRuntime(true),
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Preserve a detached workspace",
    description: "Detached HEAD and dirty files must survive relocation.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-detached-relocation-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected task creation to succeed");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.close();

  const destination = join(fixture.directory, "relocated-detached-workspace");
  await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);
  const workspacePath = join(destination, "task-worktrees", created.task.id);
  assert.equal((await git(workspacePath, "branch", "--show-current")).trim(), "");
  assert.match(await git(workspacePath, "status", "--porcelain"), /dirty\.txt/);
});

test("startup blocks an unfinished relocation and releases its guard for recovery", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.directory, "startup-blocked-destination");
  const stagingRoot = join(fixture.directory, ".startup-blocked-destination.coordination-relocation-partial");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await writeFile(stagingRoot, "partial staged copy");
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "copying",
    authoritativeRoot: fixture.originalStateRoot,
  }, null, 2)}\n`);

  await assert.rejects(
    runCli(["start", "--process", fixture.definitionPath, "--project", fixture.repositoryPath, "--port", "0"]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /relocation .*unfinished.*recover it with/is);
      return true;
    },
  );
  const recovered = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);
  assert.match(recovered.stdout, /Project state relocated successfully/);
});

test("verified cutover reports an inert source that cannot be safely removed", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.directory, "cut-over-with-inert-source");
  const stagingRoot = join(fixture.directory, ".cut-over-with-inert-source.coordination-relocation-completed");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await cp(fixture.originalStateRoot, destination, { recursive: true });
  const sourceIdentityPath = join(fixture.originalStateRoot, "project-state.json");
  const sourceIdentity = JSON.parse(await readFile(sourceIdentityPath, "utf8")) as Record<string, unknown>;
  await writeFile(sourceIdentityPath, `${JSON.stringify({ ...sourceIdentity, repositoryPath: join(fixture.directory, "other") }, null, 2)}\n`);
  await git(fixture.repositoryPath, "config", "--local", "coordination.projectStateRoot", destination);
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "binding-switched",
    authoritativeRoot: destination,
  }, null, 2)}\n`);

  const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

  assert.match(result.stdout, /Project state relocated successfully/);
  assert.match(result.stderr, new RegExp(`old project state is inert.*${escapeRegExp(fixture.originalStateRoot)}`, "i"));
  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), true);
});

test("a destination database failure rolls back to the intact source", async () => {
  const fixture = await createInitializedOfflineFixture();
  const destination = join(fixture.directory, "invalid-destination-database");
  const stagingRoot = join(fixture.directory, ".invalid-destination-database.coordination-relocation-completed");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await cp(fixture.originalStateRoot, destination, { recursive: true });
  await writeFile(join(destination, "coordination.sqlite3"), "not a SQLite database");
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "destination-ready",
    authoritativeRoot: fixture.originalStateRoot,
  }, null, 2)}\n`);

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /database|file is not a database/i);
      return true;
    },
  );
  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), false);
  assert.equal(await pathExists(journalPath), false);
  assert.equal(
    (await git(fixture.repositoryPath, "config", "--local", "--get", "coordination.projectStateRoot")).trim(),
    fixture.originalStateRoot,
  );
});

test("relocate-state rejects an escaped persisted attempt path before copying", async () => {
  const fixture = await createInitializedOfflineFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(fixture.originalStateRoot, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(fixture.originalStateRoot, "task-worktrees"),
      agentRuntime: new WorkspaceWritingRuntime(),
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Reject an escaped path",
    description: "Preflight must reject deployment state outside the bound root.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-path-escape-task",
  });
  assert.equal(created.accepted, true);
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.close();
  const database = new DatabaseSync(join(fixture.originalStateRoot, "coordination.sqlite3"));
  try {
    database.prepare("UPDATE attempts SET workspace_path = ?").run(join(fixture.directory, "escaped-workspace"));
  } finally {
    database.close();
  }
  const destination = join(fixture.directory, "must-not-copy-escaped-state");

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /attempt .*workspace path .*outside/i);
      assert.match(error.stderr ?? "", /failed during preflight/i);
      return true;
    },
  );
  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), false);
});

test("relocate-state resumes every durable pre-cutover journal phase", async (t) => {
  for (const phase of ["destination-ready", "git-repaired"] as const) {
    await t.test(phase, async () => {
      const fixture = await createInitializedOfflineFixture();
      const destination = join(fixture.directory, `resume-${phase}`);
      const stagingRoot = join(fixture.directory, `.resume-${phase}.coordination-relocation-completed`);
      const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
      await cp(fixture.originalStateRoot, destination, { recursive: true });
      await writeFile(journalPath, `${JSON.stringify({
        formatVersion: 1,
        source: fixture.originalStateRoot,
        destination,
        stagingRoot,
        phase,
        authoritativeRoot: fixture.originalStateRoot,
      }, null, 2)}\n`);

      const result = await runCli(["relocate-state", destination, "--project", fixture.repositoryPath]);

      assert.match(result.stdout, /Project state relocated successfully/);
      assert.equal(await pathExists(fixture.originalStateRoot), false);
      assert.equal(await pathExists(destination), true);
      assert.equal(await pathExists(journalPath), false);
    });
  }
});

test("a Git-repair failure restores the source registration and keeps its recovery state coherent", async () => {
  const fixture = await createInitializedOfflineFixture();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: join(fixture.originalStateRoot, "coordination.sqlite3"),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: join(fixture.originalStateRoot, "task-worktrees"),
      agentRuntime: new WorkspaceWritingRuntime(),
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Fail destination Git repair",
    description: "Rollback must restore the original registered workspace.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: "create-git-repair-failure-task",
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected task creation to succeed");
  await application.resumeAutomation();
  await application.waitForAutomationIdle();
  application.close();

  const destination = join(fixture.directory, "git-repair-failure-destination");
  const stagingRoot = join(fixture.directory, ".git-repair-failure-destination.coordination-relocation-completed");
  const journalPath = join(fixture.repositoryPath, ".git", "coordination-project-state-relocation.json");
  await cp(fixture.originalStateRoot, destination, { recursive: true });
  const destinationWorkspaceRoot = join(destination, "task-worktrees");
  const database = new DatabaseSync(join(destination, "coordination.sqlite3"));
  try {
    database.prepare("UPDATE task_workspaces SET path = replace(path, ?, ?)")
      .run(join(fixture.originalStateRoot, "task-worktrees"), destinationWorkspaceRoot);
    database.prepare("UPDATE attempts SET workspace_path = replace(workspace_path, ?, ?)")
      .run(join(fixture.originalStateRoot, "task-worktrees"), destinationWorkspaceRoot);
  } finally {
    database.close();
  }
  await rm(join(destinationWorkspaceRoot, created.task.id), { recursive: true, force: true });
  await writeFile(journalPath, `${JSON.stringify({
    formatVersion: 1,
    source: fixture.originalStateRoot,
    destination,
    stagingRoot,
    phase: "destination-ready",
    authoritativeRoot: fixture.originalStateRoot,
  }, null, 2)}\n`);

  await assert.rejects(runCli(["relocate-state", destination, "--project", fixture.repositoryPath]));

  assert.equal(await pathExists(fixture.originalStateRoot), true);
  assert.equal(await pathExists(destination), false);
  assert.equal(await pathExists(journalPath), false);
  const registrations = await git(fixture.repositoryPath, "worktree", "list", "--porcelain");
  assert.match(
    registrations,
    new RegExp(escapeRegExp(join(fixture.originalStateRoot, "task-worktrees", created.task.id).replaceAll("\\", "/")), "i"),
  );
});

test("relocate-state never removes a bound source that contains the project repository", async () => {
  const fixture = await createFixture();
  const host = spawnCli([
    "start",
    "--process", fixture.definitionPath,
    "--project", fixture.repositoryPath,
    "--state-root", fixture.directory,
    "--port", "0",
  ]);
  try {
    await waitForOutput(host, /Project state root:/);
  } finally {
    await stop(host);
  }
  const destination = `${fixture.directory}-safe-destination`;

  await assert.rejects(
    runCli(["relocate-state", destination, "--project", fixture.repositoryPath]),
    (error: { stderr?: string }) => {
      assert.match(error.stderr ?? "", /state root .*must not equal or contain the project repository/i);
      return true;
    },
  );
  await access(join(fixture.repositoryPath, "README.md"));
  assert.equal(await pathExists(destination), false);
});

async function createFixture(): Promise<{
  directory: string;
  repositoryPath: string;
  definitionPath: string;
  originalStateRoot: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-relocation-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Relocation fixture\n");
  await git(repositoryPath, "add", "README.md");
  await execFileAsync("git", [
    "-C", repositoryPath,
    "-c", "user.name=Relocation Test",
    "-c", "user.email=coordination@example.invalid",
    "commit", "-m", "Initial fixture",
  ]);
  const definitionPath = join(directory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: Relocation test
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep state coherent.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements relocation fixtures
    summary: Creates durable Git state.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep state coherent.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`);
  await writeFile(join(directory, "implementer.md"), "Create durable task-workspace state.\n");
  return {
    directory,
    repositoryPath,
    definitionPath,
    originalStateRoot: join(directory, "project-agent-coordination-state"),
  };
}

async function createInitializedOfflineFixture(): ReturnType<typeof createFixture> {
  const fixture = await createFixture();
  const host = spawnCli([
    "start",
    "--process", fixture.definitionPath,
    "--project", fixture.repositoryPath,
    "--port", "0",
  ]);
  try {
    await waitForOutput(host, /Project state root:/);
  } finally {
    await stop(host);
  }
  return fixture;
}

class WorkspaceWritingRuntime implements AgentRuntime {
  readonly #detachAfterCommit: boolean;

  constructor(detachAfterCommit = false) {
    this.#detachAfterCommit = detachAfterCommit;
  }

  async run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    lifecycle.started("relocation-thread");
    await git(request.workspace.path, "switch", "-c", "relocation-work");
    await writeFile(join(request.workspace.path, "committed.txt"), "committed before relocation\n");
    await git(request.workspace.path, "add", "committed.txt");
    await execFileAsync("git", [
      "-C", request.workspace.path,
      "-c", "user.name=Relocation Agent",
      "-c", "user.email=coordination@example.invalid",
      "commit", "-m", "Preserve this commit",
    ]);
    if (this.#detachAfterCommit) await git(request.workspace.path, "switch", "--detach");
    await writeFile(join(request.workspace.path, "dirty.txt"), "uncommitted relocation state\n");
    return { status: "completed", summary: "Prepared Git state for relocation." };
  }
}

function runCli(arguments_: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(process.execPath, ["--experimental-strip-types", cliPath, ...arguments_]);
}

function spawnCli(arguments_: string[]): ChildProcessByStdio<null, Readable, Readable> {
  return spawn(process.execPath, ["--experimental-strip-types", cliPath, ...arguments_], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function stop(child: ChildProcessByStdio<null, Readable, Readable>): Promise<void> {
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

function waitForOutput(child: ChildProcessByStdio<null, Readable, Readable>, pattern: RegExp): Promise<string> {
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

async function git(repositoryPath: string, ...arguments_: string[]): Promise<string> {
  return (await execFileAsync("git", ["-C", repositoryPath, ...arguments_])).stdout;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pathExists(path: string): Promise<boolean> {
  return access(path).then(() => true, () => false);
}

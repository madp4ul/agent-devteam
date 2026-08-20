import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRuntime,
} from "../../src/application/runtime-contract.ts";

const execFileAsync = promisify(execFile);

test("a task workspace reports branch progress and overlapping working changes", async (t) => {
  const fixture = await createFixture("branch-progress");
  const { application, workspacePath, taskId } = await provisionWorkspace(fixture);
  t.after(() => application.close());

  await git(workspacePath, "switch", "-c", "task-33");
  await writeFile(join(workspacePath, "progress.txt"), "committed progress\n");
  await git(workspacePath, "add", "progress.txt");
  await git(workspacePath, "commit", "-m", "Make progress");
  await writeFile(join(workspacePath, "README.md"), "# Test project\nstaged line\n");
  await git(workspacePath, "add", "README.md");
  await writeFile(join(workspacePath, "README.md"), "# Test project\nstaged line\nunstaged line\n");
  await writeFile(join(workspacePath, "untracked.txt"), "not tracked\n");
  const headHash = (await git(workspacePath, "rev-parse", "--short=7", "HEAD")).trim();

  const result = await application.queryTaskWorkspaceGitState(taskId);

  assert.deepEqual(result, {
    available: true,
    state: {
      head: { kind: "branch", name: "task-33", shortHash: headHash },
      history: { kind: "progress", commitsSinceTaskStart: 1 },
      changes: {
        additions: 2,
        deletions: 0,
        stagedFiles: 1,
        unstagedFiles: 1,
        untrackedFiles: 1,
      },
    },
  });
});

test("a detached task workspace reports its short hash and divergent history", async (t) => {
  const fixture = await createFixture("diverged");
  const unrelatedCommit = await createUnrelatedCommit(fixture.repositoryPath);
  const { application, workspacePath, taskId } = await provisionWorkspace(fixture);
  t.after(() => application.close());

  await git(workspacePath, "switch", "--detach", unrelatedCommit);

  const result = await application.queryTaskWorkspaceGitState(taskId);

  assert.deepEqual(result, {
    available: true,
    state: {
      head: { kind: "detached", shortHash: unrelatedCommit.slice(0, 7) },
      history: { kind: "diverged" },
      changes: {
        additions: 0,
        deletions: 0,
        stagedFiles: 0,
        unstagedFiles: 0,
        untrackedFiles: 0,
      },
    },
  });
});

async function provisionWorkspace(fixture: Fixture): Promise<{
  application: CoordinationApplication;
  workspacePath: string;
  taskId: string;
}> {
  const runtime = new CompletingRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "implementation",
    title: "Inspect workspace state",
    description: "Show the current Git state without exposing files.",
    actor: { kind: "user", id: "test-user" },
    idempotencyKey: `create-${fixture.name}`,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Could not create task");
  const resumed = await application.resumeAutomation();
  assert.equal(resumed.accepted, true);
  await application.waitForAutomationIdle();
  const workspacePath = runtime.requests[0]?.workspace.path;
  assert.ok(workspacePath);
  return { application, workspacePath, taskId: created.task.id };
}

interface Fixture {
  name: string;
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
}

async function createFixture(name: string): Promise<Fixture> {
  const directory = await mkdtemp(join(tmpdir(), `coordination-workspace-state-${name}-`));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Test project\n");
  await git(repositoryPath, "add", "README.md");
  await git(repositoryPath, "commit", "-m", "Initial commit");
  await writeFile(join(directory, "implementer.md"), "Implement the task.\n");
  const definitionPath = join(directory, "process.yaml");
  await writeFile(definitionPath, `schemaVersion: 1
name: Workspace state
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Keep work inspectable.
agents:
  - id: implementer
    name: Implementer
    role: Implements work
    summary: Completes tasks.
    instructions: ./implementer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver work.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`);
  return {
    name,
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

async function createUnrelatedCommit(repositoryPath: string): Promise<string> {
  await git(repositoryPath, "switch", "--orphan", "unrelated");
  await writeFile(join(repositoryPath, "unrelated.txt"), "unrelated history\n");
  await git(repositoryPath, "add", "unrelated.txt");
  await git(repositoryPath, "commit", "-m", "Unrelated root");
  const commit = await git(repositoryPath, "rev-parse", "HEAD");
  await git(repositoryPath, "switch", "main");
  return commit.trim();
}

async function git(repositoryPath: string, ...arguments_: string[]): Promise<string> {
  const result = await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Workspace State Test",
    "-c",
    "user.email=workspace-state@example.invalid",
    ...arguments_,
  ]);
  return result.stdout;
}

class CompletingRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started();
    return Promise.resolve({ status: "completed", summary: "Completed." });
  }
}

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Codex, type ThreadEvent } from "@openai/codex-sdk";

const execFileAsync = promisify(execFile);
const runRealCodex = process.env.COORDINATION_RUN_CODEX_CAPABILITY_PROBE === "1";

test(
  "a real SDK thread can complete linked-worktree Git writes through automatic approval review",
  { skip: !runRealCodex, timeout: 10 * 60 * 1_000 },
  async () => {
    const fixture = await createLinkedWorktreeFixture();
    const codex = new Codex({
      env: gitTrustedEnvironment(fixture.worktreePath),
      config: { approvals_reviewer: "auto_review" },
    });
    const thread = codex.startThread({
      workingDirectory: fixture.worktreePath,
      approvalPolicy: "on-request",
    });
    const { events } = await thread.runStreamed(
      `This is a deterministic capability probe in a disposable linked Git worktree.
Perform these steps in order and do no other work:
1. Run: git status --short
2. Run: git switch -c codex/capability-probe
3. Create probe.txt containing exactly: SDK capability probe passed
4. Run: node verify.mjs
5. Run: git add probe.txt
6. Run: git -c user.name="Codex Capability Probe" -c user.email="codex-probe@example.invalid" commit -m "Prove SDK Git capability"
7. Run: git status --short
If a required Git command is denied by the sandbox, request escalation through the available approval mechanism and retry it once. Do not bypass the sandbox or change Git configuration.`,
    );
    const completedEvents: ThreadEvent[] = [];
    for await (const event of events) {
      if (event.type === "item.completed") completedEvents.push(event);
    }

    const branch = await git(fixture.worktreePath, "branch", "--show-current");
    const status = await git(fixture.worktreePath, "status", "--short");
    const committedFile = await git(fixture.worktreePath, "show", "HEAD:probe.txt");
    const subject = await git(fixture.worktreePath, "log", "-1", "--pretty=%s");

    assert.equal(branch.stdout.trim(), "codex/capability-probe");
    assert.equal(status.stdout.trim(), "");
    assert.equal(committedFile.stdout.trim(), "SDK capability probe passed");
    assert.equal(subject.stdout.trim(), "Prove SDK Git capability");
    for (const { command, denial } of [
      {
        command: /git switch -c/iu,
        denial: /cannot lock ref[\s\S]*unable to create directory[\s\S]*\.git\/refs\/heads/iu,
      },
      {
        command: /git add probe\.txt/iu,
        denial: /\.git\/worktrees\/[^/]+\/index\.lock[\s\S]*permission denied/iu,
      },
      {
        command: /git .* commit -m/iu,
        denial: /\.git\/worktrees\/[^/]+\/index\.lock[\s\S]*permission denied/iu,
      },
    ]) {
      const attempts = completedEvents.filter(
        (event) => event.type === "item.completed" && event.item.type === "command_execution" &&
          command.test(event.item.command),
      );
      assert.deepEqual(
        attempts.map((event) => event.type === "item.completed" && event.item.type === "command_execution"
          ? event.item.status
          : "unexpected"),
        ["failed", "completed"],
        JSON.stringify(attempts, null, 2),
      );
      const denied = attempts[0];
      assert.ok(denied?.type === "item.completed" && denied.item.type === "command_execution");
      assert.match(denied.item.aggregated_output, denial);
    }
    assert.ok(
      completedEvents.some(
        (event) => event.type === "item.completed" && event.item.type === "command_execution" &&
          /node verify\.mjs/iu.test(event.item.command) && event.item.exit_code === 0,
      ),
      JSON.stringify(completedEvents, null, 2),
    );
  },
);

async function createLinkedWorktreeFixture(): Promise<{
  repositoryPath: string;
  worktreePath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-sdk-capability-"));
  const repositoryPath = join(directory, "repository");
  const worktreePath = join(directory, "linked-worktree");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# SDK capability probe\n");
  await writeFile(
    join(repositoryPath, "verify.mjs"),
    `import { readFileSync } from "node:fs";

if (readFileSync("probe.txt", "utf8") !== "SDK capability probe passed\\n") {
  throw new Error("probe.txt did not contain the expected content");
}
console.log("probe verified");
`,
  );
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md", "verify.mjs"]);
  await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Coordination Integration Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Initial fixture",
  ]);
  await execFileAsync("git", ["-C", repositoryPath, "worktree", "add", "--detach", worktreePath, "main"]);
  return { repositoryPath, worktreePath };
}

function gitTrustedEnvironment(worktreePath: string): Record<string, string> {
  const environment: Record<string, string> = {
    ...definedProcessEnvironment(),
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "safe.directory",
    GIT_CONFIG_VALUE_0: worktreePath.replaceAll("\\", "/"),
  };
  if (environment.CODEX_HOME === undefined && environment.USERPROFILE !== undefined) {
    environment.CODEX_HOME = join(environment.USERPROFILE, ".codex");
  }
  return environment;
}

function definedProcessEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(entry[0]),
    ),
  );
}

async function git(cwd: string, ...args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["-C", cwd, ...args]);
}

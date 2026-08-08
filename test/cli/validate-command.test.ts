import assert from "node:assert/strict";
import { execFile, spawn, type ChildProcessByStdio } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { Readable } from "node:stream";
import test from "node:test";
import { promisify } from "node:util";

import { escapeRegExp } from "../support/text.ts";

const execFileAsync = promisify(execFile);
const cliPath = resolve("src/cli.ts");

test("the validate command reports success and actionable failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-cli-"));
  const definitionPath = join(directory, "process.yaml");
  const validDefinition = `schemaVersion: 1
name: CLI process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Validate before startup.
agents: []
boards:
  - id: delivery
    name: Delivery
    guidance: Deliver changes.
    columns:
      - id: backlog
        name: Backlog
`;
  await writeFile(definitionPath, validDefinition);

  const valid = await execFileAsync(process.execPath, [
    "--experimental-strip-types",
    cliPath,
    "validate",
    definitionPath,
  ]);
  assert.match(valid.stdout, /Valid process definition/);
  assert.match(valid.stdout, /Semantic version: [a-f0-9]{64}/);

  await writeFile(definitionPath, validDefinition.replace("schemaVersion: 1", "schemaVersion: 2"));
  await assert.rejects(
    execFileAsync(process.execPath, [
      "--experimental-strip-types",
      cliPath,
      "validate",
      definitionPath,
    ]),
    (error: unknown) => {
      const failure = error as { code: number; stdout: string };
      assert.equal(failure.code, 1);
      assert.match(failure.stdout, new RegExp(`${escapeRegExp(definitionPath)}:1:16`));
      assert.match(failure.stdout, /Rule:/);
      assert.match(failure.stdout, /Consequence:/);
      assert.match(failure.stdout, /Correction:/);
      return true;
    },
  );
});

test("the source-started host logs correlated pre-attempt startup failures", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "coordination-cli-startup-log-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# CLI startup log fixture\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Coordination CLI Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Initial fixture",
  ]);
  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "agent.md"), "Inspect the task.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: CLI startup logging
defaultTaskWorkspaceStartingRef: missing-starting-ref
coordinationGuidance: Preserve startup evidence.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements tasks
    summary: Handles the current task.
    instructions: ./agent.md
boards:
  - id: delivery
    name: Delivery
    guidance: Keep failures visible.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );
  const child = spawn(
    process.execPath,
    [
      "--experimental-strip-types",
      cliPath,
      "start",
      "--process",
      definitionPath,
      "--project",
      repositoryPath,
      "--state-root",
      join(directory, "project-state"),
      "--port",
      "0",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill();
      await once(child, "exit");
    }
  });
  const listening = await waitForOutput(child, "stdout", /listening at (http:\/\/[^\s]+)/);
  const baseUrl = /listening at (http:\/\/[^\s]+)/.exec(listening)?.[1];
  assert.ok(baseUrl);
  const create = await fetch(`${baseUrl}/api/tasks`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      boardId: "delivery",
      columnId: "backlog",
      title: "Log this startup failure",
      description: "The source host must retain operator-visible correlation.",
      idempotencyKey: "cli-startup-log-task",
    }),
  });
  const created = await create.json() as {
    accepted: true;
    task: { id: string; revision: number };
  };
  const resume = await fetch(`${baseUrl}/api/automation/resume`, { method: "POST", body: "{}" });
  assert.equal(resume.status, 200);
  const logged = waitForOutput(child, "stderr", /\[runtime-start-failed\]/);
  const move = await fetch(`${baseUrl}/api/tasks/${created.task.id}/move`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      destinationColumnId: "implementation",
      expectedRevision: created.task.revision,
      idempotencyKey: "cli-startup-log-move",
    }),
  });
  const moved = await move.json() as {
    accepted: true;
    task: { activations: Array<{ id: string }> };
  };
  const activationId = moved.task.activations[0]?.id;
  assert.ok(activationId);
  const log = await logged;
  assert.match(log, new RegExp(`task=${escapeRegExp(created.task.id)}`));
  assert.match(log, new RegExp(`activation=${escapeRegExp(activationId)}`));
  assert.match(log, /boundary=starting-ref-resolution/);
  assert.match(log, /missing-starting-ref/);
  assert.doesNotMatch(log, /Log this startup failure|source host must retain/i);

  await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  const boardAfterFailure = await fetch(`${baseUrl}/api/board`);
  assert.equal(boardAfterFailure.status, 200);
  const projection = await boardAfterFailure.json() as {
    automation: { state: string; attemptsMayStart: boolean };
  };
  assert.deepEqual(projection.automation, { state: "paused", attemptsMayStart: false });
  assert.equal(child.exitCode, null, "one activation startup failure must not terminate the host");
});

function waitForOutput(
  child: ChildProcessByStdio<null, Readable, Readable>,
  streamName: "stdout" | "stderr",
  pattern: RegExp,
): Promise<string> {
  const stream = child[streamName];
  stream.setEncoding("utf8");
  return new Promise((resolvePromise, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for ${streamName} matching ${pattern}`));
    }, 10_000);
    const onData = (chunk: string): void => {
      output += chunk;
      if (pattern.test(output)) {
        cleanup();
        resolvePromise(output);
      }
    };
    const onExit = (): void => {
      cleanup();
      reject(new Error(`CLI exited before ${streamName} matched ${pattern}: ${output}`));
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      stream.off("data", onData);
      child.off("exit", onExit);
    };
    stream.on("data", onData);
    child.on("exit", onExit);
  });
}

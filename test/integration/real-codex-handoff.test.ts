import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import {
  CoordinationApplication,
  type AttemptTranscriptItem,
} from "../../src/application/coordination-application.ts";
import { AgentToolScopeRegistry } from "../../src/mcp/agent-tool-scope.ts";
import { CodexAgentRuntime } from "../../src/runtime/codex-agent-runtime.ts";
import { startWebServer } from "../../src/web/web-server.ts";

const execFileAsync = promisify(execFile);
const runRealCodex = process.env.COORDINATION_RUN_CODEX_INTEGRATION === "1";

test(
  "a real Codex activation can inspect Git before coordinating a handoff",
  { skip: !runRealCodex, timeout: 10 * 60 * 1_000 },
  async (t) => {
    const fixture = await createFixture();
    const scopes = new AgentToolScopeRegistry();
    let baseUrl: string | undefined;
    const runtime = new CodexAgentRuntime({
      mcpServer: {
        command: process.execPath,
        args: (request) => {
          assert.ok(baseUrl);
          return [
            "--experimental-strip-types",
            join(process.cwd(), "src/mcp/stdio-server.ts"),
            "--base-url",
            baseUrl,
            "--token",
            scopes.issue({ taskId: request.task.id, agentId: request.agent.id, attemptId: request.attemptId }),
          ];
        },
      },
    });
    const application = await CoordinationApplication.start({
      processDefinitionPath: fixture.definitionPath,
      databasePath: fixture.databasePath,
      runtimeDispatch: {
        projectRepositoryPath: fixture.repositoryPath,
        taskWorkspaceRoot: fixture.workspaceRoot,
        agentRuntime: runtime,
      },
    });
    t.after(() => application.close());
    const server = await startWebServer(application, {
      host: "127.0.0.1",
      port: 0,
      agentToolScopes: scopes,
    });
    t.after(() => server.close());
    baseUrl = server.baseUrl;
    const created = application.createTask({
      boardId: "delivery",
      columnId: "implementation",
      title: "Prove the real Codex handoff",
      description:
        "Do not change repository files. Follow the role instructions exactly using only the requested Git inspection and coordination MCP tools.",
      actor: { kind: "user", id: "integration-test" },
      idempotencyKey: "create-real-codex-handoff",
    });
    assert.equal(created.accepted, true);
    if (!created.accepted) return;

    const resume = await application.resumeAutomation();
    assert.equal(resume.accepted, true, JSON.stringify(resume));
    await application.waitForAutomationIdle();

    const completed = application.queryTask(created.task.id);
    assert.equal(completed.available, true);
    if (!completed.available) return;
    const transcripts = await Promise.all(
      completed.task.activations.map(async (activation) => {
        const attempt = activation.attempts[0];
        return {
          activationId: activation.id,
          attempt,
          transcript: attempt == null ? null : await runtime.read(attempt.id),
        };
      }),
    );
    assert.equal(
      completed.task.columnId,
      "review",
      JSON.stringify({ comments: completed.task.comments, transcripts }, null, 2),
    );
    assert.equal(completed.task.comments.length, 1);
    assert.match(completed.task.comments[0]?.body ?? "", /real Codex SDK handoff/i);
    assert.deepEqual(
      completed.task.activations.map((activation) => activation.status),
      ["completed", "completed"],
    );
    const threadIds = completed.task.activations.map(
      (activation) => activation.attempts[0]?.threadId,
    );
    assert.ok(threadIds.every((threadId) => typeof threadId === "string"));
    assert.notEqual(threadIds[0], threadIds[1]);
    const implementationTranscript = await runtime.read(
      completed.task.activations[0]?.attempts[0]?.id as string,
    );
    const gitStatus = implementationTranscript
      ?.filter(isToolNamed("command_execution"))
      .find((item) => /git status --short/i.test(item.summary));
    assert.equal(gitStatus?.status, "completed");
    assert.deepEqual(
      implementationTranscript
        ?.filter(isToolNamed("mcp_tool_call"))
        .map((item) => ({ summary: item.summary, status: item.status })),
      [
        { summary: `${created.task.id}: current task inspected`, status: "completed" },
        { summary: `${created.task.id}: comment confirmed`, status: "completed" },
        {
          summary: `${created.task.id}: implementation → review (confirmed)`,
          status: "completed",
        },
      ],
    );
    const reviewTranscript = await runtime.read(
      completed.task.activations[1]?.attempts[0]?.id as string,
    );
    assert.deepEqual(
      reviewTranscript
        ?.filter(isToolNamed("mcp_tool_call"))
        .map((item) => ({ summary: item.summary, status: item.status })),
      [{ summary: `${created.task.id}: current task inspected`, status: "completed" }],
    );
  },
);

function isToolNamed(name: string) {
  return (
    item: AttemptTranscriptItem,
  ): item is Extract<AttemptTranscriptItem, { kind: "tool" }> =>
    item.kind === "tool" && item.name === name;
}

async function createFixture(): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), "coordination-real-codex-"));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Real Codex handoff fixture\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
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
  await writeFile(
    join(directory, "implementer.md"),
    `First run exactly one Git inspection command: git status --short. Do not add
a safe.directory command-line override. Do not edit repository files or run
other shell commands. Then call inspect_current_task. Call add_comment exactly
once with a body containing "Real Codex SDK handoff complete" and a unique
idempotency key. Then call move_current_task exactly once to move the task to
review using the current revision and another unique idempotency key. Finally
report completion.
`,
  );
  await writeFile(
    join(directory, "reviewer.md"),
    `Do not edit files or move the task. Call inspect_current_task, verify the
implementation agent's comment is present, then report completion.
`,
  );
  const definitionPath = join(directory, "process.yaml");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Real Codex handoff
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Use only the current-task MCP tools for this proof.
agents:
  - id: implementer
    name: Implementation Agent
    role: Performs the minimal handoff
    summary: Comments and hands the task to review.
    instructions: ./implementer.md
  - id: reviewer
    name: Review Agent
    role: Verifies the handoff
    summary: Inspects the resulting task state.
    instructions: ./reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Implementation hands work to review.
    columns:
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

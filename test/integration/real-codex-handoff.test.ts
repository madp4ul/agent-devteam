import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { Codex } from "@openai/codex-sdk";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AttemptTranscriptItem } from "../../src/application/runtime-contract.ts";
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
      ?.filter(isCommand)
      .find((item) => /git status --short/i.test(item.command));
    assert.equal(gitStatus?.status, "completed");
    assert.deepEqual(
      implementationTranscript
        ?.filter(isCoordinationCall)
        .map((item) => ({ tool: item.tool, status: item.status, rawStatus: item.evidence.rawStatus })),
      [
        { tool: "inspect_current_task", status: "succeeded", rawStatus: "completed" },
        { tool: "add_comment", status: "succeeded", rawStatus: "completed" },
        { tool: "move_current_task", status: "succeeded", rawStatus: "completed" },
      ],
    );
    const reviewTranscript = await runtime.read(
      completed.task.activations[1]?.attempts[0]?.id as string,
    );
    assert.deepEqual(
      reviewTranscript
        ?.filter(isCoordinationCall)
        .map((item) => ({ tool: item.tool, status: item.status, rawStatus: item.evidence.rawStatus })),
      [{ tool: "inspect_current_task", status: "succeeded", rawStatus: "completed" }],
    );
  },
);

test(
  "a real long-lived Codex conversation recovers current operating context after compaction pressure",
  { skip: !runRealCodex, timeout: 15 * 60 * 1_000 },
  async (t) => {
    const fixture = await createFixture();
    const scopes = new AgentToolScopeRegistry();
    let baseUrl: string | undefined;
    const runtime = new CodexAgentRuntime({
      createClient: (options) => new Codex({
        ...options,
        config: {
          ...options.config,
          model_context_window: 32_768,
          model_auto_compact_token_limit: 12_000,
        },
      }),
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
      title: "Recover operating context in one long-lived lineage",
      description: "Complete the initial handoff, then obey the later operating-context request.",
      actor: { kind: "user", id: "integration-test" },
      idempotencyKey: "create-real-continuity-proof",
    });
    assert.equal(created.accepted, true);
    if (!created.accepted) return;
    assert.equal((await application.resumeAutomation()).accepted, true);
    await application.waitForAutomationIdle();

    for (let index = 0; index < 8; index += 1) {
      const context = application.addTaskComment({
        taskId: created.task.id,
        body: `@implementer continuity pressure checkpoint ${index + 1}: ${"authoritative detail ".repeat(800)}`,
        actor: { kind: "user", id: "integration-test" },
        idempotencyKey: `real-continuity-context-${index + 1}`,
      });
      assert.equal(context.accepted, true);
      await application.waitForAutomationIdle();
    }
    const mentioned = application.addTaskComment({
      taskId: created.task.id,
      body: "@implementer recover the complete current operating context with inspect_operating_context, then report the current process and owning role without changing task state.",
      actor: { kind: "user", id: "integration-test" },
      idempotencyKey: "real-continuity-operating-context-request",
    });
    assert.equal(mentioned.accepted, true);
    await application.waitForAutomationIdle();

    const completed = application.queryTask(created.task.id);
    assert.equal(completed.available, true);
    if (!completed.available) return;
    const implementerActivations = completed.task.activations.filter(
      ({ targetAgentId }) => targetAgentId === "implementer",
    );
    assert.equal(implementerActivations.length, 10);
    assert.ok(implementerActivations.every(
      ({ conversationId }) => conversationId === implementerActivations[0]?.conversationId,
    ));
    assert.ok(implementerActivations.every(
      ({ attempts }) => attempts[0]?.threadId === implementerActivations[0]?.attempts[0]?.threadId,
    ));
    const resumedAttempt = implementerActivations.at(-1)?.attempts[0];
    assert.ok(resumedAttempt);
    const transcript = await runtime.read(resumedAttempt.id);
    assert.ok(transcript?.some(
      (item) => item.kind === "tool" &&
        item.summary === "coordination.inspect_operating_context" &&
        item.status === "completed",
    ), JSON.stringify(transcript, null, 2));
    assert.ok(transcript?.some(
      (item) => item.kind === "message" &&
        /Real Codex handoff/.test(item.text) &&
        /Performs the minimal handoff/.test(item.text),
    ), JSON.stringify(transcript, null, 2));
    assert.equal(
      await sessionRecordedCompaction(resumedAttempt.threadId as string),
      true,
      `Expected Codex session ${resumedAttempt.threadId} to record an actual compaction event.`,
    );
  },
);

function isCoordinationCall(
  item: AttemptTranscriptItem,
): item is Extract<AttemptTranscriptItem, { kind: "coordination" }> {
  return item.kind === "coordination";
}

function isCommand(
  item: AttemptTranscriptItem,
): item is Extract<AttemptTranscriptItem, { kind: "command" }> {
  return item.kind === "command";
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
    `If the activation source explicitly requests inspect_operating_context, call
that tool exactly once, report the returned current process and owning role,
and do not use another tool or change task state. If the activation source is a
continuity pressure checkpoint, acknowledge it briefly without calling tools or
changing task state. Otherwise, first run exactly
one Git inspection command: git status --short. Do not add
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

async function sessionRecordedCompaction(threadId: string): Promise<boolean> {
  const codexHome = process.env.CODEX_HOME ?? join(homedir(), ".codex");
  const sessionPath = await findSessionFile(join(codexHome, "sessions"), threadId);
  if (sessionPath === undefined) return false;
  const records = (await readFile(sessionPath, "utf8"))
    .split(/\r?\n/u)
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
  return records.some((record) => {
    if (record.type === "compacted") return true;
    if (record.type !== "event_msg" || !isRecord(record.payload)) return false;
    return record.payload.type === "context_compacted";
  });
}

async function findSessionFile(directory: string, threadId: string): Promise<string | undefined> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findSessionFile(path, threadId);
      if (nested !== undefined) return nested;
    } else if (entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) {
      return path;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

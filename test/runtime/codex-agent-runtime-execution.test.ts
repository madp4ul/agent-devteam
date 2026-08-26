import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { AgentRunRequest } from "../../src/application/runtime-contract.ts";
import {
  CodexAgentRuntime,
  composeActivationPrompt,
  type CodexAgentRuntimeOptions,
  type CodexClientLike,
  type CodexClientOptionsLike,
  type CodexEventLike,
  type CodexThreadLike,
  type CodexThreadOptionsLike,
} from "../../src/runtime/codex-agent-runtime.ts";
import {
  createRuntime,
  events,
  FakeCodexClient,
  FailingCodexClient,
  interruptedEvents,
  request,
} from "../support/codex-runtime-fixture.ts";

test("conversation attachments become scoped files and current images become native input", async () => {
  let input: unknown;
  let clientOptions: CodexClientOptionsLike | undefined;
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: (options) => {
      clientOptions = options;
      return {
        startThread: () => ({
          runStreamed: async (value) => {
            input = value;
            return { events: events(
              { type: "thread.started", thread_id: "thread-attachments" },
              { type: "turn.completed" },
            ) };
          },
        }),
      };
    },
  });
  const attached = request("activation-attachments", "T-0068");
  attached.attachments = [
    {
      id: "image-1", messageId: "message-current", fileName: "screen.png", mediaType: "image/png",
      sizeBytes: 123, path: "C:\\state\\runtime\\attempt\\screen.png", currentMessage: true,
    },
    {
      id: "sheet-1", messageId: "message-earlier", fileName: "data.xlsx",
      mediaType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 456, path: "C:\\state\\runtime\\attempt\\data.xlsx", currentMessage: false,
    },
  ];

  await runtime.run(attached, { started() {} });

  assert.ok(Array.isArray(input));
  assert.equal(input[0]?.type, "text");
  assert.match(input[0]?.text ?? "", /Conversation attachments[\s\S]*screen\.png[\s\S]*data\.xlsx/);
  assert.deepEqual(input.slice(1), [{ type: "local_image", path: "C:\\state\\runtime\\attempt\\screen.png" }]);
  assert.deepEqual(clientOptions?.config?.sandbox_workspace_write, {
    writable_roots: ["C:\\state\\runtime\\attempt"],
  });
});

test("a later-satisfied mention can complete inertly without duplicate coordination calls", async () => {
  let prompt = "";
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async (value) => {
          prompt = typeof value === "string"
            ? value
            : value.find((item) => item.type === "text")?.text ?? "";
          return {
            events: events(
              { type: "thread.started", thread_id: "thread-inert" },
              {
                type: "item.completed",
                item: { type: "agent_message", text: "Later task activity already satisfied the request." },
              },
              { type: "turn.completed" },
            ),
          };
        },
      }),
    }),
  });
  const satisfied = request("activation-satisfied", "T-0038");
  satisfied.reason = { type: "agent-mention", sourceEventId: "comment-request" };
  satisfied.sourceEvent = {
    id: "comment-request",
    body: "Please verify the boundary.",
    actor: { kind: "agent", id: "reviewer" },
    occurredAt: "2026-08-11T14:32:00.000Z",
  };
  satisfied.task.activity.push({
    id: "later-satisfaction",
    type: "task.edited",
    actor: { kind: "agent", id: "reviewer" },
    occurredAt: "2026-08-11T14:35:00.000Z",
    details: { outcome: "boundary verified" },
  });

  const outcome = await runtime.run(satisfied, { started() {} });

  assert.equal(outcome.status, "completed");
  assert.match(prompt, /Later task activity after the activation source:[\s\S]*outcome: boundary verified/);
  assert.match(prompt, /finish without manufacturing another comment, move, mention, or attention request merely to narrate status/);
  assert.deepEqual(await runtime.read(satisfied.attemptId), [
    { kind: "message", role: "agent", text: "Later task activity already satisfied the request." },
  ]);
});

test("each activation receives automatic approval review and exact Git trust without overriding other capabilities", async () => {
  const clients: FakeCodexClient[] = [];
  const runtime = createRuntime({
    mcpServer: {
      command: "node",
      args: (request) => ["coordination-mcp.ts", "--task", request.task.id],
      environment: (request) => ({ CURRENT_TASK: request.task.id }),
    },
    createClient: (options) => {
      const client = new FakeCodexClient(options, `thread-${clients.length + 1}`);
      clients.push(client);
      return client;
    },
  });

  const first = await runtime.run(request("activation-1", "T-0001"), { started() {} });
  const secondRequest = request("activation-2", "T-0002");
  secondRequest.workspace.path = "C:\\tasks\\worktree two [review]";
  const second = await runtime.run(secondRequest, { started() {} });

  assert.deepEqual(first, {
    status: "completed",
    summary: "Handoff completed.",
    threadId: "thread-1",
  });
  assert.deepEqual(await runtime.read("attempt-activation-1"), [
    { id: "message-1", kind: "message", role: "agent", text: "Handoff completed." },
  ]);
  assert.equal(second.threadId, "thread-2");
  assert.equal(clients.length, 2);
  assert.deepEqual(clients[0]?.threadOptions, {
    workingDirectory: "C:\\tasks\\worktree",
  });
  assert.deepEqual(clients[1]?.threadOptions, {
    workingDirectory: "C:\\tasks\\worktree two [review]",
  });
  for (const client of clients) {
    assert.equal("sandboxMode" in client.threadOptions, false);
    assert.equal("approvalPolicy" in client.threadOptions, false);
  }
  assert.deepEqual(clients[0]?.options.config, {
    approval_policy: "on-request",
    approvals_reviewer: "auto_review",
    shell_environment_policy: {
      set: {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: "C:/tasks/worktree",
      },
    },
    mcp_servers: {
      coordination: {
        command: "node",
        args: ["coordination-mcp.ts", "--task", "T-0001"],
        env: { CURRENT_TASK: "T-0001" },
        required: true,
        default_tools_approval_mode: "approve",
      },
    },
  });
  for (const key of ["default_permissions", "permissions", "sandbox_mode", "web_search"]) {
    assert.equal(key in (clients[0]?.options.config ?? {}), false);
  }
  assert.deepEqual(
    Object.keys(clients[0]?.options.env ?? {}).filter((key) => /^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(key)),
    [],
  );
  assert.deepEqual(
    clients[1]?.options.config?.shell_environment_policy,
    {
      set: {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "safe.directory",
        GIT_CONFIG_VALUE_0: "C:/tasks/worktree two [review]",
      },
    },
  );
  const prompt = clients[0]?.prompt ?? "";
  assert.match(prompt, /Implementation Agent/);
  assert.match(prompt, /Implement the requested task in full\./);
  assert.match(prompt, /Keep handoffs explicit\./);
  assert.match(prompt, /Move finished work to review\./);
  assert.match(prompt, /source-event-1/);
  assert.match(prompt, /FULL-DESCRIPTION-END/);
  assert.match(prompt, /Earlier authored comment\./);
  assert.match(prompt, /dependency/);
  assert.doesNotMatch(prompt, /# Attempt continuation/);
  assert.match(prompt, /`@user` requests explicit human attention/);
  assert.doesNotMatch(prompt, /local-user/);
  assert.match(prompt, /Author: @user/);
});

test("an unusable interrupted thread falls back to a fresh thread with honest context", async () => {
  let prompt = "";
  let freshStarts = 0;
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      resumeThread: (threadId) => {
        assert.equal(threadId, "thread-before-restart");
        throw new Error("persisted thread is unavailable");
      },
      startThread: () => {
        freshStarts += 1;
        return {
          runStreamed: async (value) => {
            prompt = typeof value === "string"
              ? value
              : value.find((item) => item.type === "text")?.text ?? "";
            return {
              events: events(
                { type: "thread.started", thread_id: "thread-replacement" },
                { type: "item.completed", item: { type: "agent_message", text: "Recovered." } },
                { type: "turn.completed" },
              ),
            };
          },
        };
      },
    }),
  });
  const recovering = request("activation-recovery", "T-0099");
  recovering.resumeThreadId = "thread-before-restart";
  recovering.attempt = {
    number: 2,
    precedingOutcome: { status: "failed", summary: "The previous host stopped." },
    thread: "resumed",
    continuationMessage: null,
  };

  const outcome = await runtime.run(recovering, { started() {} });

  assert.equal(freshStarts, 1);
  assert.equal(outcome.threadId, "thread-replacement");
  assert.equal(outcome.threadContinuity, "replaced");
  assert.match(prompt, /Thread: replaced/);
  assert.match(prompt, /previous host stopped/i);
});

test("explicit agent execution profiles become SDK thread options", async () => {
  const clients: FakeCodexClient[] = [];
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: (options) => {
      const client = new FakeCodexClient(options, "thread-profiled");
      clients.push(client);
      return client;
    },
  });
  const profiled = request("activation-profiled", "T-0003");
  profiled.agent.model = "gpt-5.6-sol";
  profiled.agent.reasoningEffort = "medium";

  await runtime.run(profiled, { started() {} });

  assert.deepEqual(clients[0]?.threadOptions, {
    workingDirectory: "C:\\tasks\\worktree",
    model: "gpt-5.6-sol",
    modelReasoningEffort: "medium",
  });
  assert.equal("sandboxMode" in (clients[0]?.threadOptions ?? {}), false);
  assert.equal("approvalPolicy" in (clients[0]?.threadOptions ?? {}), false);
});

test("an unavailable requested model remains an actionable runtime-start failure", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => {
        throw new Error('Requested model "gpt-unavailable" is not available for this account');
      },
    }),
  });
  const profiled = request("activation-unavailable", "T-0004");
  profiled.agent.model = "gpt-unavailable";

  await assert.rejects(
    runtime.run(profiled, { started() {} }),
    /Requested model "gpt-unavailable" is not available for this account/,
  );
});

test("streamed Codex failures become failed attempt outcomes with retained thread identity", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => new FailingCodexClient(),
  });

  assert.deepEqual(await runtime.run(request("activation-failure", "T-0003"), { started() {} }), {
    status: "failed",
    summary: "Codex could not complete the activation: model stream disconnected",
    threadId: "thread-failure",
  });
  assert.deepEqual(await runtime.read("attempt-activation-failure"), [
    { kind: "diagnostic", text: "model stream disconnected" },
  ]);
});

test("an explicit coordination permission report becomes a permission-blocked outcome", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-permission" },
            {
              type: "item.completed",
              item: {
                type: "mcp_tool_call",
                server: "coordination",
                tool: "report_permission_block",
                status: "completed",
                arguments: {
                  summary: "Writing the protected file requires user approval.",
                },
              },
            },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });

  assert.deepEqual(
    await runtime.run(request("activation-permission", "T-0004"), { started() {} }),
    {
      status: "permission-blocked",
      summary: "Writing the protected file requires user approval.",
      threadId: "thread-permission",
    },
  );
});

test("an exception after thread startup becomes an inspectable failed outcome", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({ events: interruptedEvents() }),
      }),
    }),
  });
  let startedThreadId: string | undefined;

  assert.deepEqual(
    await runtime.run(request("activation-interrupted", "T-0004"), {
      started: (threadId) => {
        startedThreadId = threadId;
      },
    }),
    {
      status: "failed",
      summary: "Codex could not complete the activation: connection dropped",
      threadId: "thread-interrupted",
    },
  );
  assert.equal(startedThreadId, "thread-interrupted");
  assert.deepEqual(await runtime.read("attempt-activation-interrupted"), [
    { kind: "diagnostic", text: "connection dropped" },
  ]);
});

test("a stream that ends without turn.completed is a failed outcome", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-truncated" },
            {
              type: "item.completed",
              item: { type: "agent_message", text: "This was not confirmed complete." },
            },
          ),
        }),
      }),
    }),
  });

  assert.deepEqual(
    await runtime.run(request("activation-truncated", "T-0005"), { started() {} }),
    {
      status: "failed",
      summary: "Codex could not complete the activation: the stream ended before turn.completed",
      threadId: "thread-truncated",
    },
  );
  assert.deepEqual(await runtime.read("attempt-activation-truncated"), [
    { kind: "message", role: "agent", text: "This was not confirmed complete." },
    { kind: "diagnostic", text: "The Codex stream ended before turn.completed." },
  ]);
});

test("a completed turn retains its reported token usage for the current attempt", async () => {
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "thread-with-usage" },
            {
              type: "turn.completed",
              usage: {
                input_tokens: 1_200,
                cached_input_tokens: 900,
                cache_write_input_tokens: 100,
                output_tokens: 300,
                reasoning_output_tokens: 180,
              },
            },
          ),
        }),
      }),
    }),
  });

  await runtime.run(request("activation-with-usage", "T-0053"), { started() {} });

  const usageAccess = runtime as unknown as {
    readUsage(attemptId: string): Promise<unknown>;
  };
  assert.deepEqual(await usageAccess.readUsage("attempt-activation-with-usage"), {
    inputTokens: 1_200,
    cachedInputTokens: 900,
    cacheWriteInputTokens: 100,
    outputTokens: 300,
    reasoningOutputTokens: 180,
  });
  assert.equal(await usageAccess.readUsage("attempt-without-reported-usage"), null);
});

test("runtime preserves cumulative usage snapshots when attempts reuse one Codex thread", async () => {
  const streamed = (inputTokens: number) => async () => ({
    events: events(
      { type: "thread.started", thread_id: "shared-usage-thread" },
      {
        type: "turn.completed",
        usage: {
          input_tokens: inputTokens,
          cached_input_tokens: 0,
          cache_write_input_tokens: 0,
          output_tokens: 20,
          reasoning_output_tokens: 10,
        },
      },
    ),
  });
  const runtime = createRuntime({
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({ runStreamed: streamed(100) }),
      resumeThread: () => ({ runStreamed: streamed(250) }),
    }),
  });
  const first = request("activation-usage-first", "T-0053");
  const second = request("activation-usage-second", "T-0053");
  second.resumeThreadId = "shared-usage-thread";
  second.attempt = {
    number: 2,
    precedingOutcome: { status: "completed", summary: "First pass", threadId: "shared-usage-thread" },
    thread: "resumed",
    continuationMessage: "Continue the task.",
  };

  await runtime.run(first, { started() {} });
  await runtime.run(second, { started() {} });

  assert.deepEqual(await runtime.readUsage(first.attemptId), {
    inputTokens: 100,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 20,
    reasoningOutputTokens: 10,
  });
  assert.deepEqual(await runtime.readUsage(second.attemptId), {
    inputTokens: 250,
    cachedInputTokens: 0,
    cacheWriteInputTokens: 0,
    outputTokens: 20,
    reasoningOutputTokens: 10,
  });
});

test("a completed turn exposes Codex's latest active-context measurement", async (t) => {
  const sessionsRoot = await mkdtemp(join(tmpdir(), "coordination-codex-sessions-"));
  t.after(() => rm(sessionsRoot, { recursive: true, force: true }));
  const datedDirectory = join(sessionsRoot, "2026", "08", "26");
  await mkdir(datedDirectory, { recursive: true });
  await writeFile(
    join(datedDirectory, "rollout-2026-08-26T12-00-00-context-thread.jsonl"),
    `${JSON.stringify({
      type: "event_msg",
      payload: {
        type: "token_count",
        info: {
          total_token_usage: { total_tokens: 932_000 },
          last_token_usage: { total_tokens: 132_000 },
          model_context_window: 258_400,
        },
      },
    })}\n`,
  );
  const runtime = createRuntime({
    codexSessionsRoot: sessionsRoot,
    mcpServer: { command: "node", args: () => ["coordination-mcp.ts"] },
    createClient: () => ({
      startThread: () => ({
        runStreamed: async () => ({
          events: events(
            { type: "thread.started", thread_id: "context-thread" },
            { type: "turn.completed" },
          ),
        }),
      }),
    }),
  });
  const completed = request("activation-context-usage", "T-0077");

  await runtime.run(completed, { started() {} });

  assert.deepEqual(await runtime.readContextWindowUsage(completed.attemptId), {
    usedTokens: 132_000,
    contextWindowTokens: 258_400,
    usedPercent: 49,
  });
});

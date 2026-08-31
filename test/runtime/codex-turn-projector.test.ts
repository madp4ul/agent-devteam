import assert from "node:assert/strict";
import test from "node:test";

import type { ThreadEvent } from "@openai/codex-sdk";

import type { AttemptTranscriptItem } from "../../src/application/runtime-contract.ts";
import { projectCodexTurn } from "../../src/runtime/codex-turn-projector.ts";

async function* events(...values: unknown[]): AsyncGenerator<ThreadEvent> {
  for (const value of values) yield value as ThreadEvent;
}

const usage = {
  input_tokens: 120,
  cached_input_tokens: 80,
  cache_write_input_tokens: 10,
  output_tokens: 30,
  reasoning_output_tokens: 12,
};

test("projects every SDK item variant in first-seen order and keeps the latest completed message", async () => {
  const started: string[] = [];
  const published: AttemptTranscriptItem[][] = [];
  const result = await projectCodexTurn(events(
    { type: "thread.started", thread_id: "thread-items" },
    { type: "turn.started" },
    { type: "item.completed", item: { id: "reasoning", type: "reasoning", text: "Checking." } },
    {
      type: "item.completed",
      item: {
        id: "command", type: "command_execution", command: "pnpm test",
        aggregated_output: "passed", exit_code: 0, status: "completed",
      },
    },
    {
      type: "item.completed",
      item: { id: "files", type: "file_change", changes: [{ path: "src/a.ts", kind: "update" }], status: "completed" },
    },
    {
      type: "item.completed",
      item: {
        id: "mcp", type: "mcp_tool_call", server: "github", tool: "inspect",
        arguments: { issue: 94 }, status: "completed", result: { content: [], structured_content: { ok: true } },
      },
    },
    { type: "item.completed", item: { id: "search", type: "web_search", query: "Codex SDK events" } },
    {
      type: "item.completed",
      item: { id: "todos", type: "todo_list", items: [{ text: "Extract projector", completed: true }] },
    },
    {
      type: "item.completed",
      item: { id: "future", type: "future_tool", tool: "preserve_unknown", status: "completed", output: "raw evidence" },
    },
    { type: "item.completed", item: { id: "item-error", type: "error", message: "Non-fatal evidence." } },
    { type: "item.completed", item: { id: "message-1", type: "agent_message", text: "First answer." } },
    { type: "item.completed", item: { id: "message-2", type: "agent_message", text: "Final answer." } },
    { type: "turn.completed", usage },
  ), { attemptId: "attempt-items", taskId: "T-0094" }, {
    started: (threadId) => started.push(threadId),
    publish: (transcript) => published.push([...transcript]),
  });

  assert.deepEqual(started, ["thread-items"]);
  assert.equal(result.terminal.kind, "completed");
  assert.equal(result.terminal.summary, "Final answer.");
  assert.deepEqual(result.usage, {
    inputTokens: 120,
    cachedInputTokens: 80,
    cacheWriteInputTokens: 10,
    outputTokens: 30,
    reasoningOutputTokens: 12,
  });
  assert.deepEqual(result.transcript.map((item) => "id" in item ? item.id : undefined), [
    "reasoning", "command", "files", "mcp", "search", "todos", "future", "item-error", "message-1", "message-2",
  ]);
  assert.deepEqual(result.transcript[3], {
    id: "mcp",
    kind: "mcp",
    server: "github",
    tool: "inspect",
    status: "succeeded",
    rawStatus: "completed",
    arguments: { issue: 94 },
    result: { content: [], structured_content: { ok: true } },
  });
  assert.deepEqual(result.transcript[6], {
    id: "future", kind: "tool", name: "future_tool", status: "completed",
    summary: "preserve_unknown", output: "raw evidence",
  });
  assert.ok(published.length >= 10);
});

test("replaces stable live rows in place and publishes defensive snapshots", async () => {
  const snapshots: AttemptTranscriptItem[][] = [];
  const result = await projectCodexTurn(events(
    { type: "thread.started", thread_id: "thread-live" },
    {
      type: "item.started",
      item: { id: "command", type: "command_execution", command: "pnpm test", aggregated_output: "", status: "in_progress" },
    },
    {
      type: "item.updated",
      item: { id: "command", type: "command_execution", command: "pnpm test", aggregated_output: "running", status: "in_progress" },
    },
    {
      type: "item.completed",
      item: { id: "command", type: "command_execution", command: "pnpm test", aggregated_output: "passed", status: "completed" },
    },
    { type: "turn.completed", usage },
  ), { attemptId: "attempt-live", taskId: "T-0094" }, {
    started() {},
    publish: (transcript) => {
      const captured = transcript as AttemptTranscriptItem[];
      snapshots.push(captured);
      if (snapshots.length === 1) captured.push({ kind: "diagnostic", text: "mutated observer copy" });
    },
  });

  assert.equal(result.transcript.length, 1);
  assert.deepEqual(result.transcript[0], {
    id: "command", kind: "command", command: "pnpm test", status: "completed", output: "passed",
  });
  assert.equal(snapshots[1]?.length, 1);
});

test("a surviving required coordination failure outranks permission reporting and completion", async () => {
  const result = await projectCodexTurn(events(
    { type: "thread.started", thread_id: "thread-precedence" },
    {
      type: "item.completed",
      item: {
        id: "required", type: "mcp_tool_call", server: "coordination", tool: "inspect_current_task",
        arguments: {}, status: "failed", error: { message: "scope unavailable" },
      },
    },
    {
      type: "item.completed",
      item: {
        id: "permission", type: "mcp_tool_call", server: "coordination", tool: "report_permission_block",
        arguments: { summary: "Needs approval." }, status: "completed",
        result: { content: [], structured_content: { accepted: true } },
      },
    },
    { type: "turn.completed", usage },
  ), { attemptId: "attempt-precedence", taskId: "T-0094" }, { started() {}, publish() {} });

  assert.deepEqual(result.terminal, {
    kind: "failed",
    summary: "Required coordination tool coordination.inspect_current_task failed: scope unavailable",
  });
  assert.equal(result.transcript.at(-1)?.kind, "diagnostic");
});

test("declared failure events and iterator failures retain bounded inspectable evidence", async () => {
  for (const failureEvent of [
    { type: "turn.failed", error: { message: "model disconnected" } },
    { type: "error", message: "stream protocol failed" },
  ]) {
    const projected = await projectCodexTurn(events(
      { type: "thread.started", thread_id: "thread-failure" },
      failureEvent,
    ), { attemptId: "attempt-failure", taskId: "T-0094" }, { started() {}, publish() {} });
    assert.equal(projected.terminal.kind, "failed");
    assert.match(projected.terminal.summary, /^Codex could not complete the activation:/u);
    assert.equal(projected.transcript.at(-1)?.kind, "diagnostic");
  }

  async function* interrupted(): AsyncGenerator<ThreadEvent> {
    yield { type: "thread.started", thread_id: "thread-interrupted" };
    throw new Error("connection dropped");
  }
  const interruptedResult = await projectCodexTurn(
    interrupted(),
    { attemptId: "attempt-interrupted", taskId: "T-0094" },
    { started() {}, publish() {} },
  );
  assert.equal(interruptedResult.terminal.summary, "Codex could not complete the activation: connection dropped");

  async function* preIdentityFailure(): AsyncGenerator<ThreadEvent> {
    throw new Error("spawn failed before identity");
  }
  await assert.rejects(
    projectCodexTurn(
      preIdentityFailure(),
      { attemptId: "attempt-no-identity", taskId: "T-0094" },
      { started() {}, publish() {} },
    ),
    /spawn failed before identity/u,
  );
});

test("malformed usage stays unavailable and unsupported or conflicting envelopes fail safely", async () => {
  const malformedUsage = await projectCodexTurn(events(
    { type: "thread.started", thread_id: "thread-usage" },
    { type: "turn.completed", usage: { ...usage, output_tokens: -1 } },
  ), { attemptId: "attempt-usage", taskId: "T-0094" }, { started() {}, publish() {} });
  assert.equal(malformedUsage.usage, undefined);
  assert.equal(malformedUsage.terminal.kind, "completed");

  const unknown = await projectCodexTurn(events(
    { type: "thread.started", thread_id: "thread-unknown" },
    { type: `future.${"sensitive".repeat(30)}`, secret: "must not enter diagnostics" },
  ), { attemptId: "attempt-unknown", taskId: "T-0094" }, { started() {}, publish() {} });
  assert.equal(unknown.terminal.kind, "failed");
  assert.doesNotMatch(unknown.terminal.summary, /must not enter diagnostics/u);
  assert.ok(unknown.terminal.summary.length < 200);

  const conflicting = await projectCodexTurn(events(
    { type: "thread.started", thread_id: "thread-first" },
    { type: "thread.started", thread_id: "thread-second" },
  ), { attemptId: "attempt-conflict", taskId: "T-0094" }, { started() {}, publish() {} });
  assert.equal(conflicting.threadId, "thread-first");
  assert.match(conflicting.terminal.summary, /conflicting thread identities/u);
});

test("fresh projections isolate attempts that share one thread identity", async () => {
  const run = (attemptId: string, text: string) => projectCodexTurn(events(
    { type: "thread.started", thread_id: "shared-thread" },
    { type: "item.completed", item: { id: "message", type: "agent_message", text } },
    { type: "turn.completed", usage },
  ), { attemptId, taskId: "T-0094" }, { started() {}, publish() {} });

  const first = await run("attempt-one", "First attempt.");
  const second = await run("attempt-two", "Second attempt.");
  assert.equal(first.terminal.summary, "First attempt.");
  assert.equal(second.terminal.summary, "Second attempt.");
  assert.notDeepEqual(first.transcript, second.transcript);
});

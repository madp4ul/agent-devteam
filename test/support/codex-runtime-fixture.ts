import assert from "node:assert/strict";

import type { AgentRunRequest } from "../../src/application/runtime-contract.ts";
import {
  CodexAgentRuntime,
  type CodexAgentRuntimeOptions,
  type CodexClientLike,
  type CodexClientOptionsLike,
  type CodexEventLike,
  type CodexThreadLike,
  type CodexThreadOptionsLike,
} from "../../src/runtime/codex-agent-runtime.ts";

export function createRuntime(options: CodexAgentRuntimeOptions): CodexAgentRuntime {
  return new CodexAgentRuntime(options);
}

export class FakeCodexClient implements CodexClientLike {
  threadOptions: CodexThreadOptionsLike = {};
  prompt = "";
  readonly options: CodexClientOptionsLike;
  readonly threadId: string;

  constructor(options: CodexClientOptionsLike, threadId: string) {
    this.options = options;
    this.threadId = threadId;
  }

  startThread(options: CodexThreadOptionsLike): CodexThreadLike {
    this.threadOptions = options;
    return {
      runStreamed: async (prompt) => {
        this.prompt = typeof prompt === "string"
          ? prompt
          : prompt.find((item) => item.type === "text")?.text ?? "";
        return {
          events: events(
            { type: "thread.started", thread_id: this.threadId },
            {
              type: "item.completed",
              item: { id: "message-1", type: "agent_message", text: "Handoff completed." },
            },
            { type: "turn.completed" },
          ),
        };
      },
    };
  }
}

export class FailingCodexClient implements CodexClientLike {
  startThread(): CodexThreadLike {
    return {
      runStreamed: async () => ({
        events: events(
          { type: "thread.started", thread_id: "thread-failure" },
          { type: "turn.failed", error: { message: "model stream disconnected" } },
        ),
      }),
    };
  }
}

export async function* events(...values: CodexEventLike[]): AsyncGenerator<CodexEventLike> {
  for (const value of values) yield value;
}

export async function* interruptedEvents(): AsyncGenerator<CodexEventLike> {
  yield { type: "thread.started", thread_id: "thread-interrupted" };
  throw new Error("connection dropped");
}

export async function* liveToolEvents(
  toolStarted: () => void,
  toolMayFinish: Promise<void>,
): AsyncGenerator<CodexEventLike> {
  yield { type: "thread.started", thread_id: "thread-live" };
  yield {
    type: "item.started",
    item: {
      id: "tool-live",
      type: "mcp_tool_call",
      server: "coordination",
      tool: "list_tasks",
      arguments: { boardId: "delivery", columnIds: ["implementation"] },
      status: "in_progress",
    },
  };
  toolStarted();
  await toolMayFinish;
  yield {
    type: "item.completed",
    item: {
      id: "tool-live",
      type: "mcp_tool_call",
      server: "coordination",
      tool: "list_tasks",
      arguments: { boardId: "delivery", columnIds: ["implementation"] },
      status: "completed",
      result: { content: [{ type: "text", text: JSON.stringify({ tasks: [] }) }] },
    },
  };
  yield { type: "turn.completed" };
}

export async function* liveMessageEvents(
  messageCompleted: () => void,
  turnMayFinish: Promise<void>,
): AsyncGenerator<CodexEventLike> {
  yield { type: "thread.started", thread_id: "thread-live-message" };
  yield {
    type: "item.completed",
    item: {
      id: "message-live",
      type: "agent_message",
      text: "The requested change is complete.",
    },
  };
  messageCompleted();
  await turnMayFinish;
  yield { type: "turn.completed" };
}

export function assertSectionOrder(value: string, headings: string[]): void {
  let precedingIndex = -1;
  for (const heading of headings) {
    const index = value.indexOf(heading);
    assert.ok(index > precedingIndex, `${heading} should follow the preceding section`);
    precedingIndex = index;
  }
}

export function request(activationId: string, taskId: string): AgentRunRequest {
  return {
    activationId,
    attemptId: `attempt-${activationId}`,
    agent: {
      id: "implementer",
      name: "Implementation Agent",
      role: "Implements changes",
      summary: "Builds requested changes.",
      instructions: "Implement the requested task in full.",
    },
    process: {
      name: "Delivery process",
      guidance: "Keep handoffs explicit.",
      definitionVersion: "process-version-1",
    },
    board: {
      id: "delivery",
      name: "Delivery",
      guidance: "Move finished work to review.",
      columns: [
        {
          id: "implementation",
          name: "Implementation",
          watchingAgentId: "implementer",
          frameworkOwned: false,
          taskCreationAllowed: true,
        },
      ],
    },
    collaborators: [
      {
        id: "reviewer",
        name: "Code Reviewer",
        role: "Reviews changes",
        summary: "Checks implementation quality.",
      },
    ],
    reason: { type: "column-entry", sourceEventId: "source-event-1" },
    sourceEvent: {
      id: "source-event-1",
      type: "task.moved",
      actor: { kind: "user", id: "local-user" },
      occurredAt: "2026-08-02T12:00:00.000Z",
      details: { fromColumnId: "backlog", toColumnId: "implementation" },
    },
    task: {
      id: taskId,
      title: "Complete the minimal handoff",
      description: `A complete task description. ${"context ".repeat(2_000)}FULL-DESCRIPTION-END`,
      boardId: "delivery",
      columnId: "implementation",
      revision: 3,
      comments: [
        {
          id: "comment-1",
          body: "Earlier authored comment.",
          actor: { kind: "user", id: "local-user" },
          occurredAt: "2026-08-02T11:00:00.000Z",
        },
      ],
      relationships: [
        {
          id: "relationship-1",
          type: "dependency",
          sourceTaskId: taskId,
          targetTaskId: "T-0000",
        },
      ],
      activity: [],
      activations: [],
    },
    workspace: {
      path: "C:\\tasks\\worktree",
      startingRef: "main",
      commit: "abc123",
    },
    activationContext: {
      kind: "initial",
      description: `A complete task description. ${"context ".repeat(2_000)}FULL-DESCRIPTION-END`,
      comments: [
        {
          id: "comment-1",
          body: "Earlier authored comment.",
          actor: { kind: "user", id: "local-user" },
          occurredAt: "2026-08-02T11:00:00.000Z",
        },
      ],
      activity: [],
      sourceDelivery: "activation-only",
    },
    attempt: {
      number: 1,
      precedingOutcome: null,
      thread: "fresh",
      continuationMessage: null,
    },
  };
}

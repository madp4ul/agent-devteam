import { Codex, type CodexOptions } from "@openai/codex-sdk";

import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
} from "../application/coordination-application.ts";

type CodexConfigValue = string | number | boolean | CodexConfigValue[] | CodexConfigObject;
type CodexConfigObject = { [key: string]: CodexConfigValue };

export interface CodexClientOptionsLike {
  config?: CodexConfigObject;
}

export interface CodexThreadOptionsLike {
  workingDirectory?: string;
  sandboxMode?: string;
  approvalPolicy?: string;
}

export type CodexEventLike =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage?: unknown }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "error"; message: string }
  | {
      type: "item.started" | "item.updated" | "item.completed";
      item: { type: string; [key: string]: unknown };
    };

export interface CodexThreadLike {
  runStreamed(prompt: string): Promise<{ events: AsyncGenerator<CodexEventLike> }>;
}

export interface CodexClientLike {
  startThread(options: CodexThreadOptionsLike): CodexThreadLike;
}

export interface CodexAgentRuntimeOptions {
  mcpServer: {
    command: string;
    args(request: AgentRunRequest): string[];
    environment?(request: AgentRunRequest): Record<string, string>;
    release?(request: AgentRunRequest): void;
  };
  createClient?: (options: CodexClientOptionsLike) => CodexClientLike;
}

export class CodexAgentRuntime implements AgentRuntime {
  readonly #options: CodexAgentRuntimeOptions;

  constructor(options: CodexAgentRuntimeOptions) {
    this.#options = options;
  }

  async run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    const mcpArguments = this.#options.mcpServer.args(request);
    const mcpEnvironment = this.#options.mcpServer.environment?.(request);
    const clientOptions: CodexClientOptionsLike = {
      config: {
        mcp_servers: {
          coordination: {
            command: this.#options.mcpServer.command,
            args: mcpArguments,
            ...(mcpEnvironment === undefined ? {} : { env: mcpEnvironment }),
            required: true,
          },
        },
      },
    };
    let threadId: string | undefined;
    try {
      const client = (this.#options.createClient ?? createCodexClient)(clientOptions);
      const thread = client.startThread({ workingDirectory: request.workspace.path });
      const { events } = await thread.runStreamed(composeActivationPrompt(request));
      let finalResponse = "";
      let turnCompleted = false;
      for await (const event of events) {
        if (event.type === "thread.started") {
          threadId = event.thread_id;
          lifecycle.started(threadId);
        } else if (
          event.type === "item.completed" &&
          event.item.type === "agent_message" &&
          typeof event.item.text === "string"
        ) {
          finalResponse = event.item.text;
        } else if (event.type === "turn.completed") {
          turnCompleted = true;
        } else if (event.type === "turn.failed" || event.type === "error") {
          const diagnostic = event.type === "turn.failed" ? event.error.message : event.message;
          return {
            status: "failed",
            summary: `Codex could not complete the activation: ${diagnostic}`,
            ...(threadId === undefined ? {} : { threadId }),
          };
        }
      }
      if (threadId === undefined) {
        return {
          status: "failed",
          summary: "Codex could not complete the activation: no thread identity was received",
        };
      }
      if (!turnCompleted) {
        return {
          status: "failed",
          summary: "Codex could not complete the activation: the stream ended before turn.completed",
          threadId,
        };
      }
      return {
        status: "completed",
        summary: finalResponse,
        threadId,
      };
    } catch (error) {
      if (threadId === undefined) throw error;
      return {
        status: "failed",
        summary: `Codex could not complete the activation: ${
          error instanceof Error ? error.message : "the streamed run failed"
        }`,
        threadId,
      };
    } finally {
      this.#options.mcpServer.release?.(request);
    }
  }
}

export function composeActivationPrompt(request: AgentRunRequest): string {
  return `# Current responsibility

You are ${request.agent.name} (${request.agent.id}).
Role: ${request.agent.role}
Summary: ${request.agent.summary}

## Role instructions

${request.agent.instructions}

## Coordination guidance

Process: ${request.process.name}
Process definition version: ${request.process.definitionVersion}
${request.process.guidance}

Board: ${request.board.name} (${request.board.id})
${request.board.guidance}

Available collaborators (identity, role, and summary):
${JSON.stringify(request.collaborators, null, 2)}

## Immutable activation trigger

${JSON.stringify({ reason: request.reason, sourceEvent: request.sourceEvent }, null, 2)}

## Current task

${JSON.stringify(
    {
      id: request.task.id,
      title: request.task.title,
      description: request.task.description,
      boardId: request.task.boardId,
      columnId: request.task.columnId,
      revision: request.task.revision,
      relationships: request.task.relationships,
      comments: request.task.comments,
    },
    null,
    2,
  )}

## Attempt context

Attempt number: ${request.attempt.number}
Thread: ${request.attempt.thread}
Preceding outcome: ${JSON.stringify(request.attempt.precedingOutcome)}
Continuation message: ${JSON.stringify(request.attempt.continuationMessage)}

Use the coordination MCP tools to inspect the current task again before changing it, add authored comments, and move only this task. A successful Codex response has no implicit board effect, so perform every process-required comment or movement explicitly.`;
}

function createCodexClient(options: CodexClientOptionsLike): CodexClientLike {
  return new Codex(options as CodexOptions) as unknown as CodexClientLike;
}

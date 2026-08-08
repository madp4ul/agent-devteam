import { Codex, type CodexOptions, type ThreadOptions } from "@openai/codex-sdk";

import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
} from "../application/coordination-application.ts";

type CodexConfigValue = string | number | boolean | CodexConfigValue[] | CodexConfigObject;
type CodexConfigObject = { [key: string]: CodexConfigValue };

export interface CodexClientOptionsLike {
  config?: CodexConfigObject;
}

export type CodexThreadOptionsLike = Pick<
  ThreadOptions,
  "workingDirectory" | "sandboxMode" | "approvalPolicy" | "model" | "modelReasoningEffort"
>;

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
  resumeThread?(id: string, options: CodexThreadOptionsLike): CodexThreadLike;
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

export class CodexAgentRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly #options: CodexAgentRuntimeOptions;
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();

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
            default_tools_approval_mode: "approve",
          },
        },
      },
    };
    let threadId: string | undefined;
    const transcript: AttemptTranscriptItem[] = [];
    try {
      const client = (this.#options.createClient ?? createCodexClient)(clientOptions);
      const threadOptions: CodexThreadOptionsLike = {
        workingDirectory: request.workspace.path,
        ...(request.agent.model === undefined ? {} : { model: request.agent.model }),
        ...(request.agent.reasoningEffort === undefined
          ? {}
          : { modelReasoningEffort: request.agent.reasoningEffort }),
      };
      let effectiveRequest = request;
      let thread: CodexThreadLike;
      try {
        if (request.resumeThreadId === undefined) {
          thread = client.startThread(threadOptions);
        } else if (client.resumeThread === undefined) {
          effectiveRequest = replacementRequest(request);
          thread = client.startThread(threadOptions);
        } else {
          thread = client.resumeThread(request.resumeThreadId, threadOptions);
        }
      } catch (error) {
        if (request.resumeThreadId === undefined) throw error;
        effectiveRequest = replacementRequest(request);
        thread = client.startThread(threadOptions);
      }
      let streamed;
      try {
        streamed = await thread.runStreamed(composeActivationPrompt(effectiveRequest));
      } catch (error) {
        if (request.resumeThreadId === undefined || effectiveRequest.attempt.thread === "replaced") {
          throw error;
        }
        effectiveRequest = replacementRequest(request);
        thread = client.startThread(threadOptions);
        streamed = await thread.runStreamed(composeActivationPrompt(effectiveRequest));
      }
      const { events } = streamed;
      let finalResponse = "";
      let turnCompleted = false;
      const failedCoordinationTools = new Map<string, string>();
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
          transcript.push({ kind: "message", role: "agent", text: event.item.text });
        } else if (event.type === "item.completed") {
          transcript.push(toolTranscriptItem(event.item));
          const coordinationCall = coordinationToolCall(event.item);
          if (coordinationCall?.status === "failed") {
            failedCoordinationTools.set(coordinationCall.name, coordinationCall.diagnostic);
          } else if (coordinationCall?.status === "completed") {
            failedCoordinationTools.delete(coordinationCall.name);
          }
        } else if (event.type === "turn.completed") {
          turnCompleted = true;
        } else if (event.type === "turn.failed" || event.type === "error") {
          const diagnostic = event.type === "turn.failed" ? event.error.message : event.message;
          if (threadId !== undefined) {
            this.#remember(threadId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
          }
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
        this.#remember(threadId, [
          ...transcript,
          { kind: "diagnostic", text: "The Codex stream ended before turn.completed." },
        ]);
        return {
          status: "failed",
          summary: "Codex could not complete the activation: the stream ended before turn.completed",
          threadId,
        };
      }
      if (failedCoordinationTools.size > 0) {
        const diagnostic = [...failedCoordinationTools]
          .map(([name, cause]) => `Required coordination tool ${name} failed: ${cause}`)
          .join("; ");
        this.#remember(threadId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
        return { status: "failed", summary: diagnostic, threadId };
      }
      this.#remember(threadId, transcript);
      return {
        status: "completed",
        summary: finalResponse,
        threadId,
      };
    } catch (error) {
      if (threadId === undefined) throw error;
      const diagnostic = error instanceof Error ? error.message : "the streamed run failed";
      this.#remember(threadId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
      return {
        status: "failed",
        summary: `Codex could not complete the activation: ${diagnostic}`,
        threadId,
      };
    } finally {
      this.#options.mcpServer.release?.(request);
    }
  }

  async read(threadId: string): Promise<AttemptTranscriptItem[] | null> {
    const transcript = this.#transcripts.get(threadId);
    return transcript === undefined ? null : structuredClone(transcript);
  }

  #remember(threadId: string, transcript: AttemptTranscriptItem[]): void {
    this.#transcripts.set(threadId, structuredClone(transcript));
  }
}

function replacementRequest(request: AgentRunRequest): AgentRunRequest {
  const { resumeThreadId: _resumeThreadId, ...withoutResumeThread } = request;
  return {
    ...withoutResumeThread,
    attempt: { ...request.attempt, thread: "replaced" },
  };
}

function toolTranscriptItem(item: { type: string; [key: string]: unknown }): AttemptTranscriptItem {
  if (item.type === "error") {
    const text = typeof item.message === "string"
      ? item.message
      : typeof item.text === "string"
        ? item.text
        : "Codex reported an item-level error without a diagnostic message.";
    return { kind: "diagnostic", text };
  }
  const status = typeof item.status === "string" ? item.status : "completed";
  const command = typeof item.command === "string" ? item.command : undefined;
  const exitCode = typeof item.exit_code === "number" ? item.exit_code : undefined;
  const summary = command === undefined
    ? readableToolSummary(item)
    : `${command}${exitCode === undefined ? "" : ` (exit ${exitCode})`}`;
  const rawOutput = [item.aggregated_output, item.output, item.result, errorMessage(item.error)]
    .find((value) => typeof value === "string") as string | undefined;
  return {
    kind: "tool",
    name: item.type,
    status,
    summary,
    ...(rawOutput === undefined ? {} : { output: truncateOutput(rawOutput) }),
  };
}

function coordinationToolCall(item: { type: string; [key: string]: unknown }):
  | { name: string; status: string; diagnostic: string }
  | undefined {
  if (
    item.type !== "mcp_tool_call" ||
    item.server !== "coordination" ||
    typeof item.tool !== "string" ||
    typeof item.status !== "string"
  ) {
    return undefined;
  }
  return {
    name: `coordination.${item.tool}`,
    status: item.status,
    diagnostic: actionableCoordinationDiagnostic(errorMessage(item.error)),
  };
}

function actionableCoordinationDiagnostic(message: string | undefined): string {
  if (message === undefined) return "Codex reported no underlying cause";
  if (/cancelled mcp tool call|mcp tool call cancelled|tool call cancelled/i.test(message)) {
    return `${message}; the coordination server was configured with approval mode "approve", but Codex supplied no deeper cancellation cause—inspect the retained session and host lifecycle evidence`;
  }
  return message;
}

function errorMessage(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("message" in error)) return undefined;
  return typeof error.message === "string" ? error.message : undefined;
}

function readableToolSummary(item: { type: string; [key: string]: unknown }): string {
  const tool = typeof item.tool === "string" ? item.tool : typeof item.name === "string" ? item.name : undefined;
  const server = typeof item.server === "string" ? item.server : undefined;
  if (tool !== undefined && server !== undefined) return `${server}.${tool}`;
  return tool ?? item.type.replaceAll("_", " ");
}

function truncateOutput(output: string): string {
  return output.length <= 4_000 ? output : `${output.slice(0, 4_000)}\n… output truncated`;
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

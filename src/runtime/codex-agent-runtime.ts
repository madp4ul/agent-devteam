import { Codex, type CodexOptions, type ThreadOptions } from "@openai/codex-sdk";

import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
  AttemptTokenUsage,
} from "../application/runtime-contract.ts";
import {
  coordinationToolPresentation,
  coordinationToolSemanticStatus,
  summarizeCoordinationTool,
} from "./coordination-tool-transcript.ts";
import { composeActivationPrompt } from "../application/activation-prompt.ts";

export { composeActivationPrompt } from "../application/activation-prompt.ts";

type CodexConfigValue = string | number | boolean | CodexConfigValue[] | CodexConfigObject;
type CodexConfigObject = { [key: string]: CodexConfigValue };

export interface CodexClientOptionsLike {
  config?: CodexConfigObject;
  env?: Record<string, string>;
}

export type CodexThreadOptionsLike = Pick<
  ThreadOptions,
  | "workingDirectory"
  | "sandboxMode"
  | "approvalPolicy"
  | "model"
  | "modelReasoningEffort"
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
  runStreamed(
    prompt: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ events: AsyncGenerator<CodexEventLike> }>;
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
  readonly #usage = new Map<string, AttemptTokenUsage>();

  constructor(options: CodexAgentRuntimeOptions) {
    this.#options = options;
  }

  async run(
    request: AgentRunRequest,
    lifecycle: AgentRunLifecycle,
    signal?: AbortSignal,
  ): Promise<AgentRunOutcome> {
    const mcpArguments = this.#options.mcpServer.args(request);
    const mcpEnvironment = this.#options.mcpServer.environment?.(request);
    const clientOptions: CodexClientOptionsLike = {
      env: definedProcessEnvironment(),
      config: {
        approval_policy: "on-request",
        approvals_reviewer: "auto_review",
        shell_environment_policy: {
          set: {
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "safe.directory",
            GIT_CONFIG_VALUE_0: gitSafeDirectoryPath(request.workspace.path),
          },
        },
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
    let threadReplaced = false;
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
          threadReplaced = true;
          thread = client.startThread(threadOptions);
        } else {
          thread = client.resumeThread(request.resumeThreadId, threadOptions);
        }
      } catch (error) {
        if (request.resumeThreadId === undefined) throw error;
        effectiveRequest = replacementRequest(request);
        threadReplaced = true;
        thread = client.startThread(threadOptions);
      }
      let streamed;
      try {
        streamed = await thread.runStreamed(
          composeActivationPrompt(effectiveRequest),
          signal === undefined ? {} : { signal },
        );
      } catch (error) {
        if (request.resumeThreadId === undefined || effectiveRequest.attempt.thread === "replaced") {
          throw error;
        }
        effectiveRequest = replacementRequest(request);
        threadReplaced = true;
        thread = client.startThread(threadOptions);
        streamed = await thread.runStreamed(
          composeActivationPrompt(effectiveRequest),
          signal === undefined ? {} : { signal },
        );
      }
      const { events } = streamed;
      let finalResponse = "";
      let turnCompleted = false;
      let permissionBlockSummary: string | undefined;
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
          transcript.push({
            ...(typeof event.item.id === "string" ? { id: event.item.id } : {}),
            kind: "message",
            role: "agent",
            text: event.item.text,
          });
          this.#remember(request.attemptId, transcript);
        } else if (
          event.type === "item.started" ||
          event.type === "item.updated" ||
          event.type === "item.completed"
        ) {
          upsertToolTranscriptItem(transcript, event.item, event.type, request.task.id);
          this.#remember(request.attemptId, transcript);
          const coordinationCall = coordinationToolCall(event.item);
          if (coordinationCall?.status === "failed") {
            failedCoordinationTools.set(coordinationCall.name, coordinationCall.diagnostic);
          } else if (coordinationCall?.status === "completed") {
            failedCoordinationTools.delete(coordinationCall.name);
          }
          if (
            coordinationCall?.name === "coordination.report_permission_block" &&
            coordinationCall.status === "completed"
          ) {
            permissionBlockSummary = permissionBlockFrom(event.item);
          }
        } else if (event.type === "turn.completed") {
          turnCompleted = true;
          const usage = tokenUsageFrom(event.usage);
          if (usage !== undefined) this.#usage.set(request.attemptId, usage);
        } else if (event.type === "turn.failed" || event.type === "error") {
          const diagnostic = event.type === "turn.failed" ? event.error.message : event.message;
          if (threadId !== undefined) {
            this.#remember(request.attemptId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
          }
          return withThreadContinuity(runtimeFailure(diagnostic, threadId), threadReplaced);
        }
      }
      if (threadId === undefined) {
        return withThreadContinuity({
          status: "failed",
          summary: "Codex could not complete the activation: no thread identity was received",
        }, threadReplaced);
      }
      if (!turnCompleted) {
        this.#remember(request.attemptId, [
          ...transcript,
          { kind: "diagnostic", text: "The Codex stream ended before turn.completed." },
        ]);
        return withThreadContinuity({
          status: "failed",
          summary: "Codex could not complete the activation: the stream ended before turn.completed",
          threadId,
        }, threadReplaced);
      }
      if (failedCoordinationTools.size > 0) {
        const diagnostic = [...failedCoordinationTools]
          .map(([name, cause]) => `Required coordination tool ${name} failed: ${cause}`)
          .join("; ");
        this.#remember(request.attemptId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
        return withThreadContinuity({ status: "failed", summary: diagnostic, threadId }, threadReplaced);
      }
      if (permissionBlockSummary !== undefined) {
        this.#remember(request.attemptId, transcript);
        return withThreadContinuity({
          status: "permission-blocked",
          summary: permissionBlockSummary,
          threadId,
        }, threadReplaced);
      }
      this.#remember(request.attemptId, transcript);
      return withThreadContinuity({
        status: "completed",
        summary: finalResponse,
        threadId,
      }, threadReplaced);
    } catch (error) {
      if (threadId === undefined) throw error;
      const diagnostic = error instanceof Error ? error.message : "the streamed run failed";
      this.#remember(request.attemptId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
      return withThreadContinuity(runtimeFailure(diagnostic, threadId), threadReplaced);
    } finally {
      this.#options.mcpServer.release?.(request);
    }
  }

  async read(attemptId: string): Promise<AttemptTranscriptItem[] | null> {
    const transcript = this.#transcripts.get(attemptId);
    return transcript === undefined ? null : structuredClone(transcript);
  }

  async readUsage(attemptId: string): Promise<AttemptTokenUsage | null> {
    return this.#usage.get(attemptId) ?? null;
  }

  #remember(attemptId: string, transcript: AttemptTranscriptItem[]): void {
    this.#transcripts.set(attemptId, structuredClone(transcript));
  }
}

function tokenUsageFrom(value: unknown): AttemptTokenUsage | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const usage = value as Record<string, unknown>;
  const inputTokens = tokenCount(usage.input_tokens);
  const cachedInputTokens = tokenCount(usage.cached_input_tokens);
  const cacheWriteInputTokens = tokenCount(usage.cache_write_input_tokens);
  const outputTokens = tokenCount(usage.output_tokens);
  const reasoningOutputTokens = tokenCount(usage.reasoning_output_tokens);
  if (
    inputTokens === undefined ||
    cachedInputTokens === undefined ||
    cacheWriteInputTokens === undefined ||
    outputTokens === undefined ||
    reasoningOutputTokens === undefined
  ) return undefined;
  return {
    inputTokens,
    cachedInputTokens,
    cacheWriteInputTokens,
    outputTokens,
    reasoningOutputTokens,
  };
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function definedProcessEnvironment(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      (entry): entry is [string, string] =>
        entry[1] !== undefined && !/^GIT_CONFIG_(?:COUNT|KEY_\d+|VALUE_\d+)$/iu.test(entry[0]),
    ),
  );
}

function gitSafeDirectoryPath(path: string): string {
  return /^(?:[A-Za-z]:\\|\\\\)/u.test(path) ? path.replaceAll("\\", "/") : path;
}

function runtimeFailure(diagnostic: string, threadId?: string): AgentRunOutcome {
  return {
    status: "failed",
    summary: `Codex could not complete the activation: ${diagnostic}`,
    ...(threadId === undefined ? {} : { threadId }),
  };
}

function withThreadContinuity(outcome: AgentRunOutcome, replaced: boolean): AgentRunOutcome {
  return replaced ? { ...outcome, threadContinuity: "replaced" } : outcome;
}

function permissionBlockFrom(item: { type: string; [key: string]: unknown }): string {
  const arguments_ = item.arguments;
  if (
    typeof arguments_ === "object" &&
    arguments_ !== null &&
    "summary" in arguments_ &&
    typeof arguments_.summary === "string" &&
    arguments_.summary.trim().length > 0
  ) {
    return arguments_.summary.trim();
  }
  return "A required action was blocked by the Codex permission policy.";
}

function replacementRequest(request: AgentRunRequest): AgentRunRequest {
  const { resumeThreadId: _resumeThreadId, ...withoutResumeThread } = request;
  return {
    ...withoutResumeThread,
    attempt: { ...request.attempt, thread: "replaced" },
  };
}

function toolTranscriptItem(
  item: { type: string; [key: string]: unknown },
  eventType: "item.started" | "item.updated" | "item.completed",
  currentTaskId: string,
): AttemptTranscriptItem {
  if (item.type === "error") {
    const text = typeof item.message === "string"
      ? item.message
      : typeof item.text === "string"
        ? item.text
        : "Codex reported an item-level error without a diagnostic message.";
    return { kind: "diagnostic", text };
  }
  const status = eventType === "item.started" || item.status === "in_progress"
    ? "running"
    : typeof item.status === "string"
      ? item.status
      : eventType === "item.completed"
        ? "completed"
        : "running";
  const command = typeof item.command === "string" ? item.command : undefined;
  const rawOutput = [item.aggregated_output, item.output, item.result, errorMessage(item.error)]
    .find((value) => typeof value === "string") as string | undefined;
  if (command !== undefined) {
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      kind: "command",
      command,
      status,
      ...(rawOutput === undefined ? {} : { output: truncateOutput(rawOutput) }),
    };
  }
  if (item.type === "mcp_tool_call" && typeof item.server === "string" && typeof item.tool === "string") {
    const summary = summarizeCoordinationTool(item, status, currentTaskId);
    const presentation = coordinationToolPresentation(item);
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      kind: "mcp",
      server: item.server,
      tool: item.tool,
      status: coordinationToolSemanticStatus(item, status) ??
        (status === "running" ? "running" : status === "completed" ? "succeeded" : "failed"),
      ...(typeof item.status === "string" ? { rawStatus: item.status } : {}),
      ...(summary === undefined ? {} : { summary }),
      ...(presentation === undefined ? {} : { presentation }),
      ...(item.arguments === undefined ? {} : { arguments: item.arguments }),
      ...(item.result === undefined ? {} : { result: item.result }),
      ...(item.error === undefined ? {} : { error: item.error }),
    };
  }
  const summary = readableToolSummary(item);
  return {
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    kind: "tool",
    name: item.type,
    status,
    summary,
    ...(rawOutput === undefined ? {} : { output: truncateOutput(rawOutput) }),
  };
}

function upsertToolTranscriptItem(
  transcript: AttemptTranscriptItem[],
  item: { type: string; [key: string]: unknown },
  eventType: "item.started" | "item.updated" | "item.completed",
  currentTaskId: string,
): void {
  const next = toolTranscriptItem(item, eventType, currentTaskId);
  const itemId = "id" in next ? next.id : undefined;
  const existingIndex = itemId === undefined
    ? -1
    : transcript.findIndex((entry) => "id" in entry && entry.id === itemId);
  if (existingIndex === -1) transcript.push(next);
  else transcript[existingIndex] = next;
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

function createCodexClient(options: CodexClientOptionsLike): CodexClientLike {
  return new Codex(options as CodexOptions) as unknown as CodexClientLike;
}

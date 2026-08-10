import { Codex, type CodexOptions, type ThreadOptions } from "@openai/codex-sdk";

import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
} from "../application/coordination-application.ts";
import { summarizeCoordinationTool } from "./coordination-tool-transcript.ts";

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
        streamed = await thread.runStreamed(
          composeActivationPrompt(effectiveRequest),
          signal === undefined ? {} : { signal },
        );
      } catch (error) {
        if (request.resumeThreadId === undefined || effectiveRequest.attempt.thread === "replaced") {
          throw error;
        }
        effectiveRequest = replacementRequest(request);
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
        } else if (event.type === "turn.failed" || event.type === "error") {
          const diagnostic = event.type === "turn.failed" ? event.error.message : event.message;
          if (threadId !== undefined) {
            this.#remember(request.attemptId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
          }
          return runtimeFailure(diagnostic, threadId);
        }
      }
      if (threadId === undefined) {
        return {
          status: "failed",
          summary: "Codex could not complete the activation: no thread identity was received",
        };
      }
      if (!turnCompleted) {
        this.#remember(request.attemptId, [
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
        this.#remember(request.attemptId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
        return { status: "failed", summary: diagnostic, threadId };
      }
      if (permissionBlockSummary !== undefined) {
        this.#remember(request.attemptId, transcript);
        return {
          status: "permission-blocked",
          summary: permissionBlockSummary,
          threadId,
        };
      }
      this.#remember(request.attemptId, transcript);
      return {
        status: "completed",
        summary: finalResponse,
        threadId,
      };
    } catch (error) {
      if (threadId === undefined) throw error;
      const diagnostic = error instanceof Error ? error.message : "the streamed run failed";
      this.#remember(request.attemptId, [...transcript, { kind: "diagnostic", text: diagnostic }]);
      return runtimeFailure(diagnostic, threadId);
    } finally {
      this.#options.mcpServer.release?.(request);
    }
  }

  async read(attemptId: string): Promise<AttemptTranscriptItem[] | null> {
    const transcript = this.#transcripts.get(attemptId);
    return transcript === undefined ? null : structuredClone(transcript);
  }

  #remember(attemptId: string, transcript: AttemptTranscriptItem[]): void {
    this.#transcripts.set(attemptId, structuredClone(transcript));
  }
}

function runtimeFailure(diagnostic: string, threadId?: string): AgentRunOutcome {
  return {
    status: "failed",
    summary: `Codex could not complete the activation: ${diagnostic}`,
    ...(threadId === undefined ? {} : { threadId }),
  };
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
  const exitCode = typeof item.exit_code === "number" ? item.exit_code : undefined;
  const summary = command === undefined
    ? summarizeCoordinationTool(item, status, currentTaskId) ?? readableToolSummary(item)
    : `${command}${exitCode === undefined ? "" : ` (exit ${exitCode})`}`;
  const rawOutput = [item.aggregated_output, item.output, item.result, errorMessage(item.error)]
    .find((value) => typeof value === "string") as string | undefined;
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

To request the human user's attention in a task comment, mention exactly
\`@user\`.

## Immutable activation trigger

${JSON.stringify({ reason: request.reason, sourceEvent: agentFacingRecord(request.sourceEvent) }, null, 2)}

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
      comments: request.task.comments.map(agentFacingRecord),
    },
    null,
    2,
  )}

## Attempt context

Attempt number: ${request.attempt.number}
Thread: ${request.attempt.thread}
Preceding outcome: ${JSON.stringify(request.attempt.precedingOutcome)}
Continuation message: ${JSON.stringify(request.attempt.continuationMessage)}

Use the coordination MCP tools to inspect the current task again before changing it, add authored comments, and move only this task. If the Codex permission policy denies a required action and user action or a policy change is necessary, call coordination.report_permission_block with a concise summary and do not retry the denied action. A successful Codex response has no implicit board effect, so perform every process-required comment or movement explicitly.`;
}

function agentFacingRecord<RecordType extends { actor: AgentRunRequest["sourceEvent"]["actor"] }>(record: RecordType): RecordType {
  return { ...record, actor: agentFacingActor(record.actor) };
}

function agentFacingActor<ActorType extends AgentRunRequest["sourceEvent"]["actor"]>(actor: ActorType): ActorType {
  return actor.kind === "user" ? { ...actor, id: "user" } : actor;
}

function createCodexClient(options: CodexClientOptionsLike): CodexClientLike {
  return new Codex(options as CodexOptions) as unknown as CodexClientLike;
}

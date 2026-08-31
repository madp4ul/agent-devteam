import { Codex, type CodexOptions, type Input, type ThreadEvent, type ThreadOptions } from "@openai/codex-sdk";
import { dirname, extname } from "node:path";

import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
  AttemptContextWindowUsage,
  AttemptTokenUsage,
} from "../application/runtime-contract.ts";
import { composeActivationPrompt } from "../application/activation-prompt.ts";
import {
  type CodexSessionEvidenceReader,
  LocalCodexSessionEvidenceReader,
} from "./codex-session-evidence-reader.ts";
import { projectCodexTurn } from "./codex-turn-projector.ts";

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

export interface CodexThreadLike {
  runStreamed(
    prompt: Input,
    options?: { signal?: AbortSignal },
  ): Promise<{ events: AsyncIterable<ThreadEvent> }>;
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
  sessionEvidenceReader?: CodexSessionEvidenceReader;
}

export class CodexAgentRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly #options: CodexAgentRuntimeOptions;
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();
  readonly #usage = new Map<string, AttemptTokenUsage>();
  readonly #contextWindowUsage = new Map<string, AttemptContextWindowUsage>();
  readonly #sessionEvidenceReader: CodexSessionEvidenceReader;

  constructor(options: CodexAgentRuntimeOptions) {
    this.#options = options;
    this.#sessionEvidenceReader = options.sessionEvidenceReader ?? new LocalCodexSessionEvidenceReader();
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
        ...((request.attachments?.length ?? 0) === 0 ? {} : {
          sandbox_workspace_write: {
            writable_roots: [...new Set(request.attachments!.map(({ path }) => dirname(path)))],
          },
        }),
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
    let threadReplaced = false;
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
        if (request.resumeThreadId === undefined || signal?.aborted === true) throw error;
        effectiveRequest = replacementRequest(request);
        threadReplaced = true;
        thread = client.startThread(threadOptions);
      }
      let streamed;
      try {
        streamed = await thread.runStreamed(
          codexInput(effectiveRequest),
          signal === undefined ? {} : { signal },
        );
      } catch (error) {
        if (
          request.resumeThreadId === undefined ||
          effectiveRequest.attempt.thread === "replaced" ||
          signal?.aborted === true
        ) {
          throw error;
        }
        effectiveRequest = replacementRequest(request);
        threadReplaced = true;
        thread = client.startThread(threadOptions);
        streamed = await thread.runStreamed(
          codexInput(effectiveRequest),
          signal === undefined ? {} : { signal },
        );
      }
      let threadIdentityEstablished = false;
      let observableEventReceived = false;
      const project = (events: AsyncIterable<ThreadEvent>) => projectCodexTurn(observeEvents(events, () => {
        observableEventReceived = true;
      }), {
        attemptId: request.attemptId,
        taskId: request.task.id,
      }, {
        started: (threadId) => {
          threadIdentityEstablished = true;
          lifecycle.started(threadId);
        },
        publish: (transcript) => this.#remember(request.attemptId, transcript),
      });
      let projected;
      try {
        projected = await project(streamed.events);
      } catch (error) {
        if (
          request.resumeThreadId === undefined ||
          effectiveRequest.attempt.thread === "replaced" ||
          threadIdentityEstablished ||
          observableEventReceived ||
          signal?.aborted === true
        ) throw error;
        effectiveRequest = replacementRequest(request);
        threadReplaced = true;
        thread = client.startThread(threadOptions);
        streamed = await thread.runStreamed(
          codexInput(effectiveRequest),
          signal === undefined ? {} : { signal },
        );
        projected = await project(streamed.events);
      }
      this.#remember(request.attemptId, projected.transcript);
      if (projected.usage !== undefined) this.#usage.set(request.attemptId, projected.usage);
      if (
        projected.threadId !== undefined &&
        (projected.terminal.kind === "completed" || projected.terminal.kind === "permission-blocked")
      ) {
        const contextUsage = await this.#sessionEvidenceReader
          .readLatestContextWindowUsage(projected.threadId)
          .catch(() => null);
        if (contextUsage !== null) this.#contextWindowUsage.set(request.attemptId, contextUsage);
      }
      const outcome = projected.terminal.kind === "completed"
        ? {
            status: "completed" as const,
            summary: projected.terminal.summary,
            ...(projected.threadId === undefined ? {} : { threadId: projected.threadId }),
          }
        : projected.terminal.kind === "permission-blocked"
          ? {
              status: "permission-blocked" as const,
              summary: projected.terminal.summary,
              ...(projected.threadId === undefined ? {} : { threadId: projected.threadId }),
            }
          : {
              status: "failed" as const,
              summary: projected.terminal.summary,
              ...(projected.threadId === undefined ? {} : { threadId: projected.threadId }),
            };
      return withThreadContinuity(outcome, threadReplaced);
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

  async readContextWindowUsage(attemptId: string): Promise<AttemptContextWindowUsage | null> {
    return this.#contextWindowUsage.get(attemptId) ?? null;
  }

  #remember(attemptId: string, transcript: readonly AttemptTranscriptItem[]): void {
    this.#transcripts.set(attemptId, [...structuredClone(transcript)]);
  }
}

function codexInput(request: AgentRunRequest): Input {
  const prompt = composeActivationPrompt(request);
  const images = (request.attachments ?? []).filter((attachment) =>
    attachment.currentMessage &&
    [".png", ".jpg", ".jpeg", ".webp"].includes(extname(attachment.fileName).toLowerCase())
  );
  return images.length === 0
    ? prompt
    : [{ type: "text", text: prompt }, ...images.map(({ path }) => ({ type: "local_image" as const, path }))];
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

function withThreadContinuity(outcome: AgentRunOutcome, replaced: boolean): AgentRunOutcome {
  return replaced ? { ...outcome, threadContinuity: "replaced" } : outcome;
}

function replacementRequest(request: AgentRunRequest): AgentRunRequest {
  const { resumeThreadId: _resumeThreadId, ...withoutResumeThread } = request;
  return {
    ...withoutResumeThread,
    attempt: { ...request.attempt, thread: "replaced" },
  };
}

async function* observeEvents(
  events: AsyncIterable<ThreadEvent>,
  observed: () => void,
): AsyncGenerator<ThreadEvent> {
  for await (const event of events) {
    observed();
    yield event;
  }
}

function createCodexClient(options: CodexClientOptionsLike): CodexClientLike {
  return new Codex(options as CodexOptions) as unknown as CodexClientLike;
}

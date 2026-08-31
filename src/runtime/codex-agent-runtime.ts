import { Codex, type CodexOptions, type Input, type ThreadEvent, type ThreadOptions } from "@openai/codex-sdk";
import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join } from "node:path";

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
  codexSessionsRoot?: string;
}

export class CodexAgentRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly #options: CodexAgentRuntimeOptions;
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();
  readonly #usage = new Map<string, AttemptTokenUsage>();
  readonly #contextWindowUsage = new Map<string, AttemptContextWindowUsage>();
  readonly #sessionFiles = new Map<string, string>();

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
        if (request.resumeThreadId === undefined) throw error;
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
        if (request.resumeThreadId === undefined || effectiveRequest.attempt.thread === "replaced") {
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
      const projected = await projectCodexTurn(streamed.events, {
        attemptId: request.attemptId,
        taskId: request.task.id,
      }, {
        started: (threadId) => lifecycle.started(threadId),
        publish: (transcript) => this.#remember(request.attemptId, transcript),
      });
      this.#remember(request.attemptId, projected.transcript);
      if (projected.usage !== undefined) this.#usage.set(request.attemptId, projected.usage);
      if (
        projected.threadId !== undefined &&
        (projected.terminal.kind === "completed" || projected.terminal.kind === "permission-blocked")
      ) {
        const contextUsage = await this.#readCodexContextWindowUsage(projected.threadId);
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

  async #readCodexContextWindowUsage(threadId: string): Promise<AttemptContextWindowUsage | null> {
    const cached = this.#sessionFiles.get(threadId);
    const sessionPath = cached ?? await findCodexSessionFile(
      this.#options.codexSessionsRoot ?? defaultCodexSessionsRoot(),
      threadId,
    );
    if (sessionPath === undefined) return null;
    this.#sessionFiles.set(threadId, sessionPath);
    return readLatestCodexContextWindowUsage(sessionPath);
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

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

const codexContextBaselineTokens = 12_000;

async function readLatestCodexContextWindowUsage(sessionPath: string): Promise<AttemptContextWindowUsage | null> {
  let handle;
  try {
    handle = await open(sessionPath, "r");
  } catch {
    return null;
  }
  try {
    const size = (await handle.stat()).size;
    const chunkSize = 64 * 1024;
    let position = size;
    let leadingFragment = "";
    while (position > 0) {
      const length = Math.min(chunkSize, position);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, position);
      const lines = `${buffer.toString("utf8")}${leadingFragment}`.split(/\r?\n/u);
      leadingFragment = lines.shift() ?? "";
      const measurement = contextWindowUsageFromNewestLine(lines);
      if (measurement !== undefined) return measurement;
    }
    return contextWindowUsageFromNewestLine([leadingFragment]) ?? null;
  } finally {
    await handle.close();
  }
}

function contextWindowUsageFromNewestLine(lines: string[]): AttemptContextWindowUsage | undefined {
  for (const line of lines.reverse()) {
    if (line.length === 0) continue;
    try {
      const measurement = contextWindowUsageFromRolloutRecord(JSON.parse(line));
      if (measurement !== undefined) return measurement;
    } catch {
      // A partial or unrelated malformed record cannot invalidate earlier token-count evidence.
    }
  }
  return undefined;
}

async function findCodexSessionFile(directory: string, threadId: string): Promise<string | undefined> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findCodexSessionFile(path, threadId);
      if (nested !== undefined) return nested;
    } else if (entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) {
      return path;
    }
  }
  return undefined;
}

function contextWindowUsageFromRolloutRecord(value: unknown): AttemptContextWindowUsage | undefined {
  if (!isRecord(value) || value.type !== "event_msg" || !isRecord(value.payload)) return undefined;
  if (value.payload.type !== "token_count" || !isRecord(value.payload.info)) return undefined;
  const info = value.payload.info;
  if (!isRecord(info.last_token_usage)) return undefined;
  const usedTokens = tokenCount(info.last_token_usage.total_tokens);
  const contextWindowTokens = tokenCount(info.model_context_window);
  if (usedTokens === undefined || contextWindowTokens === undefined || contextWindowTokens === 0) return undefined;
  return {
    usedTokens,
    contextWindowTokens,
    usedPercent: codexContextUsedPercent(usedTokens, contextWindowTokens),
  };
}

function codexContextUsedPercent(usedTokens: number, contextWindowTokens: number): number {
  if (contextWindowTokens <= codexContextBaselineTokens) return 100;
  const effectiveWindow = contextWindowTokens - codexContextBaselineTokens;
  const used = Math.max(usedTokens - codexContextBaselineTokens, 0);
  const remaining = Math.max(effectiveWindow - used, 0);
  const remainingPercent = Math.round(Math.min(Math.max(remaining / effectiveWindow * 100, 0), 100));
  return 100 - remainingPercent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function defaultCodexSessionsRoot(): string {
  const codexHome = process.env.CODEX_HOME ??
    (process.env.USERPROFILE === undefined ? join(homedir(), ".codex") : join(process.env.USERPROFILE, ".codex"));
  return join(codexHome, "sessions");
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

function createCodexClient(options: CodexClientOptionsLike): CodexClientLike {
  return new Codex(options as CodexOptions) as unknown as CodexClientLike;
}

import type { ThreadEvent, ThreadItem } from "@openai/codex-sdk";

import type {
  AttemptTokenUsage,
  AttemptTranscriptItem,
} from "../application/runtime-contract.ts";
import { coordinationTranscriptItem } from "./coordination-tool-transcript.ts";

type AttemptScope = Readonly<{ attemptId: string; taskId: string }>;
type ProjectionPorts = Readonly<{
  started(threadId: string): void;
  publish(transcript: readonly AttemptTranscriptItem[]): void;
}>;

export interface CodexTurnProjection {
  threadId?: string;
  transcript: readonly AttemptTranscriptItem[];
  usage?: AttemptTokenUsage;
  terminal:
    | { kind: "completed"; summary: string }
    | { kind: "permission-blocked"; summary: string }
    | { kind: "failed"; summary: string };
}

type ItemRecord = Record<string, unknown> & { type: string };
type ItemEventType = "item.started" | "item.updated" | "item.completed";

export async function projectCodexTurn(
  events: AsyncIterable<ThreadEvent>,
  scope: AttemptScope,
  ports: ProjectionPorts,
): Promise<CodexTurnProjection> {
  const transcript: AttemptTranscriptItem[] = [];
  const itemIndexes = new Map<string, number>();
  const failedCoordinationTools = new Map<string, string>();
  let threadId: string | undefined;
  let finalResponse = "";
  let turnCompleted = false;
  let usage: AttemptTokenUsage | undefined;
  let permissionBlockSummary: string | undefined;

  const snapshot = (): readonly AttemptTranscriptItem[] => structuredClone(transcript);
  const publish = (): void => {
    if (threadId !== undefined) ports.publish(snapshot());
  };
  const failed = (
    diagnostic: string,
    outcomeSummary = `Codex could not complete the activation: ${diagnostic}`,
  ): CodexTurnProjection => {
    transcript.push({ kind: "diagnostic", text: diagnostic });
    publish();
    return projection(threadId, snapshot(), usage, { kind: "failed", summary: outcomeSummary });
  };

  try {
    for await (const declaredEvent of events) {
      const event: unknown = declaredEvent;
      if (!isRecord(event) || typeof event.type !== "string") {
        return failed("Codex emitted a malformed event envelope.");
      }
      switch (event.type) {
        case "thread.started": {
          if (typeof event.thread_id !== "string" || event.thread_id.length === 0) {
            return failed("Codex emitted a malformed thread.started event.");
          }
          if (threadId !== undefined && threadId !== event.thread_id) {
            return failed("Codex emitted conflicting thread identities in one streamed turn.");
          }
          if (threadId === undefined) {
            threadId = event.thread_id;
            ports.started(threadId);
          }
          break;
        }
        case "turn.started":
          break;
        case "item.started":
        case "item.updated":
        case "item.completed": {
          if (!isRecord(event.item) || typeof event.item.type !== "string") {
            return failed(`Codex emitted a malformed ${event.type} event.`);
          }
          const item = event.item as ItemRecord;
          upsertTranscriptItem(transcript, itemIndexes, item, event.type, scope);
          publish();
          const coordinationCall = coordinationToolCall(item);
          if (coordinationCall?.status === "failed") {
            failedCoordinationTools.set(coordinationCall.name, coordinationCall.diagnostic);
          } else if (coordinationCall?.status === "completed") {
            failedCoordinationTools.delete(coordinationCall.name);
          }
          if (event.type === "item.completed" && item.type === "agent_message" && typeof item.text === "string") {
            finalResponse = item.text;
          }
          if (
            event.type === "item.completed" &&
            coordinationCall?.name === "coordination.report_permission_block" &&
            coordinationCall.status === "completed"
          ) {
            permissionBlockSummary = permissionBlockFrom(item);
          }
          break;
        }
        case "turn.completed":
          turnCompleted = true;
          usage = tokenUsageFrom(event.usage);
          break;
        case "turn.failed":
          if (!isRecord(event.error) || typeof event.error.message !== "string") {
            return failed("Codex emitted a malformed turn.failed event.");
          }
          return failed(event.error.message);
        case "error":
          if (typeof event.message !== "string") {
            return failed("Codex emitted a malformed error event.");
          }
          return failed(event.message);
        default:
          return failed(`Codex emitted an unsupported event type: ${boundedLabel(event.type)}.`);
      }
    }
  } catch (error) {
    if (threadId === undefined) throw error;
    return failed(error instanceof Error ? error.message : "the streamed run failed");
  }

  if (threadId === undefined) {
    return projection(undefined, snapshot(), usage, {
      kind: "failed",
      summary: "Codex could not complete the activation: no thread identity was received",
    });
  }
  if (!turnCompleted) {
    transcript.push({ kind: "diagnostic", text: "The Codex stream ended before turn.completed." });
    publish();
    return projection(threadId, snapshot(), usage, {
      kind: "failed",
      summary: "Codex could not complete the activation: the stream ended before turn.completed",
    });
  }
  if (failedCoordinationTools.size > 0) {
    const diagnostic = [...failedCoordinationTools]
      .map(([name, cause]) => `Required coordination tool ${name} failed: ${cause}`)
      .join("; ");
    transcript.push({ kind: "diagnostic", text: diagnostic });
    publish();
    return projection(threadId, snapshot(), usage, { kind: "failed", summary: diagnostic });
  }
  if (permissionBlockSummary !== undefined) {
    return projection(threadId, snapshot(), usage, {
      kind: "permission-blocked",
      summary: permissionBlockSummary,
    });
  }
  return projection(threadId, snapshot(), usage, { kind: "completed", summary: finalResponse });
}

function projection(
  threadId: string | undefined,
  transcript: readonly AttemptTranscriptItem[],
  usage: AttemptTokenUsage | undefined,
  terminal: CodexTurnProjection["terminal"],
): CodexTurnProjection {
  return {
    ...(threadId === undefined ? {} : { threadId }),
    transcript,
    ...(usage === undefined ? {} : { usage }),
    terminal,
  };
}

function upsertTranscriptItem(
  transcript: AttemptTranscriptItem[],
  indexes: Map<string, number>,
  item: ItemRecord,
  eventType: ItemEventType,
  scope: AttemptScope,
): void {
  const next = transcriptItem(item, eventType, scope);
  const itemId = typeof item.id === "string" ? item.id : undefined;
  const existingIndex = itemId === undefined ? undefined : indexes.get(itemId);
  if (existingIndex === undefined) {
    if (itemId !== undefined) indexes.set(itemId, transcript.length);
    transcript.push(next);
  } else {
    transcript[existingIndex] = next;
  }
}

function transcriptItem(
  item: ItemRecord,
  eventType: ItemEventType,
  scope: AttemptScope,
): AttemptTranscriptItem {
  if (item.type === "agent_message" && typeof item.text === "string") {
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      kind: "message",
      role: "agent",
      text: item.text,
    };
  }
  if (item.type === "error") {
    const text = typeof item.message === "string"
      ? item.message
      : typeof item.text === "string"
        ? item.text
        : "Codex reported an item-level error without a diagnostic message.";
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      kind: "diagnostic",
      text,
    };
  }
  const status = eventType === "item.started" || item.status === "in_progress"
    ? "running"
    : typeof item.status === "string"
      ? item.status
      : eventType === "item.completed"
        ? "completed"
        : "running";
  const rawOutput = [item.aggregated_output, item.output, item.result, errorMessage(item.error)]
    .find((value) => typeof value === "string") as string | undefined;
  if (typeof item.command === "string") {
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      kind: "command",
      command: item.command,
      status,
      ...(rawOutput === undefined ? {} : { output: truncateOutput(rawOutput) }),
    };
  }
  if (item.type === "mcp_tool_call" && typeof item.server === "string" && typeof item.tool === "string") {
    const sdkItem = item as ThreadItem & ItemRecord;
    const coordinationItem = coordinationTranscriptItem(sdkItem, status, scope);
    if (coordinationItem !== undefined) return coordinationItem;
    return {
      ...(typeof item.id === "string" ? { id: item.id } : {}),
      kind: "mcp",
      server: item.server,
      tool: item.tool,
      status: status === "running" ? "running" : status === "completed" ? "succeeded" : "failed",
      ...(typeof item.status === "string" ? { rawStatus: item.status } : {}),
      ...(item.arguments === undefined ? {} : { arguments: item.arguments }),
      ...(item.result === undefined ? {} : { result: item.result }),
      ...(item.error === undefined ? {} : { error: item.error }),
    };
  }
  return {
    ...(typeof item.id === "string" ? { id: item.id } : {}),
    kind: "tool",
    name: item.type,
    status,
    summary: readableToolSummary(item),
    ...(rawOutput === undefined ? {} : { output: truncateOutput(rawOutput) }),
  };
}

function coordinationToolCall(item: ItemRecord):
  | { name: string; status: string; diagnostic: string }
  | undefined {
  if (
    item.type !== "mcp_tool_call" ||
    item.server !== "coordination" ||
    typeof item.tool !== "string" ||
    typeof item.status !== "string"
  ) return undefined;
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

function permissionBlockFrom(item: ItemRecord): string {
  const arguments_ = item.arguments;
  if (
    isRecord(arguments_) &&
    typeof arguments_.summary === "string" &&
    arguments_.summary.trim().length > 0
  ) return arguments_.summary.trim();
  return "A required action was blocked by the Codex permission policy.";
}

function tokenUsageFrom(value: unknown): AttemptTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  const inputTokens = tokenCount(value.input_tokens);
  const cachedInputTokens = tokenCount(value.cached_input_tokens);
  const cacheWriteInputTokens = tokenCount(value.cache_write_input_tokens);
  const outputTokens = tokenCount(value.output_tokens);
  const reasoningOutputTokens = tokenCount(value.reasoning_output_tokens);
  if (
    inputTokens === undefined || cachedInputTokens === undefined ||
    cacheWriteInputTokens === undefined || outputTokens === undefined ||
    reasoningOutputTokens === undefined
  ) return undefined;
  return { inputTokens, cachedInputTokens, cacheWriteInputTokens, outputTokens, reasoningOutputTokens };
}

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function errorMessage(error: unknown): string | undefined {
  return isRecord(error) && typeof error.message === "string" ? error.message : undefined;
}

function readableToolSummary(item: ItemRecord): string {
  const tool = typeof item.tool === "string" ? item.tool : typeof item.name === "string" ? item.name : undefined;
  const server = typeof item.server === "string" ? item.server : undefined;
  if (tool !== undefined && server !== undefined) return `${server}.${tool}`;
  return tool ?? item.type.replaceAll("_", " ");
}

function truncateOutput(output: string): string {
  return output.length <= 4_000 ? output : `${output.slice(0, 4_000)}\n… output truncated`;
}

function boundedLabel(value: string): string {
  const printable = value.replaceAll(/[\u0000-\u001f\u007f]/gu, "?");
  return JSON.stringify(printable.length <= 80 ? printable : `${printable.slice(0, 80)}…`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

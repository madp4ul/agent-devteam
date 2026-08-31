import { open, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { AttemptContextWindowUsage } from "../application/runtime-contract.ts";

/**
 * Private local-rollout evidence pinned to @openai/codex-sdk and @openai/codex 0.146.0.
 * Re-audit the session location, filename convention, token_count envelope,
 * active-context fields, and display baseline whenever the lockfile upgrades Codex.
 */
export interface CodexSessionEvidenceReader {
  readLatestContextWindowUsage(threadId: string): Promise<AttemptContextWindowUsage | null>;
}

export class LocalCodexSessionEvidenceReader implements CodexSessionEvidenceReader {
  readonly #sessionsRoot: string;
  readonly #sessionFiles = new Map<string, string>();

  constructor(options: Readonly<{
    sessionsRoot?: string;
    environment?: NodeJS.ProcessEnv;
    platformHome?: () => string;
  }> = {}) {
    this.#sessionsRoot = options.sessionsRoot ?? defaultCodexSessionsRoot(
      options.environment ?? process.env,
      options.platformHome ?? homedir,
    );
  }

  async readLatestContextWindowUsage(threadId: string): Promise<AttemptContextWindowUsage | null> {
    try {
      const cached = this.#sessionFiles.get(threadId);
      const sessionPath = cached ?? await findCodexSessionFile(this.#sessionsRoot, threadId);
      if (sessionPath === undefined) return null;
      this.#sessionFiles.set(threadId, sessionPath);
      return await readLatestCodexContextWindowUsage(sessionPath);
    } catch {
      // Local rollout evidence is diagnostic only and can never change an attempt outcome.
      return null;
    }
  }
}

const codexContextBaselineTokens = 12_000;
const scanChunkSize = 64 * 1024;

async function readLatestCodexContextWindowUsage(
  sessionPath: string,
): Promise<AttemptContextWindowUsage | null> {
  let handle;
  try {
    handle = await open(sessionPath, "r");
  } catch {
    return null;
  }
  try {
    const size = (await handle.stat()).size;
    let position = size;
    let leadingFragment = "";
    while (position > 0) {
      const length = Math.min(scanChunkSize, position);
      position -= length;
      const buffer = Buffer.allocUnsafe(length);
      await handle.read(buffer, 0, length, position);
      const lines = `${buffer.toString("utf8")}${leadingFragment}`.split(/\r?\n/u);
      leadingFragment = lines.shift() ?? "";
      const measurement = contextWindowUsageFromNewestLine(lines);
      if (measurement !== undefined) return measurement;
    }
    return contextWindowUsageFromNewestLine([leadingFragment]) ?? null;
  } catch {
    return null;
  } finally {
    try {
      await handle.close();
    } catch {
      // Closing fail-optional local evidence cannot affect the attempt outcome.
    }
  }
}

function contextWindowUsageFromNewestLine(lines: string[]): AttemptContextWindowUsage | undefined {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined || line.trim().length === 0) continue;
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
    } else if (entry.isFile() && entry.name.includes(threadId) && entry.name.endsWith(".jsonl")) {
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

function tokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
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

function defaultCodexSessionsRoot(environment: NodeJS.ProcessEnv, platformHome: () => string): string {
  const codexHome = environment.CODEX_HOME ??
    (environment.USERPROFILE === undefined
      ? join(platformHome(), ".codex")
      : join(environment.USERPROFILE, ".codex"));
  return join(codexHome, "sessions");
}

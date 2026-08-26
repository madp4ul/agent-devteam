import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type {
  AgentRunLifecycle,
  AgentRunOutcome,
  AgentRunRequest,
  AgentRuntime,
  AttemptContextWindowUsage,
  AttemptTranscriptAccess,
  AttemptTranscriptItem,
  AttemptTokenUsage,
} from "../../src/application/runtime-contract.ts";

const execFileAsync = promisify(execFile);

export class PausedRetryClock implements AutomationClock {
  now(): Date {
    return new Date("2026-01-01T12:00:00.000Z");
  }

  waitUntil(): Promise<void> {
    return new Promise(() => {});
  }
}

export class ControlledAgentRuntime implements AgentRuntime, AttemptTranscriptAccess {
  readonly requests: AgentRunRequest[] = [];
  readonly #transcripts = new Map<string, AttemptTranscriptItem[]>();
  readonly #usage = new Map<string, AttemptTokenUsage>();
  readonly #contextWindowUsage = new Map<string, AttemptContextWindowUsage>();
  readonly #startedThreadId: string | null;
  #complete: ((outcome: AgentRunOutcome) => void) | undefined;
  readonly #waiters: Array<{
    count: number;
    resolve: (request: AgentRunRequest) => void;
  }> = [];

  constructor(startedThreadId: string | null = null) {
    this.#startedThreadId = startedThreadId;
  }

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    if (this.#startedThreadId === null) lifecycle.started();
    else lifecycle.started(this.#startedThreadId);
    for (const waiter of this.#waiters.splice(0)) {
      const matching = this.requests[waiter.count - 1];
      if (matching !== undefined) waiter.resolve(matching);
      else this.#waiters.push(waiter);
    }
    return new Promise((resolve) => {
      this.#complete = resolve;
    });
  }

  waitForRequest(count: number): Promise<AgentRunRequest> {
    const existing = this.requests[count - 1];
    if (existing !== undefined) return Promise.resolve(existing);
    return new Promise((resolve) => this.#waiters.push({ count, resolve }));
  }

  complete(outcome: AgentRunOutcome): void {
    assert.ok(this.#complete, "No controlled agent run is awaiting completion");
    this.#complete(outcome);
    this.#complete = undefined;
  }

  setTranscript(attemptId: string, transcript: AttemptTranscriptItem[]): void {
    this.#transcripts.set(attemptId, structuredClone(transcript));
  }

  setUsage(attemptId: string, usage: AttemptTokenUsage): void {
    this.#usage.set(attemptId, structuredClone(usage));
  }

  setContextWindowUsage(attemptId: string, usage: AttemptContextWindowUsage): void {
    this.#contextWindowUsage.set(attemptId, structuredClone(usage));
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
}

export async function createCommittedTestRepository(name: string): Promise<{
  directory: string;
  repositoryPath: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), name));
  const repositoryPath = join(directory, "project");
  await execFileAsync("git", ["init", "--initial-branch=main", repositoryPath]);
  await writeFile(join(repositoryPath, "README.md"), "# Test project\n");
  await execFileAsync("git", ["-C", repositoryPath, "add", "README.md"]);
  await execFileAsync("git", [
    "-C",
    repositoryPath,
    "-c",
    "user.name=Coordination Test",
    "-c",
    "user.email=coordination@example.invalid",
    "commit",
    "-m",
    "Initial commit",
  ]);
  return { directory, repositoryPath };
}

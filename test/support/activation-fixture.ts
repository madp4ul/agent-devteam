import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { copyFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

import { CoordinationApplication } from "../../src/application/coordination-application.ts";
import type { AutomationClock } from "../../src/application/automation-contract.ts";
import type {
  AgentRunOutcome,
  AgentRunRequest,
  AgentRunLifecycle,
  AgentRuntime,
} from "../../src/application/runtime-contract.ts";
import {
  ControlledAgentRuntime,
  createCommittedTestRepository,
} from "./agent-runtime-fixture.ts";

export { ControlledAgentRuntime, PausedRetryClock } from "./agent-runtime-fixture.ts";

const execFileAsync = promisify(execFile);

export async function replacePersistedCoordinationStateWithIncompleteFixture(
  databasePath: string,
): Promise<void> {
  await copyFile(
    new URL("../fixtures/incomplete-current-coordination-state.fixture", import.meta.url),
    databasePath,
  );
}

export class ControlledRetryClock implements AutomationClock {
  #now: Date;
  readonly #waiters: Array<{ due: number; resolve(): void }> = [];

  constructor(now: string) {
    this.#now = new Date(now);
  }

  now(): Date {
    return new Date(this.#now);
  }

  waitUntil(instant: string): Promise<void> {
    if (Date.parse(instant) <= this.#now.getTime()) return Promise.resolve();
    return new Promise((resolve) => this.#waiters.push({ due: Date.parse(instant), resolve }));
  }

  advanceTo(instant: string): void {
    this.#now = new Date(instant);
    for (const waiter of this.#waiters.splice(0)) {
      if (waiter.due <= this.#now.getTime()) waiter.resolve();
      else this.#waiters.push(waiter);
    }
  }
}

export class CompletingAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started();
    return Promise.resolve({ status: "completed", summary: "Completed under control." });
  }
}

export class ConcurrentAgentRuntime implements AgentRuntime {
  readonly requests: AgentRunRequest[] = [];
  readonly #completions = new Map<string, (outcome: AgentRunOutcome) => void>();
  readonly #requestWaiters: Array<{
    count: number;
    resolve: (requests: AgentRunRequest[]) => void;
  }> = [];

  run(request: AgentRunRequest, lifecycle: AgentRunLifecycle): Promise<AgentRunOutcome> {
    this.requests.push(request);
    lifecycle.started(`controlled-thread-${request.activationId}`);
    for (const waiter of this.#requestWaiters.splice(0)) {
      if (this.requests.length >= waiter.count) {
        waiter.resolve(this.requests.slice(0, waiter.count));
      } else {
        this.#requestWaiters.push(waiter);
      }
    }
    return new Promise((resolve) => {
      this.#completions.set(request.activationId, resolve);
    });
  }

  waitForRequests(count: number): Promise<AgentRunRequest[]> {
    if (this.requests.length >= count) return Promise.resolve(this.requests.slice(0, count));
    return new Promise((resolve) => {
      this.#requestWaiters.push({ count, resolve });
    });
  }

  complete(activationId: string, outcome: AgentRunOutcome): void {
    const resolve = this.#completions.get(activationId);
    assert.ok(resolve, `No controlled run for activation ${activationId}`);
    this.#completions.delete(activationId);
    resolve(outcome);
  }
}

export async function createActivationFixture(name: string, startingRef = "main", agentProfile = ""): Promise<{
  definitionPath: string;
  databasePath: string;
  repositoryPath: string;
  workspaceRoot: string;
}> {
  const { directory, repositoryPath } = await createCommittedTestRepository(
    `coordination-${name}-`,
  );

  const definitionPath = join(directory, "process.yaml");
  await writeFile(join(directory, "implementer.md"), "Implement the requested task.\n");
  await writeFile(
    definitionPath,
    `schemaVersion: 1
name: Activation process
defaultTaskWorkspaceStartingRef: ${startingRef}
coordinationGuidance: Keep activation provenance exact.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tasks
    summary: Builds and verifies changes.
    instructions: ./implementer.md
${agentProfile}boards:
  - id: delivery
    name: Delivery
    guidance: Move work through delivery.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
`,
  );
  return {
    definitionPath,
    databasePath: join(directory, "coordination.sqlite3"),
    repositoryPath,
    workspaceRoot: join(directory, "workspaces"),
  };
}

export async function createResponsibilityActivationFixture(name: string): ReturnType<typeof createActivationFixture> {
  const fixture = await createActivationFixture(name);
  const directory = join(fixture.definitionPath, "..");
  await writeFile(join(directory, "reviewer.md"), "Review the requested task.\n");
  await writeFile(
    fixture.definitionPath,
    `schemaVersion: 1
name: Responsibility claim process
defaultTaskWorkspaceStartingRef: main
coordinationGuidance: Preserve distinct workflow responsibilities.
agents:
  - id: implementer
    name: Implementation Agent
    role: Implements scoped tasks
    summary: Builds and verifies changes.
    instructions: ./implementer.md
  - id: reviewer
    name: Review Agent
    role: Reviews scoped tasks
    summary: Reviews completed changes.
    instructions: ./reviewer.md
boards:
  - id: delivery
    name: Delivery
    guidance: Move work through delivery.
    columns:
      - id: backlog
        name: Backlog
      - id: implementation
        name: Implementation
        watchingAgent: implementer
      - id: verification
        name: Verification
        watchingAgent: implementer
      - id: review
        name: Review
        watchingAgent: reviewer
`,
  );
  return fixture;
}

export async function startMentionedAgentMoveScenario(
  name: string,
  options: { clock?: AutomationClock; multipleAgents?: boolean } = {},
) {
  const fixture = options.multipleAgents === true
    ? await createResponsibilityActivationFixture(name)
    : await createActivationFixture(name);
  const runtime = new ControlledAgentRuntime();
  const application = await CoordinationApplication.start({
    processDefinitionPath: fixture.definitionPath,
    databasePath: fixture.databasePath,
    ...(options.clock === undefined ? {} : { automationClock: options.clock }),
    runtimeDispatch: {
      projectRepositoryPath: fixture.repositoryPath,
      taskWorkspaceRoot: fixture.workspaceRoot,
      agentRuntime: runtime,
    },
  });
  const created = application.createTask({
    boardId: "delivery",
    columnId: "backlog",
    title: "Move mentioned work",
    description: "A mentioned specialist decides where primary responsibility belongs.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: `create-${name}`,
  });
  assert.equal(created.accepted, true);
  if (!created.accepted) throw new Error("Expected mentioned-agent scenario task creation");
  const mentioned = application.addTaskComment({
    taskId: created.task.id,
    body: "@implementer please inspect this work and route it as needed.",
    actor: { kind: "user", id: "paul" },
    idempotencyKey: `mention-${name}`,
  });
  assert.equal(mentioned.accepted, true);
  if (!mentioned.accepted) throw new Error("Expected mentioned-agent scenario comment");
  await application.resumeAutomation();
  const request = await runtime.waitForRequest(1);
  return { application, runtime, created, mentioned, request };
}

export async function readGlobalSafeDirectories(): Promise<string[]> {
  try {
    const result = await execFileAsync("git", ["config", "--global", "--get-all", "safe.directory"]);
    return result.stdout.split(/\r?\n/).filter((value) => value.length > 0);
  } catch (error) {
    if ((error as { code?: number }).code === 1) return [];
    throw error;
  }
}

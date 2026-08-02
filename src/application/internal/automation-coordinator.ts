import type {
  AgentRunAgent,
  AgentRunOutcome,
  AutomationView,
  ProcessBoardView,
  ResumeAutomationResult,
  RuntimeDispatchOptions,
  StartupView,
} from "../coordination-contract.ts";
import { GitTaskWorkspaceManager } from "./git-task-workspace.ts";
import type { RelationalCoordinationStore } from "./coordination-store.ts";

export interface AutomationProcessContext {
  name: string;
  guidance: string;
  definitionVersion: string;
  boards: ProcessBoardView[];
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
}

export interface AutomationCoordinatorOptions {
  store: RelationalCoordinationStore;
  startup: StartupView;
  runtimeDispatch?: RuntimeDispatchOptions;
  startingRef?: string;
  processContext?: AutomationProcessContext;
}

export class AutomationCoordinator {
  readonly #store: RelationalCoordinationStore;
  readonly #startup: StartupView;
  readonly #runtimeDispatch:
    | {
        agentRuntime: RuntimeDispatchOptions["agentRuntime"];
        workspaceManager: GitTaskWorkspaceManager;
      }
    | undefined;
  readonly #startingRef: string | undefined;
  readonly #processContext: AutomationProcessContext | undefined;
  #automation: AutomationView;
  #automationWork: Promise<void> = Promise.resolve();
  #automationPumpRunning = false;

  constructor(options: AutomationCoordinatorOptions) {
    this.#store = options.store;
    this.#startup = options.startup;
    this.#automation = options.startup.automation;
    this.#runtimeDispatch =
      options.runtimeDispatch === undefined
        ? undefined
        : {
            agentRuntime: options.runtimeDispatch.agentRuntime,
            workspaceManager: new GitTaskWorkspaceManager(
              options.runtimeDispatch.projectRepositoryPath,
              options.runtimeDispatch.taskWorkspaceRoot,
            ),
          };
    this.#startingRef = options.startingRef;
    this.#processContext = options.processContext;
  }

  query(): AutomationView {
    return this.#automation;
  }

  async resume(): Promise<ResumeAutomationResult> {
    if (this.#startup.mode === "configuration-error") {
      return {
        accepted: false,
        reason: "configuration-error",
        diagnostics: this.#startup.diagnostics,
      };
    }
    if (this.#runtimeDispatch === undefined && this.#store.hasWatchedColumns()) {
      return { accepted: false, reason: "runtime-unavailable" };
    }
    this.#store.resumeAutomation();
    this.#automation = { state: "running", attemptsMayStart: true };
    if (this.#runtimeDispatch !== undefined) {
      let markFirstDispatchStarted: (() => void) | undefined;
      const firstDispatchStarted = new Promise<void>((resolve) => {
        markFirstDispatchStarted = resolve;
      });
      this.#automationPumpRunning = true;
      this.#automationWork = this.runQueuedActivations(() => markFirstDispatchStarted?.()).finally(
        () => {
          this.#automationPumpRunning = false;
        },
      );
      try {
        await Promise.race([firstDispatchStarted, this.#automationWork]);
      } catch (error) {
        this.#store.pauseAutomation();
        this.#automation = { state: "paused", attemptsMayStart: false };
        this.#automationWork = Promise.resolve();
        return {
          accepted: false,
          reason: "runtime-start-failed",
          diagnostic: error instanceof Error ? error.message : "Agent runtime dispatch failed",
        };
      }
    }
    return { accepted: true, automation: this.#automation };
  }

  async waitForIdle(): Promise<void> {
    await this.#automationWork;
  }

  kick(): void {
    if (
      this.#automation.state !== "running" ||
      this.#runtimeDispatch === undefined ||
      this.#automationPumpRunning
    ) {
      return;
    }
    this.#automationPumpRunning = true;
    this.#automationWork = this.runQueuedActivations(() => {}).finally(() => {
      this.#automationPumpRunning = false;
    });
  }

  private async runQueuedActivations(onFirstDispatch: () => void): Promise<void> {
    if (this.#runtimeDispatch === undefined) return;
    let first = true;
    while (this.#automation.state === "running") {
      const runnable = this.#store.readNextRunnableActivation();
      if (runnable === undefined) return;
      const priorWorkspace = this.#store.readTaskWorkspace(runnable.task.id);
      const workspace = await this.#runtimeDispatch.workspaceManager.provision(
        runnable.task.id,
        this.#startingRef ?? "",
        priorWorkspace,
      );
      if (priorWorkspace === undefined) {
        this.#store.saveTaskWorkspace(runnable.task.id, workspace);
      }
      const attempt = this.#store.startAttempt(runnable.activation.id, workspace.path);
      const currentTask = this.#store.readTask(runnable.task.id);
      if (currentTask === undefined) throw new Error("Runnable task disappeared before dispatch");
      const process = this.#processContext;
      if (process === undefined) throw new Error("Runnable activation has no process context");
      const board = process.boards.find((candidate) => candidate.id === currentTask.boardId);
      if (board === undefined) throw new Error("Runnable task has no applied board context");
      let dispatchStarted = false;
      const outcomePromise = this.#runtimeDispatch.agentRuntime.run(
        {
          activationId: runnable.activation.id,
          agent: runnable.agent,
          process: {
            name: process.name,
            guidance: process.guidance,
            definitionVersion: process.definitionVersion,
          },
          board,
          collaborators: process.collaborators,
          reason: runnable.activation.reason,
          sourceEvent: runnable.sourceEvent,
          task: currentTask,
          workspace,
          attempt: {
            number: attempt.number,
            precedingOutcome: null,
            thread: "fresh",
            continuationMessage: null,
          },
        },
        {
          started: (threadId) => {
            dispatchStarted = true;
            if (threadId !== undefined) {
              this.#store.recordAttemptThreadId(
                attempt.id,
                attempt.runStartActivityId,
                threadId,
              );
            }
            if (first) {
              first = false;
              onFirstDispatch();
            }
          },
        },
      );
      let outcome: AgentRunOutcome;
      try {
        outcome = await outcomePromise;
      } catch (error) {
        this.#store.completeAttempt(attempt.id, {
          status: "failed",
          summary: error instanceof Error ? error.message : "Agent runtime dispatch failed",
        });
        throw error;
      }
      if (!dispatchStarted) {
        const failedOutcome: AgentRunOutcome =
          outcome.status === "failed"
            ? outcome
            : {
                status: "failed",
                summary: "Agent runtime completed without reporting that dispatch started",
              };
        this.#store.completeAttempt(attempt.id, failedOutcome);
        throw new Error(failedOutcome.summary);
      }
      this.#store.completeAttempt(attempt.id, outcome);
    }
  }
}

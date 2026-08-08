import type {
  AgentRunAgent,
  AgentRunOutcome,
  AutomationView,
  ProcessBoardView,
  ResumeAutomationResult,
  RuntimeStartupDiagnostic,
  RuntimeDispatchOptions,
  StartupView,
} from "../coordination-contract.ts";
import { GitTaskWorkspaceError, GitTaskWorkspaceManager } from "./git-task-workspace.ts";
import type { CoordinationTaskStore } from "./coordination-store.ts";
import type { ProcessStateStore } from "./process-state-store.ts";
import type { AutomationStateStore } from "./automation-state-store.ts";

export interface AutomationProcessContext {
  name: string;
  guidance: string;
  definitionVersion: string;
  boards: ProcessBoardView[];
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
}

export interface AutomationCoordinatorOptions {
  processStore: ProcessStateStore;
  taskStore: CoordinationTaskStore;
  automationStore: AutomationStateStore;
  startup: StartupView;
  runtimeDispatch?: RuntimeDispatchOptions;
  startingRef?: string;
  processContext?: AutomationProcessContext;
  runtimeDiagnostic?(diagnostic: RuntimeStartupDiagnostic): void;
}

export class AutomationCoordinator {
  readonly #processStore: ProcessStateStore;
  readonly #taskStore: CoordinationTaskStore;
  readonly #stateStore: AutomationStateStore;
  readonly #startup: StartupView;
  readonly #runtimeDispatch:
    | {
        agentRuntime: RuntimeDispatchOptions["agentRuntime"];
        workspaceManager: GitTaskWorkspaceManager;
      }
    | undefined;
  readonly #startingRef: string | undefined;
  readonly #processContext: AutomationProcessContext | undefined;
  readonly #runtimeDiagnostic: ((diagnostic: RuntimeStartupDiagnostic) => void) | undefined;
  #automation: AutomationView;
  #automationWork: Promise<void> = Promise.resolve();
  #automationPumpRunning = false;

  constructor(options: AutomationCoordinatorOptions) {
    this.#processStore = options.processStore;
    this.#taskStore = options.taskStore;
    this.#stateStore = options.automationStore;
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
    this.#runtimeDiagnostic = options.runtimeDiagnostic;
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
    if (this.#runtimeDispatch === undefined && this.#processStore.hasWatchedColumns()) {
      return { accepted: false, reason: "runtime-unavailable" };
    }
    this.#processStore.resumeAutomation();
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
        this.#processStore.pauseAutomation();
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
      const runnable = this.#stateStore.readNextRunnableActivation();
      if (runnable === undefined) return;
      const priorWorkspace = this.#stateStore.readTaskWorkspace(runnable.task.id);
      let workspace;
      try {
        workspace = await this.#runtimeDispatch.workspaceManager.provision(
          runnable.task.id,
          this.#startingRef ?? "",
          priorWorkspace,
        );
        if (priorWorkspace === undefined) {
          try {
            this.#stateStore.saveTaskWorkspace(runnable.task.id, workspace);
          } catch (error) {
            throw new GitTaskWorkspaceError(
              "workspace-state-persistence",
              "Could not persist the provisioned task workspace",
              error,
            );
          }
        }
      } catch (error) {
        const failure = this.#stateStore.recordActivationStartupFailure(
          runnable.activation.id,
          error instanceof GitTaskWorkspaceError ? error.boundary : "workspace-preparation",
          completeDiagnostic(error),
        );
        this.#runtimeDiagnostic?.(failure);
        throw new Error(failure.diagnostic, { cause: error });
      }
      const attempt = this.#stateStore.startAttempt(runnable.activation.id, workspace.path);
      const currentTask = this.#taskStore.readTask(runnable.task.id);
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
              this.#stateStore.recordAttemptThreadId(
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
        this.#stateStore.completeAttempt(attempt.id, {
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
        this.#stateStore.completeAttempt(attempt.id, failedOutcome);
        throw new Error(failedOutcome.summary);
      }
      this.#stateStore.completeAttempt(attempt.id, outcome);
    }
  }
}

function completeDiagnostic(error: unknown): string {
  if (!(error instanceof Error)) return "Task workspace startup failed";
  const causes: string[] = [error.message];
  let cause = error.cause;
  while (cause instanceof Error) {
    if (!causes.includes(cause.message)) causes.push(cause.message);
    cause = cause.cause;
  }
  return causes.join(": ");
}

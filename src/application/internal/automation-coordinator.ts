import type {
  ActiveRunView,
  AgentRunAgent,
  AgentRunOutcome,
  Actor,
  AutomationClock,
  AutomationView,
  AttemptTranscriptAccess,
  InterruptTaskResult,
  PauseAutomationResult,
  ProcessBoardView,
  ResumeAutomationResult,
  RuntimeStartupDiagnostic,
  RuntimeDispatchOptions,
  StartupView,
} from "../coordination-contract.ts";
import { GitTaskWorkspaceError, GitTaskWorkspaceManager } from "./git-task-workspace.ts";
import type { ProcessStateStore } from "./process-state-store.ts";
import type { AutomationStateStore, RunnableActivation } from "./automation-state-store.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";

export interface AutomationProcessContext {
  name: string;
  guidance: string;
  definitionVersion: string;
  boards: ProcessBoardView[];
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
}

export interface AutomationCoordinatorOptions {
  processStore: ProcessStateStore;
  taskProjections: TaskProjectionStore;
  automationStore: AutomationStateStore;
  startup: StartupView;
  runtimeDispatch?: RuntimeDispatchOptions;
  startingRef?: string;
  processContext?: AutomationProcessContext;
  runtimeDiagnostic?(diagnostic: RuntimeStartupDiagnostic): void;
  clock?: AutomationClock;
  transcriptAccess?: AttemptTranscriptAccess;
}

interface ActiveRunControl {
  attemptId: string;
  controller: AbortController;
  state: "running" | "interrupting";
  interruptedBy?: Actor & { kind: "user" };
  interruptIdempotencyKey?: string;
  confirmed: Promise<void>;
  confirm(): void;
  fail(error: unknown): void;
}

export class AutomationCoordinator {
  readonly #processStore: ProcessStateStore;
  readonly #taskProjections: TaskProjectionStore;
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
  readonly #clock: AutomationClock;
  readonly #transcriptAccess: AttemptTranscriptAccess | undefined;
  #automation: AutomationView;
  #automationWork: Promise<void> = Promise.resolve();
  #automationPumpRunning = false;
  #automationKickPending = false;
  #wakeAutomationPump: (() => void) | undefined;
  readonly #activeRuns = new Map<string, ActiveRunControl>();

  constructor(options: AutomationCoordinatorOptions) {
    this.#processStore = options.processStore;
    this.#taskProjections = options.taskProjections;
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
    this.#clock = options.clock ?? systemAutomationClock;
    this.#transcriptAccess = options.transcriptAccess;
  }

  query(): AutomationView {
    return this.#automation;
  }

  queryActiveRuns(): ActiveRunView[] {
    return this.#stateStore.readActiveRuns().map((run) => ({
      ...run,
      status: this.#activeRuns.get(run.taskId)?.state ?? "running",
    }));
  }

  async resume(beforeStart?: () => void): Promise<ResumeAutomationResult> {
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
    if (this.#automation.state === "pausing") {
      return { accepted: false, reason: "pause-draining" };
    }
    beforeStart?.();
    this.#processStore.resumeAutomation();
    this.#automation = { state: "running", attemptsMayStart: true };
    if (this.#runtimeDispatch !== undefined) {
      let markFirstDispatchStarted: (() => void) | undefined;
      const firstDispatchStarted = new Promise<void>((resolve) => {
        markFirstDispatchStarted = resolve;
      });
      this.#automationPumpRunning = true;
      this.#automationWork = this.runQueuedUntilSettled(() => markFirstDispatchStarted?.()).finally(
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

  pause(): PauseAutomationResult {
    this.#processStore.pauseAutomation();
    this.#automation = this.#activeRuns.size === 0
      ? { state: "paused", attemptsMayStart: false }
      : { state: "pausing", attemptsMayStart: false };
    const wake = this.#wakeAutomationPump;
    this.#wakeAutomationPump = undefined;
    wake?.();
    return { accepted: true, automation: this.#automation };
  }

  interruptTask(
    taskId: string,
    actor: Actor & { kind: "user" },
    idempotencyKey: string,
  ): InterruptTaskResult {
    const active = this.#activeRuns.get(taskId);
    if (active === undefined) return { accepted: false, reason: "not-running" };
    if (active.state === "interrupting") {
      return { accepted: false, reason: "already-interrupting" };
    }
    active.state = "interrupting";
    active.interruptedBy = actor;
    active.interruptIdempotencyKey = idempotencyKey;
    active.controller.abort();
    return { accepted: true, state: "interrupting", confirmed: active.confirmed };
  }

  kick(): void {
    if (this.#automation.state !== "running" || this.#runtimeDispatch === undefined) return;
    if (this.#automationPumpRunning) {
      this.#automationKickPending = true;
      const wake = this.#wakeAutomationPump;
      this.#wakeAutomationPump = undefined;
      wake?.();
      return;
    }
    this.#automationPumpRunning = true;
    this.#automationWork = this.runQueuedUntilSettled(() => {}).finally(() => {
      this.#automationPumpRunning = false;
    });
    void this.#automationWork.catch(() => {
      this.#processStore.pauseAutomation();
      this.#automation = { state: "paused", attemptsMayStart: false };
    });
  }

  private async runQueuedUntilSettled(onFirstDispatch: () => void): Promise<void> {
    let firstDispatch = onFirstDispatch;
    do {
      this.#automationKickPending = false;
      await this.runQueuedActivations(firstDispatch);
      firstDispatch = () => {};
    } while (this.#automationKickPending && this.#automation.state === "running");
  }

  private async runQueuedActivations(onFirstDispatch: () => void): Promise<void> {
    if (this.#runtimeDispatch === undefined) return;
    let first = true;
    let firstError: unknown;
    const inFlightCompletions = new Set<Promise<void>>();
    while (this.#automation.state === "running") {
      const now = this.#clock.now().toISOString();
      const runnable = this.#stateStore.readNextRunnableActivation(now);
      if (runnable !== undefined) {
        const { completion } = await this.dispatch(runnable, () => {
          if (!first) return;
          first = false;
          onFirstDispatch();
        });
        const tracked = completion
          .catch((error: unknown) => {
            firstError ??= error;
          })
          .finally(() => inFlightCompletions.delete(tracked));
        inFlightCompletions.add(tracked);
        continue;
      }
      if (inFlightCompletions.size === 0) {
        if (firstError !== undefined) throw firstError;
        const retryDueAt = this.#stateStore.readNextRetryDueAt(now);
        if (retryDueAt !== undefined) {
          let wake: (() => void) | undefined;
          const nextKick = new Promise<void>((resolve) => {
            wake = resolve;
            this.#wakeAutomationPump = resolve;
          });
          await Promise.race([this.#clock.waitUntil(retryDueAt), nextKick]);
          if (this.#wakeAutomationPump === wake) this.#wakeAutomationPump = undefined;
          continue;
        }
        return;
      }
      let wake: (() => void) | undefined;
      const nextKick = new Promise<void>((resolve) => {
        wake = resolve;
        this.#wakeAutomationPump = resolve;
      });
      await Promise.race([...inFlightCompletions, nextKick]);
      if (this.#wakeAutomationPump === wake) this.#wakeAutomationPump = undefined;
      if (firstError !== undefined) {
        await Promise.all(inFlightCompletions);
        throw firstError;
      }
    }
    await Promise.all(inFlightCompletions);
  }

  private async dispatch(
    runnable: RunnableActivation,
    onDispatchStarted: () => void,
  ): Promise<{ completion: Promise<void> }> {
    const runtimeDispatch = this.#runtimeDispatch;
    if (runtimeDispatch === undefined) return { completion: Promise.resolve() };
    const priorWorkspace = this.#stateStore.readTaskWorkspace(runnable.task.id);
    const precedingAttempt = runnable.activation.attempts.at(-1);
    const claimedAttempt = this.#stateStore.tryClaimActivation(
      runnable.activation.id,
      priorWorkspace?.path ?? runtimeDispatch.workspaceManager.pathFor(runnable.task.id),
      runnable.agent,
    );
    if (claimedAttempt === undefined) return { completion: Promise.resolve() };
    let workspace;
    try {
      workspace = await runtimeDispatch.workspaceManager.provision(
        runnable.task.id,
        this.#taskProjections.readTaskStartingRef(runnable.task.id) ?? this.#startingRef ?? "",
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
    if (this.#automation.state !== "running") {
      this.#stateStore.releaseDispatchClaim(
        claimedAttempt.id,
        runnable.activation.id,
        runnable.continuationMessage,
      );
      return { completion: Promise.resolve() };
    }
    const attempt = {
      ...claimedAttempt,
      ...this.#stateStore.startAttempt(claimedAttempt.id),
    };
    const controller = new AbortController();
    let confirmInterruption = () => {};
    let failInterruption = (_error: unknown) => {};
    const confirmed = new Promise<void>((resolve, reject) => {
      confirmInterruption = resolve;
      failInterruption = reject;
    });
    const activeRun: ActiveRunControl = {
      attemptId: attempt.id,
      controller,
      state: "running" as "running" | "interrupting",
      confirmed,
      confirm: confirmInterruption,
      fail: failInterruption,
    };
    this.#activeRuns.set(runnable.task.id, activeRun);
    const currentTask = this.#taskProjections.readTask(runnable.task.id);
    if (currentTask === undefined) throw new Error("Runnable task disappeared before dispatch");
    const process = this.#processContext;
    if (process === undefined) throw new Error("Runnable activation has no process context");
    const board = process.boards.find((candidate) => candidate.id === currentTask.boardId);
    if (board === undefined) throw new Error("Runnable task has no applied board context");
    onDispatchStarted();
    let outcomePromise: Promise<AgentRunOutcome>;
    try {
      outcomePromise = runtimeDispatch.agentRuntime.run(
        {
          activationId: runnable.activation.id,
          attemptId: attempt.id,
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
          ...(precedingAttempt?.threadId === null || precedingAttempt === undefined
            ? {}
            : { resumeThreadId: precedingAttempt.threadId }),
          attempt: {
            number: attempt.number,
            precedingOutcome: precedingAttempt?.outcome ?? null,
            thread: precedingAttempt?.threadId === null || precedingAttempt === undefined
              ? "fresh"
              : "resumed",
            continuationMessage: runnable.continuationMessage,
            ...(runnable.fullCompositionReason === undefined
              ? {}
              : { fullCompositionReason: runnable.fullCompositionReason }),
          },
        },
        {
          started: (threadId) => {
            if (threadId !== undefined) {
              this.#stateStore.recordAttemptThreadId(
                attempt.id,
                attempt.runStartActivityId,
                threadId,
              );
            }
          },
        },
        controller.signal,
      );
    } catch (error) {
      outcomePromise = Promise.reject(error);
    }
    const completion = (async () => {
      try {
        let outcome: AgentRunOutcome;
        try {
          outcome = await outcomePromise;
        } catch (error) {
          outcome = {
            status: "failed",
            summary: error instanceof Error ? error.message : "Agent runtime dispatch failed",
          };
        }
        const transcript = this.#transcriptAccess === undefined
          ? undefined
          : await this.#transcriptAccess.read(attempt.id) ?? undefined;
        if (activeRun.state === "interrupting") {
          if (
            activeRun.interruptedBy === undefined ||
            activeRun.interruptIdempotencyKey === undefined
          ) {
            throw new Error("Interrupting attempt has incomplete initiating command context");
          }
          this.#stateStore.interruptAttempt(
            attempt.id,
            this.#clock.now(),
            activeRun.interruptedBy,
            activeRun.interruptIdempotencyKey,
            transcript,
          );
        } else {
          this.#stateStore.completeAttempt(attempt.id, outcome, this.#clock.now(), true, transcript);
        }
        activeRun.confirm();
      } catch (error) {
        if (activeRun.state === "interrupting") activeRun.fail(error);
        else activeRun.confirm();
        throw error;
      } finally {
        this.#activeRuns.delete(runnable.task.id);
        if (this.#automation.state === "pausing" && this.#activeRuns.size === 0) {
          this.#automation = { state: "paused", attemptsMayStart: false };
        }
      }
    })();
    return { completion };
  }
}

const systemAutomationClock: AutomationClock = {
  now: () => new Date(),
  waitUntil: async (instant) => {
    const delay = Math.max(0, Date.parse(instant) - Date.now());
    await new Promise<void>((resolve) => setTimeout(resolve, delay));
  },
};

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

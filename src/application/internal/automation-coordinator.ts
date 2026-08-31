import type {
  ActiveRunView,
  AutomationClock,
  AutomationView,
  InterruptTaskResult,
  PauseAutomationResult,
  ResumeAutomationResult,
} from "../automation-contract.ts";
import type { ProcessBoardView, StartupView } from "../process-contract.ts";
import type {
  AgentRunAgent,
  AgentRunOutcome,
  AgentRunRequest,
  AttemptTranscriptAccess,
  RuntimeStartupDiagnostic,
  RuntimeDispatchOptions,
} from "../runtime-contract.ts";
import type { Actor } from "../task-contract.ts";
import { GitTaskWorkspaceError, GitTaskWorkspaceManager } from "./git-task-workspace.ts";
import type { ProcessStateStore } from "./process-state-store.ts";
import type { ActiveAttemptModule } from "./active-attempt-module.ts";
import type {
  ActivationSchedulingModule,
  ClaimedActivation,
} from "./activation-scheduling-module.ts";
import type { TaskProjectionStore } from "./task-projection-store.ts";
import type { ConversationContextDeliveryModule } from "./conversation-context-delivery-module.ts";
import type { ConversationAttachmentStore } from "./conversation-attachment-store.ts";
import type { ProcessModelPricingDefinition } from "./process-definition.ts";

export interface AutomationProcessContext {
  name: string;
  guidance: string;
  definitionVersion: string;
  modelPricing: ProcessModelPricingDefinition[];
  boards: ProcessBoardView[];
  collaborators: Array<Pick<AgentRunAgent, "id" | "name" | "role" | "summary">>;
}

export interface AutomationCoordinatorOptions {
  processStore: ProcessStateStore;
  taskProjections: TaskProjectionStore;
  activationScheduling: ActivationSchedulingModule;
  activeAttempts: ActiveAttemptModule;
  conversationContextDelivery: ConversationContextDeliveryModule;
  conversationAttachments: ConversationAttachmentStore;
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
  readonly #activationScheduling: ActivationSchedulingModule;
  readonly #activeAttempts: ActiveAttemptModule;
  readonly #conversationContextDelivery: ConversationContextDeliveryModule;
  readonly #conversationAttachments: ConversationAttachmentStore;
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
    this.#activationScheduling = options.activationScheduling;
    this.#activeAttempts = options.activeAttempts;
    this.#conversationContextDelivery = options.conversationContextDelivery;
    this.#conversationAttachments = options.conversationAttachments;
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
    return this.#activeAttempts.readActiveRuns().map((run) => ({
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
      const now = this.#clock.now();
      const claim = this.#activationScheduling.claimNextRunnable(
        now,
        (taskId) => this.#runtimeDispatch!.workspaceManager.pathFor(taskId),
      );
      if (claim !== undefined) {
        const { completion } = await this.dispatch(claim, () => {
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
        const retryDueAt = this.#activationScheduling.readNextRetryDueAt(now);
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
    claim: ClaimedActivation,
    onDispatchStarted: () => void,
  ): Promise<{ completion: Promise<void> }> {
    const runtimeDispatch = this.#runtimeDispatch;
    if (runtimeDispatch === undefined) return { completion: Promise.resolve() };
    const precedingAttempt = claim.activation.attempts.at(-1);
    const resumeThreadId = precedingAttempt?.threadId ?? claim.resumeThreadId;
    let workspace;
    try {
      workspace = await runtimeDispatch.workspaceManager.provision(
        claim.task.id,
        this.#taskProjections.readTaskStartingRef(claim.task.id) ?? this.#startingRef ?? "",
        claim.workspace,
      );
    } catch (error) {
      const failure = this.#activationScheduling.failUnstartedClaim(
        claim,
        error instanceof GitTaskWorkspaceError ? error.boundary : "workspace-preparation",
        completeDiagnostic(error),
      );
      this.#runtimeDiagnostic?.(failure);
      throw new Error(failure.diagnostic, { cause: error });
    }
    if (this.#automation.state !== "running") {
      this.#activationScheduling.releaseUnstartedClaim(claim);
      return { completion: Promise.resolve() };
    }
    const attempt = this.#activationScheduling.startPreparedAttempt(claim, workspace);
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
    this.#activeRuns.set(claim.task.id, activeRun);
    const currentTask = this.#taskProjections.readTask(claim.task.id);
    if (currentTask === undefined) throw new Error("Runnable task disappeared before dispatch");
    const process = this.#processContext;
    if (process === undefined) throw new Error("Runnable activation has no process context");
    const board = process.boards.find((candidate) => candidate.id === currentTask.boardId);
    if (board === undefined) throw new Error("Runnable task has no applied board context");
    const activationContext = this.#conversationContextDelivery.composeAndRecordActivationContext(
      claim.activation.id,
      currentTask,
    );
    let attachments: AgentRunRequest["attachments"] = [];
    let attachmentPreparationError: unknown;
    try {
      attachments = this.#conversationAttachments.prepareRuntimeAttachments(
        claim.activation.conversationId,
        claim.activation.reason.sourceEventId,
        attempt.id,
      );
    } catch (error) {
      attachmentPreparationError = error;
    }
    const pricing = claim.agent.model === undefined
      ? undefined
      : process.modelPricing.find(({ model }) => model === claim.agent.model);
    onDispatchStarted();
    let outcomePromise: Promise<AgentRunOutcome>;
    try {
      if (attachmentPreparationError !== undefined) throw attachmentPreparationError;
      outcomePromise = runtimeDispatch.agentRuntime.run(
        {
          activationId: claim.activation.id,
          attemptId: attempt.id,
          agent: claim.agent,
          process: {
            name: process.name,
            guidance: process.guidance,
            definitionVersion: process.definitionVersion,
          },
          board,
          collaborators: process.collaborators,
          reason: claim.activation.reason,
          sourceEvent: claim.sourceEvent,
          task: currentTask,
          workspace,
          activationContext,
          attachments,
          ...(resumeThreadId === null || resumeThreadId === undefined ? {} : { resumeThreadId }),
          attempt: {
            number: attempt.number,
            precedingOutcome: precedingAttempt?.outcome ?? null,
            thread: resumeThreadId === null || resumeThreadId === undefined ? "fresh" : "resumed",
            continuationMessage: claim.continuationMessage,
            ...(claim.fullCompositionReason === undefined
              ? {}
              : { fullCompositionReason: claim.fullCompositionReason }),
          },
        },
        {
          started: (threadId) => {
            if (threadId !== undefined) {
              this.#activeAttempts.recordThreadStarted(attempt.id, threadId);
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
        const usage = this.#transcriptAccess?.readUsage === undefined
          ? undefined
          : await this.#transcriptAccess.readUsage(attempt.id) ?? undefined;
        const contextWindowUsage = this.#transcriptAccess?.readContextWindowUsage === undefined
          ? undefined
          : await this.#transcriptAccess.readContextWindowUsage(attempt.id) ?? undefined;
        if (activeRun.state === "interrupting") {
          if (
            activeRun.interruptedBy === undefined ||
            activeRun.interruptIdempotencyKey === undefined
          ) {
            throw new Error("Interrupting attempt has incomplete initiating command context");
          }
          this.#activeAttempts.interrupt({
            attemptId: attempt.id,
            now: this.#clock.now(),
            actor: activeRun.interruptedBy,
            idempotencyKey: activeRun.interruptIdempotencyKey,
            ...(transcript === undefined ? {} : { transcript }),
            ...(usage === undefined ? {} : { usage }),
            ...(contextWindowUsage === undefined ? {} : { contextWindowUsage }),
            ...(pricing === undefined ? {} : { pricing }),
            ...(resumeThreadId === null || resumeThreadId === undefined
              ? {}
              : { resumedThreadId: resumeThreadId }),
          });
        } else {
          this.#activeAttempts.settle({
            attemptId: attempt.id,
            outcome,
            now: this.#clock.now(),
            ...(transcript === undefined ? {} : { transcript }),
            ...(usage === undefined ? {} : { usage }),
            ...(contextWindowUsage === undefined ? {} : { contextWindowUsage }),
            ...(pricing === undefined ? {} : { pricing }),
            ...(resumeThreadId === null || resumeThreadId === undefined
              ? {}
              : { resumedThreadId: resumeThreadId }),
          });
        }
        activeRun.confirm();
      } catch (error) {
        if (activeRun.state === "interrupting") activeRun.fail(error);
        else activeRun.confirm();
        throw error;
      } finally {
        this.#conversationAttachments.releaseRuntimeAttachments(attempt.id);
        this.#activeRuns.delete(claim.task.id);
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
